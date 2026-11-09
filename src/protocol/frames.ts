import { clamp, type Axes } from '../axes.js';

/** Send without acknowledgement. */
const NO_ACK = 2;
/** Send with acknowledgement. */
const ACK = 4;

const PROJECT_COMMON = 0;
const PROJECT_MINIDRONE = 2;

const CLASS_PILOTING = 0;
/** `common.Common` — same id as Animations, but in another project. */
const CLASS_COMMON = 4;
/** `minidrone.Animations` — same id as Common, but in another project. */
const CLASS_ANIMATIONS = 4;

const CMD_FLAT_TRIM = 0;
const CMD_TAKE_OFF = 1;
const CMD_PCMD = 2;
const CMD_LANDING = 3;
const CMD_EMERGENCY = 4;
const CMD_FLIP = 0;
const CMD_CURRENT_DATE = 1;

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

/** Direction is a four-byte integer; 2 is the value used by the spike. */
export function flip(seq: number, direction = 2): Uint8Array {
  return encodeFrame(ACK, seq, PROJECT_MINIDRONE, CLASS_ANIMATIONS, CMD_FLIP, [
    direction,
    0,
    0,
    0,
  ]);
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
