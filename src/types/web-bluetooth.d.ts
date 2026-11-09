/**
 * Web Bluetooth n'est pas décrit par la bibliothèque standard de TypeScript.
 * On déclare ici le strict sous-ensemble utilisé par le transport, plutôt que
 * d'ajouter une dépendance de types.
 */

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly uuid: string;
  readonly value?: DataView;
  /**
   * L'API réelle accepte tout `BufferSource`, mais cet alias de la
   * bibliothèque standard épingle son tampon à `ArrayBuffer` et rejette un
   * `Uint8Array<ArrayBufferLike>`. On ne déclare donc que l'usage réel.
   */
  writeValue(value: Uint8Array): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTService {
  readonly uuid: string;
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothLEScanFilter {
  name?: string;
  namePrefix?: string;
  services?: string[];
}

interface BluetoothRequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: string[];
  acceptAllDevices?: boolean;
}

interface Bluetooth {
  requestDevice(options?: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>;
  getAvailability?(): Promise<boolean>;
}

interface Navigator {
  readonly bluetooth: Bluetooth;
}
