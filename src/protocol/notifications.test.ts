import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeFlightState,
  decodeBattery,
  isFlying,
  decodeSettingRange,
  decodePictureOutcome,
  decodeLightState,
} from './notifications.js';
import { parseFrame } from './parse.js';

const view = (...b: number[]) => new DataView(new Uint8Array(b).buffer);

test('decodeFlightState reads byte 6', () => {
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 0)), 'landed');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 1)), 'takingOff');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 2)), 'hovering');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 4)), 'landing');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 5)), 'cutOff');
});

test('decodeFlightState falls back to unknown out of range or on a short frame', () => {
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 9)), 'unknown');
  assert.equal(decodeFlightState(view(0, 0, 0)), 'unknown');
});

test('decodeBattery reads the last byte', () => {
  assert.equal(decodeBattery(view(0, 0, 0, 82)), 82);
  assert.equal(decodeBattery(view(0, 0, 0, 9)), 9);
});

test('decodeSettingRange reads three floats', () => {
  // MaxAltitudeChanged: current 3, min 1, max 10.
  const f = parseFrame(
    view(4, 1, 2, 9, 0, 0, 0, 0, 0x40, 0x40, 0, 0, 0x80, 0x3f, 0, 0, 0x20, 0x41),
  )!;
  assert.deepEqual(decodeSettingRange(f), { current: 3, min: 1, max: 10 });
});

test('decodePictureOutcome distinguishes success from a named failure', () => {
  const ok = parseFrame(view(4, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))!;
  assert.deepEqual(decodePictureOutcome(ok), { taken: true, error: 'ok' });

  // event failed (1), error memoryFull (4)
  const full = parseFrame(view(4, 1, 2, 2, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0))!;
  assert.deepEqual(decodePictureOutcome(full), { taken: false, error: 'memoryFull' });
});

test('decodePictureOutcome names an unexpected error rather than throwing', () => {
  const weird = parseFrame(view(4, 1, 2, 2, 0, 0, 1, 0, 0, 0, 99, 0, 0, 0))!;
  assert.deepEqual(decodePictureOutcome(weird), { taken: false, error: 'unknown' });
});

test('decodeLightState reads the reported light', () => {
  const f = parseFrame(view(4, 1, 2, 15, 0, 0, 0, 1, 0, 0, 0, 80, 0))!;
  assert.deepEqual(decodeLightState(f), { id: 0, state: 1, intensity: 80 });
});

test('isFlying covers states 1 to 4', () => {
  assert.equal(isFlying('landed'), false);
  assert.equal(isFlying('cutOff'), false);
  assert.equal(isFlying('takingOff'), true);
  assert.equal(isFlying('hovering'), true);
  assert.equal(isFlying('landing'), true);
});
