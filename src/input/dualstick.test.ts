import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineSticks } from './dualstick.js';
import { NEUTRAL } from '../axes.js';

test('manche gauche : y vers gaz, x vers lacet', () => {
  const a = combineSticks({ x: 0, y: 100 }, { x: 0, y: 0 });
  assert.deepEqual(a, { roll: 0, pitch: 0, yaw: 0, gaz: 100 });
});

test('manche droit : y vers tangage, x vers roulis', () => {
  const a = combineSticks({ x: 0, y: 0 }, { x: 100, y: 100 });
  assert.deepEqual(a, { roll: 100, pitch: 100, yaw: 0, gaz: 0 });
});

test('la zone morte neutralise les petits ecarts', () => {
  assert.deepEqual(combineSticks({ x: 4, y: 0 }, { x: 0, y: 0 }, 10), NEUTRAL);
});
