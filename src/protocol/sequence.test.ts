import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SequenceCounters } from './sequence.js';

test('chaque caracteristique a son propre compteur, demarrant a 1', () => {
  const s = new SequenceCounters();
  assert.equal(s.next('fa0a'), 1);
  assert.equal(s.next('fa0a'), 2);
  assert.equal(s.next('fa0b'), 1);
});

test('le compteur boucle a 255 vers 0', () => {
  // Review Focus 1 : survient au bout de 12,8 s de vol sur fa0a
  const s = new SequenceCounters();
  for (let i = 0; i < 255; i++) s.next('fa0a');
  assert.equal(s.next('fa0a'), 0);
  assert.equal(s.next('fa0a'), 1);
});
