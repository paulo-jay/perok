import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, applyDeadzone, stickToAxes, NEUTRAL } from './axes.js';

test('clamp borne aux valeurs extremes', () => {
  assert.equal(clamp(150), 100);
  assert.equal(clamp(-150), -100);
  assert.equal(clamp(0), 0);
  assert.equal(clamp(42.7), 43);
});

test('clamp borne le depassement geometrique du joystick', () => {
  // Review Focus 3 : doigt tire au-dela du rayon
  assert.equal(clamp(141), 100);
});

test('applyDeadzone annule sous le seuil et remet a l echelle au-dela', () => {
  assert.equal(applyDeadzone(5, 10), 0);
  assert.equal(applyDeadzone(-5, 10), 0);
  assert.equal(applyDeadzone(100, 10), 100);
  assert.equal(applyDeadzone(55, 10), 50);
});

test('stickToAxes normalise en pourcentage du rayon', () => {
  assert.deepEqual(stickToAxes(0, 0, 50), { x: 0, y: 0 });
  assert.deepEqual(stickToAxes(50, 0, 50), { x: 100, y: 0 });
  assert.deepEqual(stickToAxes(0, -50, 50), { x: 0, y: 100 });
});

test('NEUTRAL est a zero sur les quatre axes', () => {
  assert.deepEqual(NEUTRAL, { roll: 0, pitch: 0, yaw: 0, gaz: 0 });
});
