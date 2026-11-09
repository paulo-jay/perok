import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuid } from './uuids.js';
import { currentDate, flatTrim, takeOff, land, emergency, flip, pcmd } from './frames.js';

const bytes = (f: Uint8Array) => Array.from(f);

test('uuid composes the Parrot pattern', () => {
  assert.equal(uuid('fa0a'), '9a66fa0a-0800-9191-11e4-012d1540cb8e');
});

test('simple command frames', () => {
  assert.deepEqual(bytes(flatTrim(7)), [2, 7, 2, 0, 0, 0]);
  assert.deepEqual(bytes(takeOff(7)), [4, 7, 2, 0, 1, 0]);
  assert.deepEqual(bytes(land(7)), [4, 7, 2, 0, 3, 0]);
  assert.deepEqual(bytes(emergency(7)), [2, 7, 2, 0, 4, 0]);
  assert.deepEqual(bytes(flip(7)), [4, 7, 2, 4, 0, 0, 2, 0, 0, 0]);
});

test('handshake carries the current date as ASCII', () => {
  assert.deepEqual(bytes(currentDate(1)), [
    4, 1, 0, 4, 1, 0,
    0x32, 0x30, 0x31, 0x34, 0x2d, 0x31, 0x30, 0x2d, 0x32, 0x38, 0x00,
  ]);
});

test('pcmd at neutral: flag at 0, 19 bytes', () => {
  const f = pcmd(3, { roll: 0, pitch: 0, yaw: 0, gaz: 0 }, false);
  assert.equal(f.length, 19);
  assert.deepEqual(bytes(f), [2, 3, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('pcmd when active: flag at 1 and axes ordered roll, pitch, yaw, gaz', () => {
  const f = pcmd(3, { roll: 10, pitch: 20, yaw: 30, gaz: 40 }, true);
  assert.deepEqual(bytes(f).slice(0, 11), [2, 3, 2, 0, 2, 0, 1, 10, 20, 30, 40]);
});

test('pcmd encodes negative values as two s complement', () => {
  // A sign error here would invert the command.
  const f = pcmd(3, { roll: -50, pitch: -100, yaw: -1, gaz: 0 }, true);
  assert.deepEqual(bytes(f).slice(7, 11), [206, 156, 255, 0]);
});

test('pcmd clamps out-of-range values', () => {
  const f = pcmd(3, { roll: 150, pitch: -150, yaw: 0, gaz: 0 }, true);
  assert.deepEqual(bytes(f).slice(7, 9), [100, 156]);
});
