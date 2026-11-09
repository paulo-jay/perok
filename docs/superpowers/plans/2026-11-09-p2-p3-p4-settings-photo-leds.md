# P2, P3, P4 — flight limits, flips, photo, LEDs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the remaining command surface — flight limits, flat trim and flips (P2), photo capture (P3), and a bounded attempt at the Night's LEDs (P4) — behind a settings panel that reads the drone's own allowed ranges.

**Architecture:** Two new pure layers under `src/protocol/`: a typed argument encoder, because these commands carry IEEE-754 floats and 4-byte enums that the current byte-array builder cannot express; and a notification frame parser that dispatches on `(project, class, command)` instead of guessing from the characteristic. A `FlightLimits` model holds what the drone reports. The settings panel built for the language row gains the new rows.

**Tech Stack:** Unchanged — TypeScript compiled by `tsc` alone, ES modules, no bundler, Node's built-in test runner, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-09-perok-pilotage-web-design.md`

This plan is written in English because it carries test names and code that must match the codebase, which is English. The spec and the first plan stay French as the historical record of the conversations that produced them.

## Scope

P2, P3 and P4 from the spec's priority list, in that order. The two remaining control schemes (joystick + buttons, joystick + tilt) and any mode selector are **out of scope** — the user asked for these first, and they get their own plan.

Photo **retrieval** stays out of scope, as the spec records: there is no file-transfer command in the minidrone BLE set. This plan triggers a capture and reports its outcome; the image stays in the drone's flash.

## Global Constraints

- TypeScript compiled by **`tsc` alone**, no bundler; dev dependencies limited to `typescript` and `@types/node`.
- **Relative imports in TypeScript source carry `.js` extensions.**
- **Every new app module must be added to `SHELL` in `sw.js`**, or offline flight breaks.
- Every path in the shipped app stays **relative** (GitHub Pages sub-path).
- Integration and deploy branch: **`master`**.
- All user-facing strings go through `src/i18n.ts`, in **both** French and English. The dictionary completeness test must keep passing.
- Argument wire format, from Parrot's `xml/minidrone.xml`: `u8`/`i8` one byte; `u16`/`i16` two bytes **little-endian**; `u32`/`i32`/**`enum`** four bytes little-endian; `float` four bytes **IEEE-754 little-endian**; `string` null-terminated ASCII.
- Frame layout is unchanged: `[dataType, sequence, project, class, command, 0, ...args]`. Project 0 is `common`, project 2 is `minidrone`.

## Command reference

