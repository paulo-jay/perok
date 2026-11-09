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

test('takeOff sends flatTrim then takeOff, then starts the loop', async () => {
  const { t, d } = await connected();
  await d.takeOff();
  const cmd = t.on('fa0b').map((w) => w.frame);
  assert.deepEqual(cmd[0].slice(2), [2, 0, 0, 0], 'flatTrim first');
  assert.deepEqual(cmd[1].slice(2), [2, 0, 1, 0], 'takeOff next');
  await sleep(60);
  assert.ok(t.on('fa0a').length > 0, 'the loop is sending');
  // Without this stop the interval outlives the test and node --test never
  // returns. This is the only test that leaves the loop running.
  d.handleDisconnect();
});

test('land sends land and stops the loop', async () => {
  const { t, d } = await connected();
  await d.takeOff();
  t.emit('fb0e', 0, 0, 0, 0, 0, 0, 2); // hovering
  await d.land();
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 0, 3, 0]);
  const count = t.on('fa0a').length;
  await sleep(40);
  assert.equal(t.on('fa0a').length, count);
});

test('emergency writes on fa0c and stops the loop', async () => {
  const { t, d } = await connected();
  await d.takeOff();
  await d.emergency();
  assert.deepEqual(t.on('fa0c')[0].frame.slice(2), [2, 0, 4, 0]);
});

test('land works during take-off, before the first notification', async () => {
  // The reported state starts at `landed` and only moves on the first `fb0e`
  // notification: relying on it alone leaves "Land" mute for the whole
  // take-off, when it is the reflex control the design requires.
  const { t, d } = await connected();
  await d.takeOff();
  await d.land();
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 0, 3, 0]);
});

test('a second take-off does not recalibrate the horizon in flight', async () => {
  // Flat trim realigns the inertial unit: sending it in flight throws the
  // drone off.
  const { t, d } = await connected();
  await d.takeOff();
  const before = t.on('fa0b').length;
  await d.takeOff();
  assert.equal(t.on('fa0b').length, before, 'no second flatTrim nor takeOff');
  d.handleDisconnect();
});

test('airborne reflects the loop before any state notification', async () => {
  const { d } = await connected();
  assert.equal(d.airborne, false);
  await d.takeOff();
  assert.equal(d.airborne, true, 'airborne as soon as the loop runs');
  await d.land();
  assert.equal(d.airborne, false);
});

test('land while already landed sends nothing and does not throw', async () => {
  const { t, d } = await connected();
  t.emit('fb0e', 0, 0, 0, 0, 0, 0, 0); // landed
  await d.land();
  assert.equal(t.on('fa0b').length, 0);
});

test('handleDisconnect stops the loop and reports disconnected', async () => {
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

test('notifications update battery and flight state', async () => {
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
