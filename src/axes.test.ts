import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, applyDeadzone, stickToAxes, NEUTRAL } from './axes.js';

test('clamp clamps extreme values', () => {
  assert.equal(clamp(150), 100);
  assert.equal(clamp(-150), -100);
  assert.equal(clamp(0), 0);
  assert.equal(clamp(42.7), 43);
});

test('clamp clamps joystick geometric overshoot', () => {
  // A finger dragged beyond the stick radius.
  assert.equal(clamp(141), 100);
});

test('applyDeadzone zeroes below the threshold and rescales above it', () => {
  assert.equal(applyDeadzone(5, 10), 0);
  assert.equal(applyDeadzone(-5, 10), 0);
  assert.equal(applyDeadzone(100, 10), 100);
  assert.equal(applyDeadzone(55, 10), 50);
});

test('stickToAxes normalizes as a percentage of the radius', () => {
  assert.deepEqual(stickToAxes(0, 0, 50), { x: 0, y: 0 });
  assert.deepEqual(stickToAxes(50, 0, 50), { x: 100, y: 0 });
  assert.deepEqual(stickToAxes(0, -50, 50), { x: 0, y: 100 });
});

test('NEUTRAL is zero on all four axes', () => {
  assert.deepEqual(NEUTRAL, { roll: 0, pitch: 0, yaw: 0, gaz: 0 });
});
