import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandLoop } from './loop.js';
import { SequenceCounters } from '../protocol/sequence.js';
import { FakeTransport, sleep } from '../testing/fake-transport.js';

const loopOn = (t: FakeTransport) => new CommandLoop(t, new SequenceCounters(), 10);

test('la boucle emet en continu meme au neutre', async () => {
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.start();
  await sleep(55);
  loop.stop();
  const sent = t.on('fa0a');
  assert.ok(sent.length >= 3, `attendu >= 3 envois, recu ${sent.length}`);
  assert.equal(sent[0].frame[6], 0, 'drapeau a 0 au neutre');
});

test('setAxes passe le drapeau a 1 et transmet les axes', async () => {
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.setAxes({ roll: 10, pitch: 0, yaw: 0, gaz: -20 });
  loop.start();
  await sleep(25);
  loop.stop();
  const f = t.on('fa0a')[0].frame;
  assert.equal(f[6], 1);
  assert.equal(f[7], 10);
  assert.equal(f[10], 236); // -20 en complement a deux
});

test('stop arrete toute emission', async () => {
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.start();
  await sleep(25);
  loop.stop();
  const count = t.on('fa0a').length;
  await sleep(30);
  assert.equal(t.on('fa0a').length, count);
  assert.equal(loop.running, false);
});

test('start deux fois ne cree qu une seule boucle', async () => {
  // Review Focus 5 : pas de fuite d intervalle
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.start();
  loop.start();
  await sleep(55);
  loop.stop();
  assert.ok(t.on('fa0a').length <= 7, 'cadence doublee : intervalle fuite');
});

test('un echec d ecriture arrete la boucle sans rejet non traite', async () => {
  // Review Focus 4
  const t = new FakeTransport();
  const loop = loopOn(t);
  t.failNextWrite = true;
  loop.start();
  await sleep(40);
  assert.equal(loop.running, false);
});