Read out of `xml/minidrone.xml` in [Parrot-Developers/arsdk-xml](https://github.com/Parrot-Developers/arsdk-xml) (deleted from `master`, recovered from history; a copy sits in the git-ignored `.arsdk-ref/`). **Do not re-derive these.**

| Purpose | Project | Class | Cmd | Arguments |
|---|---|---|---|---|
| Max altitude | 2 | 8 `PilotingSettings` | 0 | `current: float` |
| Max tilt | 2 | 8 | 1 | `current: float` |
| Max vertical speed | 2 | 1 `SpeedSettings` | 0 | `current: float` |
| Max rotation speed | 2 | 1 | 1 | `current: float` |
| Flat trim | 2 | 0 `Piloting` | 0 | — |
| Flip | 2 | 4 `Animations` | 0 | `direction: enum` |
| Take picture | 2 | 6 `MediaRecord` | 1 (`PictureV2`) | — |
| Light control | 2 | 16 `UsbAccessory` | 0 | `id: u8, mode: enum, intensity: u8` |

Notifications to decode:

| Meaning | Project | Class | Cmd | Arguments |
|---|---|---|---|---|
| Max altitude range | 2 | 9 `PilotingSettingsState` | 0 | `current, min, max: float` |
| Max tilt range | 2 | 9 | 1 | `current, min, max: float` |
| Max vertical speed range | 2 | 5 `SpeedSettingsState` | 0 | `current, min, max: float` |
| Max rotation speed range | 2 | 5 | 1 | `current, min, max: float` |
| Picture outcome | 2 | 2 `MediaRecordEvent` | 0 | `event: enum, error: enum` |
| Light state | 2 | 15 `UsbAccessoryState` | 0 | `id: u8, state: enum, intensity: u8, list_flags: u8` |

Enum values, in declaration order: flip direction `front=0, back=1, right=2, left=3` (the spike used 2); light mode `FIXED=0, BLINKED=1, OSCILLATED=2`; picture event `taken=0, failed=1`; picture error `ok=0, unknown=1, busy=2, notAvailable=3, memoryFull=4, lowBattery=5`.

## Design decisions

Mine, not the user's, and worth checking while reading.

- **The drone reports `current`, `min` and `max` for every limit.** The interface reads those and clamps to them; it never hardcodes a range and never sends a limit before the drone has reported one. Hardcoding a maximum the firmware rejects would look like a broken control.
- **Flips require a hovering drone.** A flip on the ground is a crash, and during take-off the drone is not stable. The button is enabled only while the reported flight state is `hovering`.
- **Flat trim requires a landed drone.** It recalibrates the inertial horizon; in flight it throws the drone off. Already guarded implicitly inside `takeOff`; this plan exposes it as its own command with the same guard.
- **Photo failures are surfaced, never swallowed.** `memoryFull` and `lowBattery` are ordinary outcomes on a ten-year-old drone, and a silent failure makes the pilot press again.
- **P4 is a bounded probe, not a promise.** `UsbAccessory.LightControl` is documented for the Cargo's USB lamp, and nothing in the specification says the Night's built-in LEDs answer to it. The plan subscribes to `UsbAccessoryState.LightState`: if the drone reports a light id, the row appears; if nothing arrives, the row stays hidden and the finding is recorded. Either outcome closes the question.

## Review Focus

Input classes the spec implies, most likely to bite a real user first.

1. **Float byte order.** A big-endian slip sends a plausible-looking but wrong altitude ceiling that the firmware may accept — the drone then climbs to the wrong limit. → tested in Task 1.
2. **A limit sent before, or outside, the drone's reported range.** Must clamp to the reported range and refuse to send when no range is known yet. → tested in Task 4.
3. **Flip while landed or taking off.** Must not be sent. → tested in Task 5.
4. **Flat trim while airborne.** Must not be sent. → tested in Task 5.
5. **Photo refused by the drone** (`busy`, `memoryFull`, `lowBattery`). The error must reach the interface. → tested in Task 5.

---

### Task 1: Typed command arguments

**Files:**
- Create: `src/protocol/args.ts`
- Test: `src/protocol/args.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `function u8(v: number): number[]`, `i8`, `u16le`, `i16le`, `u32le`, `enumArg(v: number): number[]`, `f32le(v: number): number[]`, `cstring(s: string): number[]`, `concat(...parts: number[][]): number[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/protocol/args.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { u8, i8, u16le, i16le, u32le, enumArg, f32le, cstring, concat } from './args.js';

test('single-byte arguments', () => {
  assert.deepEqual(u8(0), [0]);
  assert.deepEqual(u8(255), [255]);
  assert.deepEqual(i8(-1), [255]);
  assert.deepEqual(i8(-128), [128]);
});

test('multi-byte integers are little-endian', () => {
  assert.deepEqual(u16le(0x1234), [0x34, 0x12]);
  assert.deepEqual(i16le(-2), [0xfe, 0xff]);
  assert.deepEqual(u32le(0x11223344), [0x44, 0x33, 0x22, 0x11]);
});

test('enums are four little-endian bytes', () => {
  // The spike's right flip was [2, 0, 0, 0].
  assert.deepEqual(enumArg(2), [2, 0, 0, 0]);
  assert.deepEqual(enumArg(0), [0, 0, 0, 0]);
});

test('floats are IEEE-754 little-endian', () => {
  // Review Focus 1: a byte-order slip sends a wrong but plausible limit.
  assert.deepEqual(f32le(3), [0x00, 0x00, 0x40, 0x40]);
  assert.deepEqual(f32le(20), [0x00, 0x00, 0xa0, 0x41]);
  assert.deepEqual(f32le(1), [0x00, 0x00, 0x80, 0x3f]);
  assert.deepEqual(f32le(-1.5), [0x00, 0x00, 0xc0, 0xbf]);
});

test('strings are null-terminated ASCII', () => {
  assert.deepEqual(cstring('ab'), [0x61, 0x62, 0x00]);
});

test('concat joins argument groups in order', () => {
  assert.deepEqual(concat(u8(1), enumArg(2), u8(3)), [1, 2, 0, 0, 0, 3]);
});
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npm test`
Expected: FAIL — `./args.js` not found.

- [ ] **Step 3: Implement `src/protocol/args.ts`**

Each helper returns a plain byte array so command builders stay declarative. Use a
`DataView` over a 4-byte buffer with `setFloat32(0, value, true)` for `f32le` rather than
hand-rolling the exponent; `true` is the little-endian flag and is the whole point of
Review Focus 1.

- [ ] **Step 4: Run the tests to watch them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/protocol/args.ts src/protocol/args.test.ts
git commit -m "feat: typed command argument encoders"
```

---

### Task 2: Command builders for limits, flips, photo and lights

**Files:**
- Modify: `src/protocol/frames.ts`
- Test: `src/protocol/frames.test.ts`

**Interfaces:**
- Consumes: `args.ts` helpers; `clamp` and `Axes` from `src/axes.ts`.
- Produces, added to the existing exports:
  ```ts
  export type FlipDirection = 'front' | 'back' | 'right' | 'left';
  export type LightMode = 'fixed' | 'blinked' | 'oscillated';
  export function maxAltitude(seq: number, metres: number): Uint8Array;
  export function maxTilt(seq: number, degrees: number): Uint8Array;
  export function maxVerticalSpeed(seq: number, metresPerSecond: number): Uint8Array;
  export function maxRotationSpeed(seq: number, degreesPerSecond: number): Uint8Array;
  export function takePicture(seq: number): Uint8Array;
  export function lightControl(
    seq: number, id: number, mode: LightMode, intensity: number,
  ): Uint8Array;
  ```
  `flip` changes signature to `flip(seq: number, direction?: FlipDirection)`, defaulting to
  `'right'` so the proven spike value stays the default.

- [ ] **Step 1: Write the failing tests**

```ts
// added to src/protocol/frames.test.ts
test('flight limit frames carry a little-endian float', () => {
  assert.deepEqual(bytes(maxAltitude(7, 3)), [4, 7, 2, 8, 0, 0, 0, 0, 0x40, 0x40]);
  assert.deepEqual(bytes(maxTilt(7, 20)), [4, 7, 2, 8, 1, 0, 0, 0, 0xa0, 0x41]);
  assert.deepEqual(bytes(maxVerticalSpeed(7, 1)), [4, 7, 2, 1, 0, 0, 0, 0, 0x80, 0x3f]);
  assert.deepEqual(bytes(maxRotationSpeed(7, 20)), [4, 7, 2, 1, 1, 0, 0, 0, 0xa0, 0x41]);
});

test('flip takes a named direction and defaults to the proven one', () => {
  assert.deepEqual(bytes(flip(7)), [4, 7, 2, 4, 0, 0, 2, 0, 0, 0]);
  assert.deepEqual(bytes(flip(7, 'front')), [4, 7, 2, 4, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(bytes(flip(7, 'back')), [4, 7, 2, 4, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(bytes(flip(7, 'left')), [4, 7, 2, 4, 0, 0, 3, 0, 0, 0]);
});

test('takePicture uses PictureV2, which takes no argument', () => {
  assert.deepEqual(bytes(takePicture(7)), [4, 7, 2, 6, 1, 0]);
});

test('lightControl carries id, a four-byte mode and an intensity', () => {
  assert.deepEqual(
    bytes(lightControl(7, 0, 'fixed', 100)),
    [4, 7, 2, 16, 0, 0, 0, 0, 0, 0, 0, 100],
  );
  assert.deepEqual(
    bytes(lightControl(7, 1, 'blinked', 50)),
    [4, 7, 2, 16, 0, 0, 1, 1, 0, 0, 0, 50],
  );
});
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npm test`
Expected: FAIL — the new builders are not exported.

- [ ] **Step 3: Implement the builders**

Add the class and command constants from the reference table above, named after the ARSDK
classes. Keep `encodeFrame` as it is: it already takes a payload byte array, which is what
the `args.ts` helpers produce. All four limit setters and the light control are sent **with
acknowledgement** (`dataType` 4): a dropped setting would leave the interface showing a
value the drone never adopted.

- [ ] **Step 4: Run the tests to watch them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/protocol/frames.ts src/protocol/frames.test.ts
git commit -m "feat: command frames for limits, flips, photo and lights"
```

---

### Task 3: Notification frame parser

**Files:**
- Create: `src/protocol/parse.ts`
- Modify: `src/protocol/notifications.ts`
- Test: `src/protocol/parse.test.ts`, `src/protocol/notifications.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type ParsedFrame = {
    project: number; cls: number; cmd: number;
    readU8(index: number): number;
    readEnum(index: number): number;
    readF32(index: number): number;
  };
  export function parseFrame(data: DataView): ParsedFrame | null;
  ```
  and in `notifications.ts`:
  ```ts
  export type SettingRange = { current: number; min: number; max: number };
  export type PictureOutcome = { taken: boolean; error: string };
  export type LightState = { id: number; state: number; intensity: number };
  export function decodeSettingRange(frame: ParsedFrame): SettingRange;
  export function decodePictureOutcome(frame: ParsedFrame): PictureOutcome;
  export function decodeLightState(frame: ParsedFrame): LightState;
  ```

Argument indexes are relative to the first argument byte, i.e. offset 6 in the frame. The
existing `decodeFlightState` and `decodeBattery` keep their signatures so nothing calling
them changes; they are the reason this parser is additive rather than a rewrite.

- [ ] **Step 1: Write the failing tests**

```ts
// src/protocol/parse.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrame } from './parse.js';

const view = (...b: number[]) => new DataView(new Uint8Array(b).buffer);

test('parseFrame reads the header and locates the arguments', () => {
  const f = parseFrame(view(4, 1, 2, 9, 0, 0, 0, 0, 0x40, 0x40))!;
  assert.equal(f.project, 2);
  assert.equal(f.cls, 9);
  assert.equal(f.cmd, 0);
  assert.equal(f.readF32(0), 3);
});

test('parseFrame reads enums and bytes at an argument offset', () => {
  const f = parseFrame(view(4, 1, 2, 15, 0, 0, 7, 1, 0, 0, 0, 90, 0))!;
  assert.equal(f.readU8(0), 7);
  assert.equal(f.readEnum(1), 1);
  assert.equal(f.readU8(5), 90);
});

test('parseFrame rejects a frame too short to hold a header', () => {
  assert.equal(parseFrame(view(4, 1, 2)), null);
});
```

```ts
// added to src/protocol/notifications.test.ts
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

test('decodeLightState reads the reported light', () => {
  const f = parseFrame(view(4, 1, 2, 15, 0, 0, 0, 1, 0, 0, 0, 80, 0))!;
  assert.deepEqual(decodeLightState(f), { id: 0, state: 1, intensity: 80 });
});
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npm test`
Expected: FAIL — `./parse.js` not found, decoders not exported.

- [ ] **Step 3: Implement the parser and the decoders**

The header is six bytes; arguments start at offset 6. `readF32` uses
`getFloat32(6 + index, true)`. The picture error name comes from the enum order in the
reference table; an unknown value yields `'unknown'` rather than throwing, because a
notification is external input.

- [ ] **Step 4: Run the tests to watch them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/protocol/parse.ts src/protocol/parse.test.ts src/protocol/notifications.ts src/protocol/notifications.test.ts
git commit -m "feat: notification frame parser and new decoders"
```

---

### Task 4: Flight limits model

**Files:**
- Create: `src/drone/limits.ts`
- Test: `src/drone/limits.test.ts`

**Interfaces:**
- Consumes: `SettingRange` from `src/protocol/notifications.js`.
- Produces:
  ```ts
  export type LimitName = 'maxAltitude' | 'maxTilt' | 'maxVerticalSpeed' | 'maxRotationSpeed';
  export class FlightLimits {
    report(name: LimitName, range: SettingRange): void;
    range(name: LimitName): SettingRange | null;
    /** null when the drone has not reported this limit yet. */
    sanitize(name: LimitName, requested: number): number | null;
    readonly known: readonly LimitName[];
  }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/drone/limits.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlightLimits } from './limits.js';

const range = { current: 3, min: 1, max: 10 };

test('a limit is unknown until the drone reports it', () => {
  // Review Focus 2: never send a value before the drone states its range.
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
  // Review Focus 2: the firmware would reject an out-of-range value, which
  // looks like a broken control.
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
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npm test`
Expected: FAIL — `./limits.js` not found.

- [ ] **Step 3: Implement `FlightLimits`**

A `Map<LimitName, SettingRange>`. `known` returns the reported names in insertion order so
the interface can render only the rows the drone actually supports.

- [ ] **Step 4: Run the tests to watch them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/drone/limits.ts src/drone/limits.test.ts
git commit -m "feat: flight limits model driven by the drone's reported ranges"
```

---

### Task 5: Drone actions, guards and state

**Files:**
- Modify: `src/drone/drone.ts`
- Test: `src/drone/drone.test.ts`

**Interfaces:**
- Consumes: Task 2's builders, Task 3's parser and decoders, Task 4's `FlightLimits`.
- Produces, added to `Drone`:
  ```ts
  get limits(): FlightLimits;
  flatTrim(): Promise<void>;          // landed only
  flip(direction?: FlipDirection): Promise<void>;  // hovering only
  setLimit(name: LimitName, value: number): Promise<void>;
  takePicture(): Promise<void>;
  setLight(mode: LightMode, intensity: number): Promise<void>;
  ```
  and added to `DroneState`:
  ```ts
  picture: { taken: boolean; error: string } | null;
  light: { id: number; intensity: number } | null;
  ```

`init()` additionally routes every notification characteristic through `parseFrame` and
dispatches on `(project, class, cmd)`. The light row only ever appears because an
`UsbAccessoryState.LightState` notification arrived — that is the P4 probe.

- [ ] **Step 1: Write the failing tests**

```ts
// added to src/drone/drone.test.ts
test('flatTrim is refused while airborne', async () => {
  // Review Focus 4: it recalibrates the inertial horizon.
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
  // Review Focus 3: a flip on the ground is a crash.
  const { t, d } = await connected();
  await d.flip();
  assert.equal(t.on('fa0b').length, 0, 'not while landed');

  await d.takeOff();
  const duringTakeOff = t.on('fa0b').length;
  t.emit('fb0e', 0, 0, 0, 0, 0, 0, 1); // takingOff
  await d.flip();
  assert.equal(t.on('fa0b').length, duringTakeOff, 'not while taking off');

  t.emit('fb0e', 0, 0, 0, 0, 0, 0, 2); // hovering
  await d.flip('back');
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 4, 0, 0, 1, 0, 0, 0]);
  d.handleDisconnect();
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
  // clamped to 10 → float bytes 00 00 20 41
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 8, 0, 0, 0, 0, 0x20, 0x41]);
});

