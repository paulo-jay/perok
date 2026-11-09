import { FakeTransport } from '../testing/fake-transport.js';
import type { Transport } from '../transport/ble.js';

/**
 * A drone that does not exist, for reproducing interface faults without
 * hardware.
 *
 * Loaded only by a dynamic import when the page is opened with `?fake=1`, so
 * none of this reaches the normal application bundle or the offline shell.
 * It emits the traffic a real session produces: a burst of state at connection
 * — which is what asking for AllSettings and AllStates provokes — then a
 * steady trickle of battery and flight-state frames.
 */

const LIMIT_FRAMES: readonly number[][] = [
  // MaxAltitudeChanged: current 3, min 1, max 10
  [4, 1, 2, 9, 0, 0, 0, 0, 0x40, 0x40, 0, 0, 0x80, 0x3f, 0, 0, 0x20, 0x41],
  // MaxTiltChanged: current 20, min 5, max 30
  [4, 1, 2, 9, 1, 0, 0, 0, 0xa0, 0x41, 0, 0, 0xa0, 0x40, 0, 0, 0xf0, 0x41],
  // MaxVerticalSpeedChanged: current 1, min 0.5, max 2
  [4, 1, 2, 5, 0, 0, 0, 0, 0x80, 0x3f, 0, 0, 0x00, 0x3f, 0, 0, 0x00, 0x40],
  // MaxRotationSpeedChanged: current 20, min 10, max 50
  [4, 1, 2, 5, 1, 0, 0, 0, 0xa0, 0x41, 0, 0, 0x20, 0x41, 0, 0, 0x48, 0x42],
];

const flightFrame = (state: number): number[] => [4, 1, 2, 3, 1, 0, state, 0, 0, 0];
const batteryFrame = (percent: number): number[] => [4, 1, 0, 5, 1, 0, percent];

export type FakeDrone = {
  transport: Transport;
  /** Frames emitted so far, for a harness to assert against. */
  readonly emitted: () => number;
  stop(): void;
};

export function createFakeDrone(options?: {
  /** Extra frames per second, on top of the connection burst. */
  ratePerSecond?: number;
  /** Size of the connection burst, standing in for the state dump. */
  burst?: number;
}): FakeDrone {
  const transport = new FakeTransport();
  const rate = options?.ratePerSecond ?? 5;
  const burst = options?.burst ?? 180;

  let emitted = 0;
  let battery = 92;
  let state = 0;

  const send = (frame: number[]): void => {
    emitted += 1;
    transport.emit('fb1b', ...frame);
  };

  // The connection burst, spread over a few frames so the page stays alive.
  let remaining = burst;
  const burstTimer = setInterval(() => {
    for (let i = 0; i < 12 && remaining > 0; i++, remaining -= 1) {
      send(LIMIT_FRAMES[remaining % LIMIT_FRAMES.length]!);
    }
    if (remaining <= 0) clearInterval(burstTimer);
  }, 16);

  const trickle = setInterval(() => {
    battery = battery > 5 ? battery - 1 : 92;
    send(batteryFrame(battery));
    state = (state + 1) % 5;
    send(flightFrame(state));
  }, Math.max(20, Math.round(1000 / rate)));

  return {
    transport,
    emitted: () => emitted,
    stop() {
      clearInterval(burstTimer);
      clearInterval(trickle);
    },
  };
}
