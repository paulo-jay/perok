import { parseFrame, type ParsedFrame } from './parse.js';

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

/*
 * The notifications below are decoded from a parsed frame rather than from a
 * raw view: unlike the flight state and the battery, which arrive on their own
 * characteristics and are proven in flight, these are told apart by their
 * header.
 */

/**
 * Every settings-state notification reports the current value together with
 * the bounds the firmware will accept, so the interface never has to guess a
 * range — or hardcode one the drone would reject.
 */
export type SettingRange = { current: number; min: number; max: number };

export function decodeSettingRange(frame: ParsedFrame): SettingRange {
  return {
    current: frame.readF32(0),
    min: frame.readF32(4),
    max: frame.readF32(8),
  };
}

/** Declaration order in the specification is the wire value. */
const PICTURE_ERRORS: readonly string[] = [
  'ok',
  'unknown',
  'busy',
  'notAvailable',
  'memoryFull',
  'lowBattery',
];

export type PictureOutcome = { taken: boolean; error: string };

export function decodePictureOutcome(frame: ParsedFrame): PictureOutcome {
  const event = frame.readEnum(0);
  const error = frame.readEnum(4);
  return {
    taken: event === 0,
    error: PICTURE_ERRORS[error] ?? 'unknown',
  };
}

export type LightState = { id: number; state: number; intensity: number };

export function decodeLightState(frame: ParsedFrame): LightState {
  return {
    id: frame.readU8(0),
    state: frame.readEnum(1),
    intensity: frame.readU8(5),
  };
}

/** The settings the drone reports a range for. Owned here, used by the model. */
export type LimitName =
  | 'maxAltitude'
  | 'maxTilt'
  | 'maxVerticalSpeed'
  | 'maxRotationSpeed';

export type Notification =
  | { kind: 'limit'; name: LimitName; range: SettingRange }
  | { kind: 'picture'; outcome: PictureOutcome }
  | { kind: 'light'; state: LightState };

const PROJECT_MINIDRONE = 2;

const CLASS_SPEED_SETTINGS_STATE = 5;
const CLASS_PILOTING_SETTINGS_STATE = 9;
const CLASS_MEDIA_RECORD_EVENT = 2;
const CLASS_USB_ACCESSORY_STATE = 15;

/** `(class, command)` to limit name, for the four settings-state reports. */
const LIMIT_ROUTES: ReadonlyArray<readonly [number, number, LimitName]> = [
  [CLASS_PILOTING_SETTINGS_STATE, 0, 'maxAltitude'],
  [CLASS_PILOTING_SETTINGS_STATE, 1, 'maxTilt'],
  [CLASS_SPEED_SETTINGS_STATE, 0, 'maxVerticalSpeed'],
  [CLASS_SPEED_SETTINGS_STATE, 1, 'maxRotationSpeed'],
];

/**
 * Identifies a notification by its header rather than by the characteristic it
 * arrived on — that mapping is not documented anywhere we can rely on, so the
 * header is the only trustworthy discriminator.
 *
 * Returns null for anything this app does not act on, which is most traffic:
 * the drone reports a great deal more than we use.
 */
export function routeNotification(data: DataView): Notification | null {
  const frame = parseFrame(data);
  if (!frame || frame.project !== PROJECT_MINIDRONE) return null;

  for (const [cls, cmd, name] of LIMIT_ROUTES) {
    if (frame.cls === cls && frame.cmd === cmd) {
      return { kind: 'limit', name, range: decodeSettingRange(frame) };
    }
  }

  if (frame.cls === CLASS_MEDIA_RECORD_EVENT && frame.cmd === 0) {
    return { kind: 'picture', outcome: decodePictureOutcome(frame) };
  }

  if (frame.cls === CLASS_USB_ACCESSORY_STATE && frame.cmd === 0) {
    return { kind: 'light', state: decodeLightState(frame) };
  }

  return null;
}
