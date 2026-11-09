import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandLoop } from './loop.js';
import { SequenceCounters } from '../protocol/sequence.js';
import { FakeTransport, sleep } from '../testing/fake-transport.js';

const loopOn = (t: FakeTransport) => new CommandLoop(t, new SequenceCounters(), 10);

test('the loop sends continuously, even at neutral', async () => {
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.start();
  await sleep(55);
  loop.stop();
  const sent = t.on('fa0a');
  assert.ok(sent.length >= 3, `expected >= 3 sends, got ${sent.length}`);
  assert.equal(sent[0].frame[6], 0, 'flag at 0 when neutral');
});

test('setpoints are written with an acknowledgement, for the backpressure', async () => {
  // Not an optimisation left on the table: an unacknowledged write resolves
  // when it is queued, not when it is delivered, so the loop cannot tell a
  // link that is keeping up from one that is drowning. It then enqueues twenty
  // frames a second regardless, the queue grows inside the browser, and the
  // acknowledged command writes — take off, land — end up stuck behind it.
  // The acknowledgement IS the flow control.
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.start();
  await sleep(25);
  loop.stop();
  assert.equal(t.on('fa0a')[0].withoutResponse, false);
});

test('a write slower than the interval makes the loop skip, not pile up', async () => {
  // The skipped count is what tells a saturated link from a frozen interface.
  const t = new FakeTransport();
  t.writeDelayMs = 40;
  const loop = loopOn(t);
  loop.start();
  await sleep(140);
  loop.stop();
  assert.ok(loop.skippedTicks > 0, 'slow writes must cause skips');
  assert.ok(t.on('fa0a').length <= 5, 'and must not queue a write per tick');
});

test('setAxes raises the flag and passes the axes through', async () => {
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.setAxes({ roll: 10, pitch: 0, yaw: 0, gaz: -20 });
  loop.start();
  await sleep(25);
  loop.stop();
  const f = t.on('fa0a')[0].frame;
  assert.equal(f[6], 1);
  assert.equal(f[7], 10);
  assert.equal(f[10], 236); // -20 as two's complement
});

test('stop ends all sending', async () => {
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

test('starting twice creates only one loop', async () => {
  // No leaked interval.
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.start();
  loop.start();
  await sleep(55);
  loop.stop();
  assert.ok(t.on('fa0a').length <= 7, 'rate doubled: interval leaked');
});

test('an isolated failure does not kill the loop while the link is alive', async () => {
  // A live link refusing one write is a transient incident; stopping would
  // leave the drone airborne with dead sticks.
  const t = new FakeTransport();
  const loop = loopOn(t);
  t.failNextWrite = true;
  loop.start();
  await sleep(60);
  assert.equal(loop.running, true, 'the loop must survive an isolated failure');
  assert.ok(t.on('fa0a').length >= 2, 'and must keep sending');
  loop.stop();
});

test('the loop stops when the transport reports a broken link', async () => {
  const t = new FakeTransport();
  const loop = loopOn(t);
  t.connected = false;
  t.failWrites = true;
  loop.start();
  await sleep(40);
  assert.equal(loop.running, false);
});

test('the loop gives up after consecutive failures', async () => {
  const t = new FakeTransport();
  const loop = loopOn(t);
  t.failWrites = true;
  loop.start();
  await sleep(260);
  assert.equal(loop.running, false, 'a mute link must eventually stop the loop');
});

test('the loop reports when it gives up', async () => {
  const t = new FakeTransport();
  let aborted = false;
  const loop = new CommandLoop(t, new SequenceCounters(), 10, () => {
    aborted = true;
  });
  t.failWrites = true;
  loop.start();
  await sleep(260);
  assert.equal(aborted, true);
});
