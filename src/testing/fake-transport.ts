import type { Transport } from '../transport/ble.js';
import { SequenceCounters } from '../protocol/sequence.js';

export type Written = { service: string; characteristic: string; frame: number[] };

/**
 * Transport double: makes the command loop and the drone model testable under
 * Node, with no Bluetooth.
 */
export class FakeTransport implements Transport {
  readonly counters = new SequenceCounters();
  readonly written: Written[] = [];
  readonly handlers = new Map<string, (data: DataView) => void>();
  failNextWrite = false;
  /** Persistent failures, to tell a one-off incident from a broken link. */
  failWrites = false;
  connected = true;

  async write(service: string, characteristic: string, frame: Uint8Array): Promise<void> {
    if (this.failWrites) throw new Error('write failed');
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('write failed');
    }
    this.written.push({ service, characteristic, frame: Array.from(frame) });
  }

  async subscribe(
    _service: string,
    characteristic: string,
    handler: (data: DataView) => void,
  ): Promise<void> {
    this.handlers.set(characteristic, handler);
  }

  disconnect(): void {
    this.connected = false;
  }

  /** Simulates a notification from the drone. */
  emit(characteristic: string, ...bytes: number[]): void {
    this.handlers.get(characteristic)?.(new DataView(new Uint8Array(bytes).buffer));
  }

  on(characteristic: string): Written[] {
    return this.written.filter((w) => w.characteristic === characteristic);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
