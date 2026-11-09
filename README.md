# Perok

Fly a 2015 Parrot Airborne Night minidrone from a phone, over Web Bluetooth, from an installable web page.

**Live app: https://paulo-jay.github.io/perok/**

---

## Why this exists

The drone still flies. The software that flew it is gone.

Parrot's *FreeFlight Mini* was pulled from the Play Store years ago. The last build you can still find, 5.5.9 from February 2019, ships native libraries for `armeabi`, `armeabi-v7a` and `x86` — and **no `arm64-v8a`**. Modern flagship phones are 64-bit only (a Galaxy S25 runs a Snapdragon 8 Elite, Oryon cores, ARMv9.2-A), so the installer refuses it for want of a matching ABI. It is not "too old" in the sense of a version check: there is simply no code in the package the phone can execute.

That leaves three options: find another app, patch the 2019 APK, or speak to the drone directly. Patching would mean recompiling Parrot's ARSDK3 for arm64 and re-injecting the native libraries into someone else's app — heavy, fragile, and permanently at the mercy of the next Android release.

So this project takes the third road. The minidrones speak Bluetooth Low Energy, and that protocol is documented and reachable from a browser. A throwaway spike, built on [poshaughnessy/web-bluetooth-parrot-drone](https://github.com/poshaughnessy/web-bluetooth-parrot-drone), proved the idea in an afternoon: a web page connected to the drone and made it take off. Everything here grew from that proof.

A web app also fixes the original problem for good. A progressive web app has no ABI and no `targetSdk`. It cannot be killed by the next Android version, and it needs no store.

## What it does

- **Installable PWA.** Add it to the home screen and it runs full screen, in landscape, like any other app. No sideloading, no store.
- **Works with no network.** Once installed, the whole shell is cached. You can fly it in a park with the phone in airplane mode — the Bluetooth link is between the phone and the drone, and nothing else is involved.
- **Two virtual joysticks.** Left stick moves the drone in all four directions; right stick controls altitude and heading. This is the game-controller convention — left moves, right looks — rather than a radio-transmitter layout.
- **Take off and land** in one tap each.
- **Emergency motor cut-off** behind a slide-to-confirm gesture. It cuts the motors, so the drone drops: a single stray tap must not be able to trigger it, while landing normally stays one tap away.
- **Battery level and flight state**, pushed by the drone, with a visible warning below 10%.
- **Screen stays awake** during flight, and the screen orientation is locked. A screen that sleeps mid-flight loses you the drone.

### What it deliberately does not do

- **No live video.** The hardware cannot. The Airborne Night's vertical camera is a VGA (640×480) stills sensor that writes to 1 GB of onboard flash; there is no stream to receive. Live FPV on Parrot's range was the Mambo FPV, the Jumping Sumo and the Bebop.
- **No photo download, flips, LED control or flight-limit settings** yet. The command set for most of these is documented and the groundwork is in place; they are simply not built.
- **Not every browser.** Web Bluetooth means Chrome, Edge or Samsung Internet on Android. iOS Safari and Firefox do not implement it. On desktop Linux, Chrome hides the API behind `chrome://flags/#enable-experimental-web-platform-features`, and upstream Chromium does not officially support it there — develop on Linux if you like, but validate on the phone.

### Hardware limits worth knowing

Roughly 20 m of range, about 9 minutes of battery, and the drone powers itself off after a few idle minutes. Reconnecting is a routine part of flying, not an error case.

## Supported drones

Developed against a **Parrot Airborne Night** (the "Maclane" livery), which advertises itself over BLE as `Maclan_` followed by digits — note the missing "e": Parrot truncates the advertised name, so a filter looking for `Maclane_` finds nothing.

The command set is shared across Parrot's minidrone range, so the device chooser also offers `RS_` (Rolling Spider), `Mars_` and `Travis_` (Airborne Cargo), `Blaze_` and `Swat_` (other Airborne Night liveries), `Mambo_` and `Swing_`. Those are **untested here** — reports welcome.

## Flying it

1. Open https://paulo-jay.github.io/perok/ in Chrome on an Android phone.
2. Add it to your home screen and launch it from there.
3. Clip in a freshly charged battery, then press **Connect** and pick your drone.
4. **Take off**, fly, **Land**.

> **Safety.** This commands a flying object with spinning propellers. Keep a way to stop the drone that does not depend on this app: holding a stiff piece of card up underneath it works — the drone senses the contact and shuts down. Fly your first flight in a clear space, and check the rules for flying in public where you live.

## How it is built

TypeScript compiled by `tsc` alone — ES modules, **no bundler**. The reasoning is the same one that rules out a native app: toolchains rot, the web does not. The only development dependencies are `typescript` and `@types/node`, and tests run on Node's built-in test runner. GitHub Pages serves the result.

### Architecture

Five layers, with one contract between them:

> **Four normalized axes are the only interface between the controls and everything else.**

Every control scheme produces nothing but `{ roll, pitch, yaw, gaz }`, each an integer in `-100..100`. Nothing downstream knows where those numbers came from, which is what makes a new control scheme cost one module and nothing else.

| Layer | Files | Responsibility |
|---|---|---|
| Transport | `src/transport/ble.ts` | BLE connection, GATT, characteristic cache, sequence counters, notification decoding. Knows nothing about flying. |
| Protocol | `src/protocol/` | UUIDs, command frame encoding, flight-state and battery decoding. Pure functions. |
| Command loop | `src/drone/loop.ts` | Sends the current axes every 50 ms, continuously, including at neutral. |
| Drone model | `src/drone/drone.ts` | Observable state and named actions: take off, land, cut off. |
| Input | `src/input/dualstick.ts` | Two virtual joysticks, normalized to the four axes. |
| UI | `src/ui/` | Status bar, flight controls, slide-to-confirm. |

### The protocol, in short

Everything below was read out of the spike that genuinely flew the drone, and cross-checked against Parrot's own `xml/minidrone.xml` in [Parrot-Developers/arsdk-xml](https://github.com/Parrot-Developers/arsdk-xml) — a file that has since been deleted from `master` but remains in the repository's history.

- UUIDs follow `9a66XXXX-0800-9191-11e4-012d1540cb8e`, where only the short segment varies.
- Service `fa00` carries the write-without-response command characteristics: `fa0a` for piloting setpoints, `fa0b` for take-off, landing, flat trim and flips, `fa0c` for the emergency cut-off.
- Service `fb00` carries notifications: `fb0e` holds the flight state in byte 6, `fb0f` the battery level in its last byte.
- A frame is `[dataType, sequence, project, class, command, 0, ...payload]`. Project 0 is `common`, project 2 is `minidrone`.
- **Every write characteristic carries its own sequence counter**, one byte wide. At 50 ms, `fa0a` passes 255 after **12.8 seconds** — so the wrap happens on every single flight, and getting it wrong is not an edge case.
- Connecting means: GATT connect, subscribe to all ten notification characteristics *sequentially*, wait 100 ms, then send `common.Common.CurrentDate`. The date value is inherited from the spike and is known to work; changing it is an in-flight experiment, not a cleanup.

### Why the command loop matters

The drone expects a *stream* of setpoints, not impulses. The original spike moved by firing bursts of forty steps per click, which is why it flew in lurches and could not be set down gently. Replacing that with a fixed 50 ms loop that always sends the current axes — zero included — is what turns it into something you can actually land.

### Testing

The pure layers carry real tests: frame encoding down to the byte, two's-complement handling of negative axes, sequence wrap, notification decoding, axis normalization, and the command loop itself driven through a fake transport. Run them with `npm test`.

What a test cannot prove is covered in a browser and in the air: Bluetooth, pointer handling, the service worker's offline behaviour, and a real flight — including a deliberate 15-second hover to cross the sequence-counter wrap.

## Development

```bash
npm install
npm test          # compiles, then runs the suite
npm run build     # compile only
npm run typecheck # no emit
```

Serve the repository root over HTTP and open it — Web Bluetooth needs a secure context, which `localhost` provides. To reach it from a phone on the same network, either forward the port over USB (`chrome://inspect`) so the phone sees it as `localhost`, or allow the origin under `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

Two things that will bite you:

- `tsc` in ES-module mode requires **`.js` extensions on relative imports in the TypeScript source** (`import { clamp } from './axes.js'`).
- Every path in the app is **relative**. GitHub Pages serves from a sub-path, where an absolute path would miss.

## Credits

- [poshaughnessy/web-bluetooth-parrot-drone](https://github.com/poshaughnessy/web-bluetooth-parrot-drone) — the Web Bluetooth proof this project started from, and the source of the working frame layouts.
- [Parrot-Developers/arsdk-xml](https://github.com/Parrot-Developers/arsdk-xml) — Parrot's own command specification.

Not affiliated with Parrot.
