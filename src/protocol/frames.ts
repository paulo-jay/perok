import { clamp, type Axes } from '../axes.js';
import { concat, enumArg, f32le, u8 } from './args.js';

/** Send without acknowledgement. */
const NO_ACK = 2;
/** Send with acknowledgement. */
const ACK = 4;

const PROJECT_COMMON = 0;
const PROJECT_MINIDRONE = 2;

const CLASS_PILOTING = 0;
/** `common.Settings`. */
const CLASS_COMMON_SETTINGS = 2;
/** `common.Common` — same id as Animations, but in another project. */
const CLASS_COMMON = 4;
/** `minidrone.Animations` — same id as Common, but in another project. */
const CLASS_ANIMATIONS = 4;
const CLASS_SPEED_SETTINGS = 1;
const CLASS_MEDIA_RECORD = 6;
const CLASS_PILOTING_SETTINGS = 8;
const CLASS_USB_ACCESSORY = 16;

const CMD_FLAT_TRIM = 0;
const CMD_TAKE_OFF = 1;
const CMD_PCMD = 2;
const CMD_LANDING = 3;
const CMD_EMERGENCY = 4;
const CMD_FLIP = 0;
const CMD_CURRENT_DATE = 1;
const CMD_ALL_SETTINGS = 0;
const CMD_ALL_STATES = 0;
const CMD_MAX_ALTITUDE = 0;
const CMD_MAX_TILT = 1;
const CMD_MAX_VERTICAL_SPEED = 0;
const CMD_MAX_ROTATION_SPEED = 1;
/** `MediaRecord.PictureV2`, which unlike `Picture` takes no argument. */
const CMD_PICTURE_V2 = 1;
const CMD_LIGHT_CONTROL = 0;

export type FlipDirection = 'front' | 'back' | 'right' | 'left';

/** Declaration order in the specification is the wire value. */
const FLIP_DIRECTIONS: Record<FlipDirection, number> = {
  front: 0,
  back: 1,
  right: 2,
  left: 3,
};

export type LightMode = 'fixed' | 'blinked' | 'oscillated';

const LIGHT_MODES: Record<LightMode, number> = {
  fixed: 0,
  blinked: 1,
  oscillated: 2,
};

/**
 * Date sent during the handshake. Taken verbatim from the spike that genuinely
 * flew this drone: do not replace it with today's date without testing in
 * flight.
 */
const HANDSHAKE_DATE = '2014-10-28';

/** Common header: type, sequence, project, class, command, then a zero byte. */
export function encodeFrame(
  dataType: number,
  seq: number,
  project: number,
  cls: number,
  cmd: number,
  payload: readonly number[] = [],
): Uint8Array {
  return new Uint8Array([dataType, seq & 0xff, project, cls, cmd, 0, ...payload]);
}

export function currentDate(seq: number): Uint8Array {
  const ascii = Array.from(HANDSHAKE_DATE, (c) => c.charCodeAt(0));
  return encodeFrame(ACK, seq, PROJECT_COMMON, CLASS_COMMON, CMD_CURRENT_DATE, [
    ...ascii,
    0,
  ]);
}

/*
 * The drone does not volunteer its settings: it sends a `…Changed` frame when
 * something changes, and answers these two requests with its whole current
 * state. Without them the flight limits and the accessory list never arrive,
 * and every control that waits on them stays inert.
 */

export function allSettings(seq: number): Uint8Array {
  return encodeFrame(ACK, seq, PROJECT_COMMON, CLASS_COMMON_SETTINGS, CMD_ALL_SETTINGS);
}

export function allStates(seq: number): Uint8Array {
  return encodeFrame(ACK, seq, PROJECT_COMMON, CLASS_COMMON, CMD_ALL_STATES);
}

export function flatTrim(seq: number): Uint8Array {
  return encodeFrame(NO_ACK, seq, PROJECT_MINIDRONE, CLASS_PILOTING, CMD_FLAT_TRIM);
}

