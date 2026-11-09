/**
 * Notification frame parser.
 *
 * A notification carries the same header as a command — `[dataType, sequence,
 * project, class, command, 0]` — followed by its arguments. Reading that header
 * is what lets one handler serve every notification, instead of guessing from
 * which BLE characteristic a frame happened to arrive on; that mapping is not
 * documented anywhere we can rely on.
 *
 * Argument offsets are relative to the first argument byte.
 */

const HEADER_LENGTH = 6;

export type ParsedFrame = {
  project: number;
  cls: number;
  cmd: number;
  readU8(index: number): number;
  readEnum(index: number): number;
  readF32(index: number): number;
};

export function parseFrame(data: DataView): ParsedFrame | null {
  if (data.byteLength < HEADER_LENGTH) return null;

  /** A truncated frame is external input, not a bug: answer zero, never throw. */
  const fits = (index: number, size: number): boolean =>
    HEADER_LENGTH + index + size <= data.byteLength;

  return {
    project: data.getUint8(2),
    cls: data.getUint8(3),
    cmd: data.getUint8(4),

    readU8(index) {
      return fits(index, 1) ? data.getUint8(HEADER_LENGTH + index) : 0;
    },

    readEnum(index) {
      return fits(index, 4) ? data.getUint32(HEADER_LENGTH + index, true) : 0;
    },

    readF32(index) {
      return fits(index, 4) ? data.getFloat32(HEADER_LENGTH + index, true) : 0;
    },
  };
}
