# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Perok is an installable web app that flies a 2015 Parrot Airborne Night minidrone over
Web Bluetooth. `README.md` explains why the project exists and what it does;
`docs/superpowers/specs/2026-11-09-perok-pilotage-web-design.md` is the binding design
authority (written in French, like the plan beside it).

## Language

**Code is written in English** — comments, test names, identifiers. The design and plan
documents under `docs/superpowers/` are French: they are the historical record of the
conversations that produced this code, and are not rewritten after the fact.

User-facing strings are translated at runtime and belong in the i18n dictionary, never
inline in a template or a handler.

## Commands

```bash
npm install
npm test           # tsc, then the whole suite
npm run build      # tsc only, emits to dist/
npm run typecheck  # tsc --noEmit
```

Run a single test file, or a single test by name (both need `npm run build` first):

```bash
node --test dist/axes.test.js
node --test --test-name-pattern="clamp clamps extreme values" "dist/**/*.test.js"
```

A name pattern reports the non-matching files as passing with zero tests inside; only the
matching test actually runs.

## Non-negotiable constraints

These are design decisions, not preferences. Changing one needs a reason in the spec.

- **`tsc` alone, no bundler.** Development dependencies are limited to `typescript` and
  `@types/node` (the latter only so `node:test` can be typed; it ships no runtime code).
  The anti-goal is a toolchain that stops building in two years — which is exactly what
  killed the original app.
- **ES modules, so relative imports in the TypeScript source carry `.js` extensions**
  (`import { clamp } from './axes.js'`). This is the single most common mistake here.
- **Every path in the shipped app is relative.** GitHub Pages serves from a sub-path;
  an absolute path misses. This applies to `index.html`, the manifest, and the service
  worker's precache list.
- **New app modules must be added to the service worker's precache list** in `sw.js`, or
  offline flight breaks — and offline is a requirement, not an optimisation.
- **The integration branch is `master`** (not `main`), and it is also the deploy branch:
  pushing to it deploys.

## Architecture

Five layers with a single contract between them:

> **Four normalized axes are the only interface between the controls and everything else.**

A control scheme produces nothing but `{ roll, pitch, yaw, gaz }`, each an integer in
`-100..100` (`src/axes.ts`). Nothing downstream knows where those numbers came from, which
is what makes an additional control scheme cost one input module and nothing else.

- `src/protocol/` — pure functions. `uuids.ts` (UUID pattern, service and characteristic
  ids, the notification subscription list), `frames.ts` (command frame encoding),
  `sequence.ts` (per-characteristic counters), `notifications.ts` (flight state, battery).
- `src/transport/ble.ts` — `requestDrone()` and `openTransport()`. **The transport owns the
  sequence counters**, because the connection handshake already writes on `fa0b`: a
  separate counter in the drone model would restart at a sequence the drone has just seen
  and may discard as a duplicate.
- `src/drone/loop.ts` — sends the current axes every 50 ms, continuously, neutral included.
  The drone expects a stream, not impulses.
- `src/drone/drone.ts` — observable state and named actions.
- `src/input/dualstick.ts` — two virtual joysticks. Left stick moves (pitch and roll),
  right stick handles altitude and heading (gaz and yaw): the game-controller convention.
- `src/ui/` — status bar, flight controls, slide-to-confirm gesture.
- `src/testing/fake-transport.ts` — a working `Transport` implementation that makes the
  loop and the drone model testable under Node. Excluded from the deployed site.

### Things that are easy to get wrong

- **The sequence counter wraps on every flight.** At 50 ms, `fa0a` passes 255 after 12.8
  seconds. Treat it as a normal path, never an edge case.
- **Negative axis values** are written through an `Int8Array` view over the frame's own
  buffer, which produces two's complement with no hand arithmetic. A sign error here sends
  the drone the opposite way to the command, silently.
- **Reported flight state lags.** It is initialised to `landed` and only changes when an
  `fb0e` notification arrives, so code must not rely on it alone to decide whether the
  drone is airborne — use `Drone.airborne`, which also considers what has been commanded.
  Getting this wrong once left "Land" mute during the whole take-off.
- **A failed write is not a lost link.** Stopping the command loop on a single rejection
  leaves the drone hovering with dead sticks. Give up only when the transport reports a
  disconnect, or after repeated consecutive failures.
- **The service worker cache name carries the build id**, substituted from `github.sha` by
  the deploy workflow. A fixed cache name made deployments invisible: `sw.js` stayed
  byte-identical, the browser saw no update, and installed phones served the first shell
  forever.
- **The frame byte layouts and the handshake date come from a spike that genuinely flew
  this drone.** They are evidence. Do not "clean them up" — in particular the hardcoded
  handshake date — without testing in flight.

## Testing

Only the pure layers are testable under Node: frame encoding, sequence counters,
notification decoding, axis normalization, and the command loop driven through
`FakeTransport`. BLE, pointer handling, service-worker behaviour and layout are verified in
a real browser; flight behaviour is verified by flying.

Write the failing test first. The byte-level faults this codebase is exposed to — a wrong
sign, a wrong offset, a counter that does not wrap — are invisible on inspection and
obvious in a test.

## Deployment

`.github/workflows/pages.yml` runs on every push to `master`: `npm ci`, `npm test`,
`npm run build`, then assembles the served tree (`index.html`, `css/`, `dist/` minus tests,
`icons/`, the manifest, and `sw.js` with its build id substituted) and publishes it to
GitHub Pages.

`.npmrc` pins the public npm registry on purpose: a machine behind a local npm mirror
otherwise bakes its own URLs into `package-lock.json`, and `npm ci` then fails in CI with
`ECONNREFUSED`.
