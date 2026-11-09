/** Parrot UUIDs follow a single pattern; only the short segment varies. */
export function uuid(short: string): string {
  return `9a66${short}-0800-9191-11e4-012d1540cb8e`;
}

export const SERVICE = {
  /** Write-without-response characteristics: the commands. */
  CMD: 'fa00',
  /** State notifications. */
  NOTIFY: 'fb00',
  FD21: 'fd21',
  FD51: 'fd51',
} as const;

export const CHAR = {
  /** Piloting setpoints, sent continuously. */
  PCMD: 'fa0a',
  /** Commands: flat trim, take off, land, flip. */
  CMD: 'fa0b',
  /** Emergency motor cut-off, on its own characteristic. */
  EMERGENCY: 'fa0c',
  FLIGHT_STATE: 'fb0e',
  BATTERY: 'fb0f',
} as const;

/**
 * Characteristics to subscribe to on connection, in this order.
 * The drone only accepts the handshake once these subscriptions are in place.
 */
export const NOTIFY_CHARS: ReadonlyArray<readonly [string, string]> = [
  ['fb00', 'fb0f'],
  ['fb00', 'fb0e'],
  ['fb00', 'fb1b'],
  ['fb00', 'fb1c'],
  ['fd21', 'fd22'],
  ['fd21', 'fd23'],
  ['fd21', 'fd24'],
  ['fd51', 'fd52'],
  ['fd51', 'fd53'],
  ['fd51', 'fd54'],
];
