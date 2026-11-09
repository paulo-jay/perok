/** Les UUID Parrot suivent un motif unique dont seul le segment court varie. */
export function uuid(short: string): string {
  return `9a66${short}-0800-9191-11e4-012d1540cb8e`;
}

export const SERVICE = {
  /** Écritures sans réponse : les commandes. */
  CMD: 'fa00',
  /** Notifications d'état. */
  NOTIFY: 'fb00',
  FD21: 'fd21',
  FD51: 'fd51',
} as const;

export const CHAR = {
  /** Consignes de pilotage, émises en continu. */
  PCMD: 'fa0a',
  /** Commandes : flat trim, décollage, atterrissage, looping. */
  CMD: 'fa0b',
  /** Coupure moteur, sur sa propre caractéristique. */
  EMERGENCY: 'fa0c',
  FLIGHT_STATE: 'fb0e',
  BATTERY: 'fb0f',
} as const;

/**
 * Caractéristiques à abonner à la connexion, dans cet ordre.
 * Le drone n'accepte la poignée de main qu'une fois ces abonnements posés.
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
