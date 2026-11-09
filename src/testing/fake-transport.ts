import type { Transport, TransportStats } from '../transport/ble.js';
import { SequenceCounters } from '../protocol/sequence.js';

export type Written = {
  service: string;
  characteristic: string;
  frame: number[];
  withoutResponse: boolean;
};

/**
 * Transport double: makes the command loop and the drone model testable under
 * Node, with no Bluetooth.
 */
export class FakeTransport implements Transport {
  readonly counters = new SequenceCounters();
  readonly written: Written[] = [];
  /** Notification listeners, fanned out exactly as the real transport does. */
  readonly handlers: ((data: DataView) => void)[] = [];
  readonly stats: TransportStats = {
    writes: 0,
    notifications: 0,
    lastWriteMs: 0,
    maxWriteMs: 0,
  };
  failNextWrite = false;
  /** Persistent failures, to tell a one-off incident from a broken link. */
  failWrites = false;
  connected = true;

  async write(
    service: string,
    characteristic: string,
    frame: Uint8Array,
    options?: { withoutResponse?: boolean },
  ): Promise<void> {
    if (this.failWrites) throw new Error('write failed');
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('write failed');
    }
    this.written.push({
      service,
      characteristic,
      frame: Array.from(frame),
      withoutResponse: options?.withoutResponse === true,
    });
    this.stats.writes += 1;
  }

  onNotification(handler: (data: DataView) => void): void {
    this.handlers.push(handler);
  }

  disconnect(): void {
    this.connected = false;
  }

  /**
   * Simulates a notification. The characteristic is kept for readability only:
   * routing is by frame header, exactly as in the real transport.
   */
  emit(_characteristic: string, ...bytes: number[]): void {
    const data = new DataView(new Uint8Array(bytes).buffer);
    this.stats.notifications += 1;
    for (const handler of this.handlers) handler(data);
  }

  on(characteristic: string): Written[] {
    return this.written.filter((w) => w.characteristic === characteristic);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
