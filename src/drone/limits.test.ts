import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlightLimits, sameLimitSet } from './limits.js';

const range = { current: 3, min: 1, max: 10 };

test('a limit is unknown until the drone reports it', () => {
  // Never send a value before the drone has stated its range.
  const l = new FlightLimits();
  assert.equal(l.range('maxAltitude'), null);
  assert.equal(l.sanitize('maxAltitude', 5), null);
  assert.deepEqual(l.known, []);
});

test('a reported limit becomes readable', () => {
  const l = new FlightLimits();
  l.report('maxAltitude', range);
  assert.deepEqual(l.range('maxAltitude'), range);
  assert.deepEqual(l.known, ['maxAltitude']);
});

test('a requested value is clamped to the reported range', () => {
  // The firmware would reject an out-of-range value, which looks to the pilot
  // like a broken control.
  const l = new FlightLimits();
  l.report('maxAltitude', range);
  assert.equal(l.sanitize('maxAltitude', 5), 5);
  assert.equal(l.sanitize('maxAltitude', 99), 10);
  assert.equal(l.sanitize('maxAltitude', 0), 1);
});

test('limits are independent of one another', () => {
  const l = new FlightLimits();
  l.report('maxTilt', { current: 20, min: 5, max: 30 });
  assert.equal(l.sanitize('maxTilt', 100), 30);
  assert.equal(l.sanitize('maxVerticalSpeed', 1), null);
});

test('a non-finite value is refused rather than encoded', () => {
  // setLimit is a public entry point taking a raw number; NaN would clamp to
  // NaN and go out as a float to a flying drone.
  const l = new FlightLimits();
  l.report('maxAltitude', range);
  assert.equal(l.sanitize('maxAltitude', NaN), null);
  assert.equal(l.sanitize('maxAltitude', Infinity), null);
  assert.equal(l.sanitize('maxAltitude', -Infinity), null);
});

test('sameLimitSet tells whether the rendered rows are still the right ones', () => {
  assert.equal(sameLimitSet(['maxAltitude'], ['maxAltitude']), true);
  assert.equal(sameLimitSet([], []), true);
  assert.equal(sameLimitSet(['maxAltitude'], ['maxTilt']), false);
  assert.equal(sameLimitSet(['maxAltitude', 'maxTilt'], ['maxAltitude']), false);
});

test('a later report replaces the earlier one without duplicating it', () => {
  const l = new FlightLimits();
  l.report('maxTilt', { current: 20, min: 5, max: 30 });
  l.report('maxTilt', { current: 25, min: 5, max: 30 });
  assert.deepEqual(l.range('maxTilt'), { current: 25, min: 5, max: 30 });
  assert.deepEqual(l.known, ['maxTilt']);
});
