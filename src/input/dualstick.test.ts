import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineSticks } from './dualstick.js';
import { NEUTRAL } from '../axes.js';

test('left stick: all four directions, y to pitch and x to roll', () => {
  const a = combineSticks({ x: 100, y: 100 }, { x: 0, y: 0 });
  assert.deepEqual(a, { roll: 100, pitch: 100, yaw: 0, gaz: 0 });
});

test('right stick: y to gaz and x to yaw', () => {
  const a = combineSticks({ x: 0, y: 0 }, { x: 100, y: 100 });
  assert.deepEqual(a, { roll: 0, pitch: 0, yaw: 100, gaz: 100 });
});

test('the two sticks are independent', () => {
  // Zero deadzone: this checks the axis routing, not the rescaling, which has
  // its own test.
  const a = combineSticks({ x: -40, y: 0 }, { x: 0, y: 60 }, 0);
  assert.deepEqual(a, { roll: -40, pitch: 0, yaw: 0, gaz: 60 });
});

test('the deadzone cancels small deflections', () => {
  assert.deepEqual(combineSticks({ x: 4, y: 0 }, { x: 0, y: 0 }, 10), NEUTRAL);
});
