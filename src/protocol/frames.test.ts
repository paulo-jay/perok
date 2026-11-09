import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuid } from './uuids.js';
import { currentDate, flatTrim, takeOff, land, emergency, flip, pcmd } from './frames.js';

const bytes = (f: Uint8Array) => Array.from(f);

test('uuid compose le motif Parrot', () => {
  assert.equal(uuid('fa0a'), '9a66fa0a-0800-9191-11e4-012d1540cb8e');
});

test('trames de commande simples', () => {
  assert.deepEqual(bytes(flatTrim(7)), [2, 7, 2, 0, 0, 0]);
  assert.deepEqual(bytes(takeOff(7)), [4, 7, 2, 0, 1, 0]);
  assert.deepEqual(bytes(land(7)), [4, 7, 2, 0, 3, 0]);
  assert.deepEqual(bytes(emergency(7)), [2, 7, 2, 0, 4, 0]);
  assert.deepEqual(bytes(flip(7)), [4, 7, 2, 4, 0, 0, 2, 0, 0, 0]);
});

test('poignee de main : date courante en ASCII', () => {
  assert.deepEqual(bytes(currentDate(1)), [
    4, 1, 0, 4, 1, 0,
    0x32, 0x30, 0x31, 0x34, 0x2d, 0x31, 0x30, 0x2d, 0x32, 0x38, 0x00,
  ]);
});

test('pcmd au neutre : drapeau a 0, 19 octets', () => {
  const f = pcmd(3, { roll: 0, pitch: 0, yaw: 0, gaz: 0 }, false);
  assert.equal(f.length, 19);
  assert.deepEqual(bytes(f), [2, 3, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('pcmd actif : drapeau a 1 et axes dans l ordre roll, pitch, yaw, gaz', () => {
  const f = pcmd(3, { roll: 10, pitch: 20, yaw: 30, gaz: 40 }, true);
  assert.deepEqual(bytes(f).slice(0, 11), [2, 3, 2, 0, 2, 0, 1, 10, 20, 30, 40]);
});

test('pcmd encode les negatifs en complement a deux', () => {
  // Review Focus 2 : une erreur de signe inverse la commande
  const f = pcmd(3, { roll: -50, pitch: -100, yaw: -1, gaz: 0 }, true);
  assert.deepEqual(bytes(f).slice(7, 11), [206, 156, 255, 0]);
});

test('pcmd borne les valeurs hors intervalle', () => {
  const f = pcmd(3, { roll: 150, pitch: -150, yaw: 0, gaz: 0 }, true);
  assert.deepEqual(bytes(f).slice(7, 9), [100, 156]);
});
