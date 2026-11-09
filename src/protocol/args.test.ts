import { test } from 'node:test';
import assert from 'node:assert/strict';
import { u8, i8, u16le, i16le, u32le, enumArg, f32le, cstring, concat } from './args.js';

test('single-byte arguments', () => {
  assert.deepEqual(u8(0), [0]);
  assert.deepEqual(u8(255), [255]);
  assert.deepEqual(i8(-1), [255]);
  assert.deepEqual(i8(-128), [128]);
});

test('multi-byte integers are little-endian', () => {
  assert.deepEqual(u16le(0x1234), [0x34, 0x12]);
  assert.deepEqual(i16le(-2), [0xfe, 0xff]);
  assert.deepEqual(u32le(0x11223344), [0x44, 0x33, 0x22, 0x11]);
});

test('enums are four little-endian bytes', () => {
  // The spike's right flip was [2, 0, 0, 0].
  assert.deepEqual(enumArg(2), [2, 0, 0, 0]);
  assert.deepEqual(enumArg(0), [0, 0, 0, 0]);
});

test('floats are IEEE-754 little-endian', () => {
  // A byte-order slip would send a wrong but plausible flight limit.
  assert.deepEqual(f32le(3), [0x00, 0x00, 0x40, 0x40]);
  assert.deepEqual(f32le(20), [0x00, 0x00, 0xa0, 0x41]);
  assert.deepEqual(f32le(1), [0x00, 0x00, 0x80, 0x3f]);
  assert.deepEqual(f32le(-1.5), [0x00, 0x00, 0xc0, 0xbf]);
});

test('strings are null-terminated ASCII', () => {
  assert.deepEqual(cstring('ab'), [0x61, 0x62, 0x00]);
});

test('concat joins argument groups in order', () => {
  assert.deepEqual(concat(u8(1), enumArg(2), u8(3)), [1, 2, 0, 0, 0, 3]);
});