test('a picture failure reaches the state', async () => {
  // Review Focus 5: memoryFull and lowBattery are ordinary on this drone.
  const { t, d } = await connected();
  let last: { taken: boolean; error: string } | null = null;
  d.onState((s) => { last = s.picture; });
  t.emit('fb1b', 4, 1, 2, 2, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0);
  assert.deepEqual(last, { taken: false, error: 'memoryFull' });
});

test('a reported light becomes available, and nothing is assumed before', async () => {
  // P4 probe: the row exists only if the drone announces a light.
  const { t, d } = await connected();
  let seen: { id: number; intensity: number } | null = null;
  d.onState((s) => { seen = s.light; });
  assert.equal(seen, null);
  t.emit('fb1b', 4, 1, 2, 15, 0, 0, 0, 1, 0, 0, 0, 80, 0);
  assert.deepEqual(seen, { id: 0, intensity: 80 });
});
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npm test`
Expected: FAIL — the new methods do not exist.

- [ ] **Step 3: Implement the actions and the dispatcher**

`flatTrim` returns early when `this.airborne`. `flip` returns early unless the reported
state is `hovering` — the commanded-state shortcut used by `land` is wrong here, because a
flip needs a *stable* drone, not merely a commanded one. `setLimit` asks
`FlightLimits.sanitize` and returns early on `null`. `setLight` returns early when no light
has been reported.

The notification dispatcher replaces the per-characteristic handlers: subscribe every
characteristic in `NOTIFY_CHARS` to one handler that calls `parseFrame` and switches on
`(project, cls, cmd)`. Keep `fb0e` and `fb0f` working — they are the only notifications
proven in flight, so verify them first and do not fold them into the new path until the
existing tests still pass.

- [ ] **Step 4: Run the tests to watch them pass**

Run: `npm test`
Expected: PASS, including every pre-existing drone test.

- [ ] **Step 5: Commit**

```bash
git add src/drone
git commit -m "feat: flat trim, flips, limits, photo and light actions"
```

---

### Task 6: Settings rows and flight actions in the interface

**Files:**
- Modify: `index.html`, `css/app.css`, `src/ui/app.ts`, `src/i18n.ts`
- Test: `src/i18n.test.ts` (the completeness test covers the new labels)

- [ ] **Step 1: Add the labels in both languages**

New keys: `flatTrim`, `flip`, `photo`, `photoTaken`, `photoFailed`, `lights`, `lightOff`,
`lightFixed`, `lightBlinked`, `lightOscillated`, `intensity`, `maxAltitude`, `maxTilt`,
`maxVerticalSpeed`, `maxRotationSpeed`, `limitsUnavailable`, plus one error label per
picture error value. Run `npm test` — the completeness test fails for any key missing from
either dictionary.

- [ ] **Step 2: Add the flight actions**

`Flat trim` beside `Take off`, enabled only while landed. `Flip` and `Photo` in the centre
column, `Flip` enabled only while hovering. A picture outcome shows in the status bar,
using the error label when it failed.

- [ ] **Step 3: Add the settings rows**

One row per reported limit, rendered **only** for `drone.limits.known`, each a range input
bounded by the drone's own `min` and `max` and initialised to `current`. A row explaining
that limits are unavailable shows when nothing has been reported — including when
disconnected. The light row appears only when `state.light` is non-null, offering off,
fixed, blinked and oscillated plus an intensity.

- [ ] **Step 4: Verify in a browser**

Run: `npm run build`, serve the root, open it.
Expected: build clean; with no drone, the panel shows the language row and the
limits-unavailable row, no light row; switching language relabels everything, and the
dictionary test passes.

- [ ] **Step 5: Commit**

```bash
git add index.html css src/ui src/i18n.ts src/i18n.test.ts
git commit -m "feat: settings rows and flight actions for limits, flips, photo and lights"
```

---

### Task 7: Ship it

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Add the new modules to the precache list**

`dist/protocol/args.js`, `dist/protocol/parse.js`, `dist/drone/limits.js`. A module missing
from `SHELL` breaks offline flight, which is a requirement.

- [ ] **Step 2: Verify, then deploy**

Run: `npm test && npm run typecheck`, then push to `master`.
Expected: suite green, workflow green, and `sw.js` on the live site carries the new commit
SHA in its cache name.

- [ ] **Step 3: Verify the shell offline**

Serve locally, load the page, stop the server, reload.
Expected: the page still renders and the new modules load from the cache.

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: precache the new protocol modules"
```

