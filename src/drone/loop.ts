import { CHAR, SERVICE } from '../protocol/uuids.js';
import { pcmd } from '../protocol/frames.js';
import type { SequenceCounters } from '../protocol/sequence.js';
import { NEUTRAL, type Axes } from '../axes.js';
import type { Transport } from '../transport/ble.js';

/** Le drone attend un flux de consignes, pas des impulsions. */
const DEFAULT_INTERVAL_MS = 50;

/**
 * Émet l'état courant des quatre axes à intervalle fixe, y compris au neutre.
 * C'est cette émission continue qui rend le pilotage dosable, là où des
 * rafales ponctuelles donnent un vol saccadé.
 */
export class CommandLoop {
  private axes: Axes = { ...NEUTRAL };
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly transport: Transport,
    private readonly counters: SequenceCounters,
    private readonly intervalMs: number = DEFAULT_INTERVAL_MS,
  ) {}

  get running(): boolean {
    return this.timer !== null;
  }

  setAxes(axes: Axes): void {
    this.axes = { ...axes };
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    // Repartir au neutre : sinon un démarrage ultérieur commanderait
    // immédiatement le dernier mouvement demandé.
    this.axes = { ...NEUTRAL };
  }

  private async tick(): Promise<void> {
    const { roll, pitch, yaw, gaz } = this.axes;
    const active = roll !== 0 || pitch !== 0 || yaw !== 0 || gaz !== 0;
    const frame = pcmd(this.counters.next(CHAR.PCMD), this.axes, active);

    try {
      await this.transport.write(SERVICE.CMD, CHAR.PCMD, frame);
    } catch {
      // Lien rompu ou drone éteint : cesser d'émettre plutôt que d'accumuler
      // des rejets non traités.
      this.stop();
    }
  }
}
