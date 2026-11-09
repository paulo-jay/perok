import { CHAR, NOTIFY_CHARS, SERVICE, uuid } from '../protocol/uuids.js';
import { allSettings, allStates, currentDate } from '../protocol/frames.js';
import { SequenceCounters } from '../protocol/sequence.js';

/**
 * Names advertised by Parrot minidrones. `Maclan_` is the targeted model:
 * Parrot truncates the advertised name, so a `Maclane_` filter finds nothing.
 */
const NAME_PREFIXES = [
  'Maclan_',
  'RS_',
  'Mars_',
  'Travis_',
  'Mambo_',
  'Blaze_',
  'Swat_',
  'Swing_',
];

/** Mandatory wait between the subscriptions and the handshake. */
const HANDSHAKE_DELAY_MS = 100;

export interface Transport {
  /**
   * Sequence counters for this connection. They live here rather than in the
   * drone model because the handshake already writes on `fa0b`: a separate
   * counter would restart `takeOff` at a sequence the drone has already
   * consumed, and may discard as a duplicate.
   */
  readonly counters: SequenceCounters;
  readonly connected: boolean;
  write(service: string, characteristic: string, frame: Uint8Array): Promise<void>;
  subscribe(
    service: string,
    characteristic: string,
    handler: (data: DataView) => void,
  ): Promise<void>;
  disconnect(): void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function requestDrone(): Promise<BluetoothDevice> {
  return navigator.bluetooth.requestDevice({
    filters: NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
    // Without this list, GATT access is denied after connecting.
    optionalServices: [SERVICE.CMD, SERVICE.NOTIFY, SERVICE.FD21, SERVICE.FD51].map(uuid),
  });
}

export async function openTransport(
  device: BluetoothDevice,
  onDisconnect: () => void,
): Promise<Transport> {
  if (!device.gatt) throw new Error('Device without a GATT server');

  const server = await device.gatt.connect();
  const services = new Map<string, BluetoothRemoteGATTService>();
  const characteristics = new Map<string, BluetoothRemoteGATTCharacteristic>();
  let live = true;

  async function resolveCharacteristic(
    service: string,
    characteristic: string,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    const cached = characteristics.get(characteristic);
    if (cached) return cached;

    let resolved = services.get(service);
    if (!resolved) {
      resolved = await server.getPrimaryService(uuid(service));
      services.set(service, resolved);
    }

    const found = await resolved.getCharacteristic(uuid(characteristic));
    characteristics.set(characteristic, found);
    return found;
  }

  function handleDisconnect(): void {
    live = false;
    onDisconnect();
  }

  device.addEventListener('gattserverdisconnected', handleDisconnect);

  const transport: Transport = {
    counters: new SequenceCounters(),

    get connected(): boolean {
      return live && server.connected;
    },

    async write(service, characteristic, frame) {
      const target = await resolveCharacteristic(service, characteristic);
      await target.writeValue(frame);
    },

    async subscribe(service, characteristic, handler) {
      const target = await resolveCharacteristic(service, characteristic);
      await target.startNotifications();
      target.addEventListener('characteristicvaluechanged', () => {
        if (target.value) handler(target.value);
      });
    },

    disconnect() {
      device.removeEventListener('gattserverdisconnected', handleDisconnect);
      live = false;
      server.disconnect();
    },
  };

  // Order imposed by the spike: sequential subscriptions, wait, handshake.
  for (const [service, characteristic] of NOTIFY_CHARS) {
    await transport.subscribe(service, characteristic, () => {});
  }

  await sleep(HANDSHAKE_DELAY_MS);

  const send = (build: (seq: number) => Uint8Array): Promise<void> =>
    transport.write(SERVICE.CMD, CHAR.CMD, build(transport.counters.next(CHAR.CMD)));

  await send(currentDate);

  // Then ask for the whole current state. The drone reports a setting when it
  // changes, not on connection, so without these two requests the flight
  // limits and the accessory list never arrive and every control that waits on
  // them stays inert.
  await send(allSettings);
  await send(allStates);

  return transport;
}