export function takeOff(seq: number): Uint8Array {
  return encodeFrame(ACK, seq, PROJECT_MINIDRONE, CLASS_PILOTING, CMD_TAKE_OFF);
}

export function land(seq: number): Uint8Array {
  return encodeFrame(ACK, seq, PROJECT_MINIDRONE, CLASS_PILOTING, CMD_LANDING);
}

export function emergency(seq: number): Uint8Array {
  return encodeFrame(NO_ACK, seq, PROJECT_MINIDRONE, CLASS_PILOTING, CMD_EMERGENCY);
}

/** Defaults to the direction the spike actually flew. */
export function flip(seq: number, direction: FlipDirection = 'right'): Uint8Array {
  return encodeFrame(
    ACK,
    seq,
    PROJECT_MINIDRONE,
    CLASS_ANIMATIONS,
    CMD_FLIP,
    enumArg(FLIP_DIRECTIONS[direction]),
  );
}

/*
 * Flight limits. Sent with acknowledgement: a dropped setting would leave the
 * interface showing a value the drone never adopted.
 */

export function maxAltitude(seq: number, metres: number): Uint8Array {
  return encodeFrame(
    ACK, seq, PROJECT_MINIDRONE, CLASS_PILOTING_SETTINGS, CMD_MAX_ALTITUDE,
    f32le(metres),
  );
}

export function maxTilt(seq: number, degrees: number): Uint8Array {
  return encodeFrame(
    ACK, seq, PROJECT_MINIDRONE, CLASS_PILOTING_SETTINGS, CMD_MAX_TILT,
    f32le(degrees),
  );
}

export function maxVerticalSpeed(seq: number, metresPerSecond: number): Uint8Array {
  return encodeFrame(
    ACK, seq, PROJECT_MINIDRONE, CLASS_SPEED_SETTINGS, CMD_MAX_VERTICAL_SPEED,
    f32le(metresPerSecond),
  );
}

export function maxRotationSpeed(seq: number, degreesPerSecond: number): Uint8Array {
  return encodeFrame(
    ACK, seq, PROJECT_MINIDRONE, CLASS_SPEED_SETTINGS, CMD_MAX_ROTATION_SPEED,
    f32le(degreesPerSecond),
  );
}

/**
 * Triggers a capture. The image stays in the drone's own flash: there is no
 * file-transfer command in the minidrone BLE set.
 */
export function takePicture(seq: number): Uint8Array {
  return encodeFrame(ACK, seq, PROJECT_MINIDRONE, CLASS_MEDIA_RECORD, CMD_PICTURE_V2);
}

/**
 * Documented for the Cargo's USB lamp. Whether the Night's built-in LEDs
 * answer to it is exactly the open question this command is here to settle.
 */
export function lightControl(
  seq: number,
  id: number,
  mode: LightMode,
  intensity: number,
): Uint8Array {
  return encodeFrame(
    ACK, seq, PROJECT_MINIDRONE, CLASS_USB_ACCESSORY, CMD_LIGHT_CONTROL,
    concat(u8(id), enumArg(LIGHT_MODES[mode]), u8(intensity)),
  );
}

/**
 * Piloting setpoint: eleven meaningful bytes then eight zero bytes, 19 in all.
 *
 * The axes are written through a signed view over the same buffer, which
 * produces two's complement with no hand arithmetic — a sign error here sends
 * the drone the opposite way to the command.
 */
export function pcmd(seq: number, axes: Axes, active: boolean): Uint8Array {
  const frame = new Uint8Array(19);
  frame.set([
    NO_ACK,
    seq & 0xff,
    PROJECT_MINIDRONE,
    CLASS_PILOTING,
    CMD_PCMD,
    0,
    active ? 1 : 0,
  ]);

  const signed = new Int8Array(frame.buffer);
  signed[7] = clamp(axes.roll);
  signed[8] = clamp(axes.pitch);
  signed[9] = clamp(axes.yaw);
  signed[10] = clamp(axes.gaz);

  return frame;
}
