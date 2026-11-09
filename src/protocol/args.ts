/**
 * Typed command arguments.
 *
 * Parrot's command specification types every argument, and several of them are
 * not bytes: the flight limits take IEEE-754 floats and every enum is four
 * bytes wide. Each helper returns a plain byte array so the command builders
 * stay declarative.
 *
 * Wire format, from `xml/minidrone.xml`: `u8`/`i8` one byte; `u16`/`i16` two
 * bytes little-endian; `u32`/`i32`/`enum` four bytes little-endian; `float`
 * four bytes IEEE-754 little-endian; `string` null-terminated ASCII.
 */

function bytesOf(size: number, write: (view: DataView) => void): number[] {
  const view = new DataView(new ArrayBuffer(size));
  write(view);
  return Array.from(new Uint8Array(view.buffer));
}

export function u8(value: number): number[] {
  return bytesOf(1, (v) => v.setUint8(0, value));
}

export function i8(value: number): number[] {
  return bytesOf(1, (v) => v.setInt8(0, value));
}

export function u16le(value: number): number[] {
  return bytesOf(2, (v) => v.setUint16(0, value, true));
}

export function i16le(value: number): number[] {
  return bytesOf(2, (v) => v.setInt16(0, value, true));
}

export function u32le(value: number): number[] {
  return bytesOf(4, (v) => v.setUint32(0, value, true));
}

/** ARSDK enums travel as four little-endian bytes, not as a single byte. */
export function enumArg(value: number): number[] {
  return u32le(value);
}

/**
 * The little-endian flag is the whole point: a big-endian slip would send a
 * wrong but plausible flight limit that the firmware may well accept.
 */
export function f32le(value: number): number[] {
  return bytesOf(4, (v) => v.setFloat32(0, value, true));
}

export function cstring(value: string): number[] {
  return [...Array.from(value, (c) => c.charCodeAt(0) & 0xff), 0];
}

export function concat(...parts: number[][]): number[] {
  return parts.flat();
}
