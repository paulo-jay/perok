export type FlightState =
  | 'landed'
  | 'takingOff'
  | 'hovering'
  | 'unknown'
  | 'landing'
  | 'cutOff';

/** L'ordre est celui de l'énumération du drone : l'index porte le sens. */
const STATES: readonly FlightState[] = [
  'landed',
  'takingOff',
  'hovering',
  'unknown',
  'landing',
  'cutOff',
];

/** La notification `fb0e` porte l'état de vol dans son octet d'index 6. */
const FLIGHT_STATE_OFFSET = 6;

export function decodeFlightState(data: DataView): FlightState {
  if (data.byteLength <= FLIGHT_STATE_OFFSET) return 'unknown';
  return STATES[data.getUint8(FLIGHT_STATE_OFFSET)] ?? 'unknown';
}

/** La notification `fb0f` porte le niveau de batterie dans son dernier octet. */
export function decodeBattery(data: DataView): number {
  if (data.byteLength === 0) return 0;
  return data.getUint8(data.byteLength - 1);
}

/** Le drone est en l'air pour les index 1 à 4 de l'énumération. */
export function isFlying(state: FlightState): boolean {
  const index = STATES.indexOf(state);
  return index >= 1 && index <= 4;
}
