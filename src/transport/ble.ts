import { CHAR, NOTIFY_CHARS, SERVICE, uuid } from '../protocol/uuids.js';
import { currentDate } from '../protocol/frames.js';
import { SequenceCounters } from '../protocol/sequence.js';

/**
 * Noms annoncés par les minidrones Parrot. `Maclan_` est celui du modèle
 * visé : Parrot tronque le nom, un filtre `Maclane_` ne trouve rien.
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

/** Attente imposée entre les abonnements et la poignée de main. */
const HANDSHAKE_DELAY_MS = 100;

export interface Transport {
  /**
   * Compteurs de séquence de la connexion. Ils sont portés ici, et non par le
   * modèle du drone, parce que la poignée de main écrit déjà sur `fa0b` :
   * un compteur distinct ferait repartir `takeOff` à une séquence déjà
   * consommée, que le drone peut écarter comme un doublon.
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
    // Sans cette liste, l'accès GATT est refusé après la connexion.
    optionalServices: [SERVICE.CMD, SERVICE.NOTIFY, SERVICE.FD21, SERVICE.FD51].map(uuid),
  });
}

export async function openTransport(
  device: BluetoothDevice,
  onDisconnect: () => void,
): Promise<Transport> {
  if (!device.gatt) throw new Error('Appareil sans serveur GATT');

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

  // Ordre imposé par le spike : abonnements séquentiels, attente, poignée de main.
  for (const [service, characteristic] of NOTIFY_CHARS) {
    await transport.subscribe(service, characteristic, () => {});
  }

  await sleep(HANDSHAKE_DELAY_MS);
  await transport.write(SERVICE.CMD, CHAR.CMD, currentDate(transport.counters.next(CHAR.CMD)));

  return transport;
}
