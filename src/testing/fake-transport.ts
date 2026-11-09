import type { Transport } from '../transport/ble.js';
import { SequenceCounters } from '../protocol/sequence.js';

export type Written = { service: string; characteristic: string; frame: number[] };

/**
 * Doublure de transport : rend la boucle de commande et le modèle du drone
 * testables sous Node, sans Bluetooth.
 */
export class FakeTransport implements Transport {
  readonly counters = new SequenceCounters();
  readonly written: Written[] = [];
  readonly handlers = new Map<string, (data: DataView) => void>();
  failNextWrite = false;
  connected = true;

  async write(service: string, characteristic: string, frame: Uint8Array): Promise<void> {
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

  /** Simule une notification du drone. */
  emit(characteristic: string, ...bytes: number[]): void {
    this.handlers.get(characteristic)?.(new DataView(new Uint8Array(bytes).buffer));
  }

  on(characteristic: string): Written[] {
    return this.written.filter((w) => w.characteristic === characteristic);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
