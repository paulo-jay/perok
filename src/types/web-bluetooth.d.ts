/**
 * Web Bluetooth is not described by TypeScript's standard library. Rather than
 * add a types dependency, we declare here the strict subset the transport uses.
 */

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly uuid: string;
  readonly value?: DataView;
  /**
   * The real API accepts any `BufferSource`, but that standard-library alias
   * now pins its backing buffer to `ArrayBuffer` and rejects a
   * `Uint8Array<ArrayBufferLike>`. So we declare only the actual usage.
   */
  writeValue(value: Uint8Array): Promise<void>;
  /**
   * Optional: `writeValue` is deprecated and Chrome treats it as a write
   * *with* response, which costs an acknowledgement round trip per frame. The
   * `fa00` characteristics are declared write-without-response, so the 50 ms
   * setpoint stream should use this. Declared optional so an engine that lacks
   * it falls back rather than failing.
   */
  writeValueWithoutResponse?(value: Uint8Array): Promise<void>;
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
