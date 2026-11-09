import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SequenceCounters } from './sequence.js';

test('each characteristic has its own counter, starting at 1', () => {
  const s = new SequenceCounters();
  assert.equal(s.next('fa0a'), 1);
  assert.equal(s.next('fa0a'), 2);
  assert.equal(s.next('fa0b'), 1);
});

test('the counter wraps from 255 back to 0', () => {
  // Happens after 12.8 s of flight on fa0a, so on every flight.
  const s = new SequenceCounters();
  for (let i = 0; i < 255; i++) s.next('fa0a');
  assert.equal(s.next('fa0a'), 0);
  assert.equal(s.next('fa0a'), 1);
});
