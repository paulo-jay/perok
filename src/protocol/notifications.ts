export type FlightState =
  | 'landed'
  | 'takingOff'
  | 'hovering'
  | 'unknown'
  | 'landing'
  | 'cutOff';

/** The order is the drone's own enumeration: the index carries the meaning. */
const STATES: readonly FlightState[] = [
  'landed',
  'takingOff',
  'hovering',
  'unknown',
  'landing',
  'cutOff',
];

/** The `fb0e` notification carries the flight state in byte 6. */
const FLIGHT_STATE_OFFSET = 6;

export function decodeFlightState(data: DataView): FlightState {
  if (data.byteLength <= FLIGHT_STATE_OFFSET) return 'unknown';
  return STATES[data.getUint8(FLIGHT_STATE_OFFSET)] ?? 'unknown';
}

/** The `fb0f` notification carries the battery level in its last byte. */
export function decodeBattery(data: DataView): number {
  if (data.byteLength === 0) return 0;
  return data.getUint8(data.byteLength - 1);
}

/** The drone is airborne for indices 1 to 4 of the enumeration. */
export function isFlying(state: FlightState): boolean {
  const index = STATES.indexOf(state);
  return index >= 1 && index <= 4;
}
