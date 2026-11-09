import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFlightState, decodeBattery, isFlying } from './notifications.js';

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

test('isFlying covers states 1 to 4', () => {
  assert.equal(isFlying('landed'), false);
  assert.equal(isFlying('cutOff'), false);
  assert.equal(isFlying('takingOff'), true);
  assert.equal(isFlying('hovering'), true);
  assert.equal(isFlying('landing'), true);
});
