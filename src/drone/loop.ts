import { CHAR, SERVICE } from '../protocol/uuids.js';
import { pcmd } from '../protocol/frames.js';
import type { SequenceCounters } from '../protocol/sequence.js';
import { NEUTRAL, type Axes } from '../axes.js';
import type { Transport } from '../transport/ble.js';

/** Le drone attend un flux de consignes, pas des impulsions. */
const DEFAULT_INTERVAL_MS = 50;

/**
 * Nombre d'échecs d'écriture consécutifs au-delà duquel on considère le lien
 * perdu, même si le transport se croit encore connecté. À 50 ms, cela laisse
 * une demi-seconde de tolérance aux incidents transitoires.
 */
const MAX_CONSECUTIVE_FAILURES = 10;

/**
 * Émet l'état courant des quatre axes à intervalle fixe, y compris au neutre.
 * C'est cette émission continue qui rend le pilotage dosable, là où des
 * rafales ponctuelles donnent un vol saccadé.
 */
export class CommandLoop {
  private axes: Axes = { ...NEUTRAL };
  private timer: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private sending = false;

  constructor(
    private readonly transport: Transport,
    private readonly counters: SequenceCounters,
    private readonly intervalMs: number = DEFAULT_INTERVAL_MS,
    /** Appelé quand la boucle renonce d'elle-même : le lien est perdu. */
    private readonly onAbort?: () => void,
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
    this.failures = 0;
    // Repartir au neutre : sinon un démarrage ultérieur commanderait
    // immédiatement le dernier mouvement demandé.
    this.axes = { ...NEUTRAL };
  }

  private async tick(): Promise<void> {
    // Une écriture plus lente que l'intervalle ne doit pas voir un second tour
    // s'empiler par-dessus elle.
    if (this.sending) return;
    this.sending = true;

    const { roll, pitch, yaw, gaz } = this.axes;
    const active = roll !== 0 || pitch !== 0 || yaw !== 0 || gaz !== 0;
    const frame = pcmd(this.counters.next(CHAR.PCMD), this.axes, active);

    try {
      await this.transport.write(SERVICE.CMD, CHAR.PCMD, frame);
      this.failures = 0;
    } catch {
      this.failures += 1;

      // Un refus isolé sur un lien vivant est transitoire : s'arrêter là
      // laisserait le drone en vol avec des manches morts et une interface qui
      // affiche encore « stationnaire ». On ne renonce que si le transport se
      // déclare rompu, ou si les échecs s'enchaînent.
      if (!this.transport.connected || this.failures >= MAX_CONSECUTIVE_FAILURES) {
        this.stop();
        this.onAbort?.();
      }
    } finally {
      this.sending = false;
    }
  }
}
