import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeFlightState,
  decodeBattery,
  isFlying,
  decodeSettingRange,
  decodePictureOutcome,
  decodeLightState,
  routeNotification,
} from './notifications.js';
import { parseFrame } from './parse.js';

const view = (...b: number[]) => new DataView(new Uint8Array(b).buffer);

test('decodeFlightState follows the specification enumeration', () => {
  // landed=0, takingoff=1, hovering=2, flying=3, landing=4, emergency=5,
  // rolling=6, init=7 — read out of minidrone.xml, not from the spike.
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 0)), 'landed');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 1)), 'takingOff');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 2)), 'hovering');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 3)), 'flying');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 4)), 'landing');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 5)), 'emergency');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 6)), 'rolling');
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 7)), 'init');
});

test('routeNotification identifies the flight state by its header', () => {
  // minidrone.PilotingState.FlyingStateChanged = project 2, class 3, cmd 1
  assert.deepEqual(routeNotification(view(4, 1, 2, 3, 1, 0, 3, 0, 0, 0)), {
    kind: 'flight',
    state: 'flying',
  });
});

test('routeNotification does not mistake an alert for a flight state', () => {
  // AlertStateChanged is class 3 command 2, and its cut_out value is 2 — the
  // same byte as hovering. Decoding by position alone would arm a flip on a
  // grounded drone whose propellers had just been stopped by hand.
  assert.equal(routeNotification(view(4, 1, 2, 3, 2, 0, 2, 0, 0, 0)), null);
});

test('routeNotification identifies the battery by its header', () => {
  // common.CommonState.BatteryStateChanged = project 0, class 5, command 1
  assert.deepEqual(routeNotification(view(4, 1, 0, 5, 1, 0, 82)), {
    kind: 'battery',
    percent: 82,
  });
});

test('an empty accessory list is not a light', () => {
  // list_flags 0x04 Empty: "All other arguments should be ignored." A drone
  // with no accessory is the likeliest sender, and taking it for a light
  // would make the whole LED probe answer yes when the drone said no.
  assert.equal(routeNotification(view(4, 1, 2, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0x04)), null);
});

test('a removed accessory clears the light', () => {
  assert.deepEqual(routeNotification(view(4, 1, 2, 15, 0, 0, 0, 0, 0, 0, 0, 80, 0x08)), {
    kind: 'light',
    state: null,
  });
});

test('a present accessory is reported', () => {
  assert.deepEqual(routeNotification(view(4, 1, 2, 15, 0, 0, 0, 1, 0, 0, 0, 80, 0x03)), {
    kind: 'light',
    state: { id: 0, state: 1, intensity: 80 },
  });
});

test('decodeFlightState falls back to unknown out of range or on a short frame', () => {
  assert.equal(decodeFlightState(view(0, 0, 0, 0, 0, 0, 9)), 'unknown');
  assert.equal(decodeFlightState(view(0, 0, 0)), 'unknown');
});

test('decodeBattery reads the last byte', () => {
  assert.equal(decodeBattery(view(0, 0, 0, 82)), 82);
  assert.equal(decodeBattery(view(0, 0, 0, 9)), 9);
});

test('decodeSettingRange reads three floats', () => {
  // MaxAltitudeChanged: current 3, min 1, max 10.
  const f = parseFrame(
    view(4, 1, 2, 9, 0, 0, 0, 0, 0x40, 0x40, 0, 0, 0x80, 0x3f, 0, 0, 0x20, 0x41),
  )!;
  assert.deepEqual(decodeSettingRange(f), { current: 3, min: 1, max: 10 });
});

test('decodePictureOutcome distinguishes success from a named failure', () => {
  const ok = parseFrame(view(4, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))!;
  assert.deepEqual(decodePictureOutcome(ok), { taken: true, error: 'ok' });

  // event failed (1), error memoryFull (4)
  const full = parseFrame(view(4, 1, 2, 2, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0))!;
  assert.deepEqual(decodePictureOutcome(full), { taken: false, error: 'memoryFull' });
});

test('decodePictureOutcome names an unexpected error rather than throwing', () => {
  const weird = parseFrame(view(4, 1, 2, 2, 0, 0, 1, 0, 0, 0, 99, 0, 0, 0))!;
  assert.deepEqual(decodePictureOutcome(weird), { taken: false, error: 'unknown' });
});

test('decodeLightState reads the reported light', () => {
  const f = parseFrame(view(4, 1, 2, 15, 0, 0, 0, 1, 0, 0, 0, 80, 0))!;
  assert.deepEqual(decodeLightState(f), { id: 0, state: 1, intensity: 80 });
});

test('isFlying covers taking off through landing', () => {
  assert.equal(isFlying('landed'), false);
  assert.equal(isFlying('takingOff'), true);
  assert.equal(isFlying('hovering'), true);
  assert.equal(isFlying('flying'), true);
  assert.equal(isFlying('landing'), true);
  assert.equal(isFlying('emergency'), false);
  assert.equal(isFlying('rolling'), false);
  assert.equal(isFlying('init'), false);
  assert.equal(isFlying('unknown'), false);
});
