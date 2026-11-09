import { parseFrame, type ParsedFrame } from './parse.js';

export type FlightState =
  | 'landed'
  | 'takingOff'
  | 'hovering'
  | 'flying'
  | 'landing'
  | 'emergency'
  | 'rolling'
  | 'init'
  /** Not a drone value: our answer when a frame does not carry a known one. */
  | 'unknown';

/**
 * `FlyingStateChanged` in `minidrone.xml`, in declaration order. The spike had
 * index 3 as "unknown" and index 5 as a cut-off; the specification says
 * `flying` and `emergency`. The specification wins — index 3 is the state a
 * drone reports for most of a real flight.
 */
const STATES: readonly FlightState[] = [
  'landed',
  'takingOff',
  'hovering',
  'flying',
  'landing',
  'emergency',
  'rolling',
  'init',
];

/** Arguments start at byte 6, and the state enum's first byte carries it. */
const FLIGHT_STATE_OFFSET = 6;

function stateFromIndex(index: number): FlightState {
  return STATES[index] ?? 'unknown';
}

export function decodeFlightState(data: DataView): FlightState {
  if (data.byteLength <= FLIGHT_STATE_OFFSET) return 'unknown';
  return stateFromIndex(data.getUint8(FLIGHT_STATE_OFFSET));
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
  | { kind: 'flight'; state: FlightState }
  | { kind: 'battery'; percent: number }
  | { kind: 'limit'; name: LimitName; range: SettingRange }
  | { kind: 'picture'; outcome: PictureOutcome }
  | { kind: 'light'; state: LightState | null };

const PROJECT_COMMON = 0;
const PROJECT_MINIDRONE = 2;

/** Class ids repeat across projects, so the project must be checked first. */
const CLASS_COMMON_STATE = 5;

const CLASS_MEDIA_RECORD_EVENT = 2;
const CLASS_PILOTING_STATE = 3;
const CLASS_SPEED_SETTINGS_STATE = 5;
const CLASS_PILOTING_SETTINGS_STATE = 9;
const CLASS_USB_ACCESSORY_STATE = 15;

/** `list_flags` bitfield on a MAP_ITEM notification. */
const LIST_FLAG_EMPTY = 0x04;
const LIST_FLAG_REMOVE = 0x08;

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
  if (!frame) return null;

  if (frame.project === PROJECT_COMMON) {
    if (frame.cls === CLASS_COMMON_STATE && frame.cmd === 1) {
      return { kind: 'battery', percent: frame.readU8(0) };
    }
    return null;
  }

  if (frame.project !== PROJECT_MINIDRONE) return null;

  // The flight state must be identified by its command, not by its position.
  // `PilotingState` also carries `AlertStateChanged`, whose `cut_out` value is
  // 2 — the same byte as `hovering`.
  if (frame.cls === CLASS_PILOTING_STATE && frame.cmd === 1) {
    return { kind: 'flight', state: stateFromIndex(frame.readEnum(0)) };
  }

  for (const [cls, cmd, name] of LIMIT_ROUTES) {
    if (frame.cls === cls && frame.cmd === cmd) {
      return { kind: 'limit', name, range: decodeSettingRange(frame) };
    }
  }

  if (frame.cls === CLASS_MEDIA_RECORD_EVENT && frame.cmd === 0) {
    return { kind: 'picture', outcome: decodePictureOutcome(frame) };
  }

  if (frame.cls === CLASS_USB_ACCESSORY_STATE && frame.cmd === 0) {
    const flags = frame.readU8(6);

    // "Empty: indicate the list is empty (implies First/Last). All other
    // arguments should be ignored." A drone with no accessory is the likeliest
    // sender, and mistaking it for a light would make the LED probe answer yes
    // where the drone said no.
    if (flags & LIST_FLAG_EMPTY) return null;
    if (flags & LIST_FLAG_REMOVE) return { kind: 'light', state: null };

    return { kind: 'light', state: decodeLightState(frame) };
  }

  return null;
}
