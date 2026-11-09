import { CHAR, SERVICE } from '../protocol/uuids.js';
import { pcmd } from '../protocol/frames.js';
import type { SequenceCounters } from '../protocol/sequence.js';
import { NEUTRAL, type Axes } from '../axes.js';
import type { Transport } from '../transport/ble.js';

/** The drone expects a stream of setpoints, not impulses. */
const DEFAULT_INTERVAL_MS = 50;

/**
 * Number of consecutive write failures after which the link is considered
 * lost, even if the transport still believes it is connected. At 50 ms that
 * allows half a second of tolerance for transient incidents.
 */
const MAX_CONSECUTIVE_FAILURES = 10;

/**
 * Sends the current state of the four axes at a fixed interval, neutral
 * included. This continuous stream is what makes the drone controllable with
 * fine gradations, where one-off bursts produce lurching flight.
 */
export class CommandLoop {
  private axes: Axes = { ...NEUTRAL };
  private timer: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private sending = false;
  private skipped = 0;

  constructor(
    private readonly transport: Transport,
    private readonly counters: SequenceCounters,
    private readonly intervalMs: number = DEFAULT_INTERVAL_MS,
    /** Called when the loop gives up on its own: the link is lost. */
    private readonly onAbort?: () => void,
  ) {}

  get running(): boolean {
    return this.timer !== null;
  }

  /**
   * Ticks dropped because the previous write had not come back. A rising count
   * means the link is the limit, which is the honest signal to show a pilot —
   * and the difference between a saturated link and a frozen interface.
   */
  get skippedTicks(): number {
    return this.skipped;
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
    // Back to neutral: otherwise a later start would immediately command the
    // last requested movement.
    this.axes = { ...NEUTRAL };
  }

  private async tick(): Promise<void> {
    // A write slower than the interval must not get another round stacked on
    // top of it. This is the loop's entire flow control, and it only works
    // because the write is acknowledged — see the note below.
    if (this.sending) {
      this.skipped += 1;
      return;
    }
    this.sending = true;

    const { roll, pitch, yaw, gaz } = this.axes;
    const active = roll !== 0 || pitch !== 0 || yaw !== 0 || gaz !== 0;
    const frame = pcmd(this.counters.next(CHAR.PCMD), this.axes, active);

    try {
      // Acknowledged on purpose, although `fa0a` is declared
      // write-without-response. An unacknowledged write resolves when it is
      // queued, not when it is delivered: the loop then cannot tell a link
      // that is keeping up from one that is drowning, enqueues twenty frames a
      // second regardless, and the queue grows inside the browser until the
      // acknowledged command writes are stuck behind it — which is what made
      // the interface stop answering after a few take-offs. The
      // acknowledgement is the flow control, and the skip above is how it
      // degrades.
      await this.transport.write(SERVICE.CMD, CHAR.PCMD, frame);
      this.failures = 0;
    } catch {
      this.failures += 1;

      // An isolated refusal on a live link is transient: stopping here would
      // leave the drone airborne with dead sticks and a status bar still
      // reading "hovering". Give up only if the transport reports a
      // disconnect, or if failures pile up.
      if (!this.transport.connected || this.failures >= MAX_CONSECUTIVE_FAILURES) {
        this.stop();
        this.onAbort?.();
      }
    } finally {
      this.sending = false;
    }
  }
}
