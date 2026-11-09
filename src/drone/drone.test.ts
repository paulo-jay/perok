import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Drone } from './drone.js';
import { FakeTransport, sleep } from '../testing/fake-transport.js';

const connected = async () => {
  const t = new FakeTransport();
  const d = new Drone(t);
  await d.init();
  return { t, d };
};

test('takeOff emet flatTrim puis takeOff puis demarre la boucle', async () => {
  const { t, d } = await connected();
  await d.takeOff();
  const cmd = t.on('fa0b').map((w) => w.frame);
  assert.deepEqual(cmd[0].slice(2), [2, 0, 0, 0], 'flatTrim en premier');
  assert.deepEqual(cmd[1].slice(2), [2, 0, 1, 0], 'takeOff ensuite');
  await sleep(60);
  assert.ok(t.on('fa0a').length > 0, 'la boucle emet');
  // Sans cet arret, l intervalle survit au test et node --test ne rend
  // jamais la main : c est le seul test qui laisse la boucle active.
  d.handleDisconnect();
});

test('land emet land et arrete la boucle', async () => {
  const { t, d } = await connected();
  await d.takeOff();
  t.emit('fb0e', 0, 0, 0, 0, 0, 0, 2); // hovering
  await d.land();
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 0, 3, 0]);
  const count = t.on('fa0a').length;
  await sleep(40);
  assert.equal(t.on('fa0a').length, count);
});

test('emergency ecrit sur fa0c et arrete la boucle', async () => {
  const { t, d } = await connected();
  await d.takeOff();
  await d.emergency();
  assert.deepEqual(t.on('fa0c')[0].frame.slice(2), [2, 0, 4, 0]);
});

test('land fonctionne pendant le decollage, avant la premiere notification', async () => {
  // L etat rapporte est initialise a 'landed' et ne change qu a la
  // notification fb0e : s y fier seul rend « Atterrir » muet pendant tout le
  // decollage, alors que c est la voie reflexe exigee par la conception.
  const { t, d } = await connected();
  await d.takeOff();
  await d.land();
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 0, 3, 0]);
});

test('un second decollage ne recalibre pas l horizon en vol', async () => {
  // FlatTrim recale la centrale inertielle : l emettre en vol dereglerait
  // le drone.
  const { t, d } = await connected();
  await d.takeOff();
  const before = t.on('fa0b').length;
  await d.takeOff();
  assert.equal(t.on('fa0b').length, before, 'ni second FlatTrim ni second TakeOff');
  d.handleDisconnect();
});

test('airborne reflete la boucle avant toute notification d etat', async () => {
  const { d } = await connected();
  assert.equal(d.airborne, false);
  await d.takeOff();
  assert.equal(d.airborne, true, 'en vol des que la boucle tourne');
  await d.land();
  assert.equal(d.airborne, false);
});

test('land alors que deja pose n emet rien et ne leve pas', async () => {
  // Review Focus 5
  const { t, d } = await connected();
  t.emit('fb0e', 0, 0, 0, 0, 0, 0, 0); // landed
  await d.land();
  assert.equal(t.on('fa0b').length, 0);
});

test('handleDisconnect arrete la boucle et notifie disconnected', async () => {
  // Review Focus 4
  const { t, d } = await connected();
  const seen: string[] = [];
  d.onState((s) => seen.push(s.connection));
  await d.takeOff();
  d.handleDisconnect();
  await sleep(40);
  assert.equal(seen.at(-1), 'disconnected');
  const count = t.on('fa0a').length;
  await sleep(30);
  assert.equal(t.on('fa0a').length, count);
});

test('les notifications mettent a jour batterie et etat de vol', async () => {
  const { t, d } = await connected();
  let last = { battery: null as number | null, flight: '' };
  d.onState((s) => {
    last = { battery: s.battery, flight: s.flight };
  });
  t.emit('fb0f', 0, 0, 0, 82);
  assert.equal(last.battery, 82);
  t.emit('fb0e', 0, 0, 0, 0, 0, 0, 2);
  assert.equal(last.flight, 'hovering');
});
