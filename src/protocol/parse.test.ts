import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrame } from './parse.js';

const view = (...b: number[]) => new DataView(new Uint8Array(b).buffer);

test('parseFrame reads the header and locates the arguments', () => {
  const f = parseFrame(view(4, 1, 2, 9, 0, 0, 0, 0, 0x40, 0x40))!;
  assert.equal(f.project, 2);
  assert.equal(f.cls, 9);
  assert.equal(f.cmd, 0);
  assert.equal(f.readF32(0), 3);
});

test('parseFrame reads enums and bytes at an argument offset', () => {
  const f = parseFrame(view(4, 1, 2, 15, 0, 0, 7, 1, 0, 0, 0, 90, 0))!;
  assert.equal(f.readU8(0), 7);
  assert.equal(f.readEnum(1), 1);
  assert.equal(f.readU8(5), 90);
});

test('parseFrame rejects a frame too short to hold a header', () => {
  assert.equal(parseFrame(view(4, 1, 2)), null);
});

test('parseFrame yields zero rather than throwing past the end', () => {
  // Notifications are external input: a truncated frame must not crash the
  // handler that decodes it.
  const f = parseFrame(view(4, 1, 2, 9, 0, 0))!;
  assert.equal(f.readF32(0), 0);
  assert.equal(f.readU8(0), 0);
  assert.equal(f.readEnum(0), 0);
});