---

### Task 8: Flight validation

No files. This is the plan's exit gate, and only the user can run it: it needs the drone and
the phone. Fresh battery, clear space, and a stiff piece of card within reach to stop the
drone by contact.

- [ ] **Step 1: Limits**

Connect and open the settings.
Expected: a row appears for each limit the drone reports, with its own bounds. Lower the
maximum altitude, take off, and climb — the drone should stop below the old ceiling.

- [ ] **Step 2: Flat trim**

With the drone landed on a flat surface, press Flat trim, then take off.
Expected: accepted while landed, unavailable in flight, and the drone drifts less.

- [ ] **Step 3: Flip**

Hover at a safe height in a clear space, then press Flip.
Expected: unavailable until the state reads hovering; the drone flips and recovers.

- [ ] **Step 4: Photo**

Press Photo in flight and while landed.
Expected: a visible outcome every time — taken, or a named error. Then confirm the file
exists by connecting the drone to a computer over USB; this app cannot retrieve it.

- [ ] **Step 5: LEDs — the P4 verdict**

Watch the settings panel after connecting.
Expected: either a light row appears, and the modes and intensity change the Night's LEDs —
or no row appears, which settles that the built-in LEDs are not reachable through
`UsbAccessory.LightControl`. **Record whichever happens in the spec**; either way the
question is closed.

- [ ] **Step 6: Record the tuning**

Note the limit values that fly well and commit them as the defaults.

```bash
git commit -am "tune: default flight limits from real flight"
```
