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

test('init registers one notification listener and subscribes nothing', async () => {
  // Re-subscribing all ten characteristics put ten serialised GATT operations
  // between the handshake and the pilot's first command.
  const t = new FakeTransport();
  const d = new Drone(t);
  await d.init();
  assert.equal(t.handlers.length, 1);
});

test('commands keep their acknowledgement', async () => {
  // Only the setpoint stream trades reliability for latency.
  const { t, d } = await connected();
  await d.takeOff();
  assert.equal(t.on('fa0b')[0].withoutResponse, false);
  d.handleDisconnect();
});

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
  t.emit('fb0e', 4, 1, 2, 3, 1, 0, 2, 0, 0, 0); // hovering
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
  t.emit('fb0e', 4, 1, 2, 3, 1, 0, 0, 0, 0, 0); // landed
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

test('flatTrim is refused while airborne', async () => {
  // It recalibrates the inertial horizon.
  const { t, d } = await connected();
  await d.takeOff();
  const before = t.on('fa0b').length;
  await d.flatTrim();
  assert.equal(t.on('fa0b').length, before, 'no flat trim in flight');
  d.handleDisconnect();
});

test('flatTrim is sent while landed', async () => {
  const { t, d } = await connected();
  await d.flatTrim();
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 0, 0, 0]);
});

test('flip is refused unless the drone is hovering', async () => {
  // A flip on the ground is a crash, and during take-off the drone is not
  // stable yet.
  const { t, d } = await connected();
  await d.flip();
  assert.equal(t.on('fa0b').length, 0, 'not while landed');

  await d.takeOff();
  const duringTakeOff = t.on('fa0b').length;
  t.emit('fb0e', 4, 1, 2, 3, 1, 0, 1, 0, 0, 0); // takingOff
  await d.flip();
  assert.equal(t.on('fa0b').length, duringTakeOff, 'not while taking off');

  t.emit('fb0e', 4, 1, 2, 3, 1, 0, 2, 0, 0, 0); // hovering
  await d.flip('back');
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 4, 0, 0, 1, 0, 0, 0]);
  d.handleDisconnect();
});

test('an alert frame does not arm the flip', async () => {
  // AlertStateChanged (class 3, command 2) carries cut_out = 2, the same byte
  // as hovering. Presenting card under the propellers to stop the drone — the
  // design's own emergency advice — raises exactly that alert, and decoding by
  // byte position would then arm a flip on a grounded drone.
  const { t, d } = await connected();
  await d.takeOff();
  t.emit('fb0e', 4, 1, 2, 3, 2, 0, 2, 0, 0, 0);
  await d.flip();
  const sent = t.on('fa0b').map((w) => w.frame.slice(2));
  assert.ok(
    !sent.some((f) => f[0] === 2 && f[1] === 4),
    'no flip frame may be sent on the strength of an alert',
  );
  d.handleDisconnect();
});

test('a removed accessory clears the light', async () => {
  const { t, d } = await connected();
  let seen: unknown = undefined;
  d.onState((s) => {
    seen = s.light;
  });
  t.emit('fb1b', 4, 1, 2, 15, 0, 0, 0, 1, 0, 0, 0, 80, 0x03);
  assert.deepEqual(seen, { id: 0, intensity: 80 });
  t.emit('fb1b', 4, 1, 2, 15, 0, 0, 0, 1, 0, 0, 0, 80, 0x08);
  assert.equal(seen, null);
});

test('setLimit sends nothing until the drone reports a range', async () => {
  const { t, d } = await connected();
  await d.setLimit('maxAltitude', 5);
  assert.equal(t.written.length, 0);
});

test('setLimit clamps to the reported range', async () => {
  const { t, d } = await connected();
  // MaxAltitudeChanged: current 3, min 1, max 10.
  t.emit('fb1b', 4, 1, 2, 9, 0, 0, 0, 0, 0x40, 0x40, 0, 0, 0x80, 0x3f, 0, 0, 0x20, 0x41);
  assert.deepEqual(d.limits.range('maxAltitude'), { current: 3, min: 1, max: 10 });

  await d.setLimit('maxAltitude', 99);
  // clamped to 10, whose little-endian float bytes are 00 00 20 41
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 8, 0, 0, 0, 0, 0x20, 0x41]);
});

test('a picture failure reaches the state', async () => {
  // memoryFull and lowBattery are ordinary outcomes on a ten-year-old drone.
  const { t, d } = await connected();
  let last: { taken: boolean; error: string } | null = null;
  d.onState((s) => {
    last = s.picture;
  });
  t.emit('fb1b', 4, 1, 2, 2, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0);
  assert.deepEqual(last, { taken: false, error: 'memoryFull' });
});

test('a reported light becomes available, and nothing is assumed before', async () => {
  // The whole P4 probe: the control exists only if the drone announces a light.
  const { t, d } = await connected();
  let seen: { id: number; intensity: number } | null = null;
  d.onState((s) => {
    seen = s.light;
  });
  assert.equal(seen, null);
  t.emit('fb1b', 4, 1, 2, 15, 0, 0, 0, 1, 0, 0, 0, 80, 0);
  assert.deepEqual(seen, { id: 0, intensity: 80 });
});

test('setLight sends nothing until a light has been reported', async () => {
  const { t, d } = await connected();
  await d.setLight('fixed', 100);
  assert.equal(t.on('fa0b').length, 0);

  t.emit('fb1b', 4, 1, 2, 15, 0, 0, 0, 1, 0, 0, 0, 80, 0);
  await d.setLight('fixed', 100);
  assert.deepEqual(
    t.on('fa0b').at(-1)!.frame.slice(2),
    [2, 16, 0, 0, 0, 0, 0, 0, 0, 100],
  );
});

test('takePicture is sent and the flight state does not gate it', async () => {
  const { t, d } = await connected();
  await d.takePicture();
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 6, 1, 0]);
});

test('notifications update battery and flight state', async () => {
  const { t, d } = await connected();
  let last = { battery: null as number | null, flight: '' };
  d.onState((s) => {
    last = { battery: s.battery, flight: s.flight };
  });
  t.emit('fb0f', 4, 1, 0, 5, 1, 0, 82);
  assert.equal(last.battery, 82);
  t.emit('fb0e', 4, 1, 2, 3, 1, 0, 2, 0, 0, 0);
  assert.equal(last.flight, 'hovering');
});
