import { openTransport, requestDrone, type Transport } from '../transport/ble.js';
import { Drone, type DroneState } from '../drone/drone.js';
import { DualStickInput } from '../input/dualstick.js';
import { SlideToConfirm } from './slide-to-confirm.js';
import { watchForUpdates } from './updates.js';
import { NEUTRAL, type Axes } from '../axes.js';
import { LANGS, LANG_NAMES, resolveLang, t, type Key, type Lang } from '../i18n.js';
import { sameLimitSet, type LimitName } from '../drone/limits.js';
import type { LightMode } from '../protocol/frames.js';

const LOW_BATTERY = 10;
const LANG_STORAGE_KEY = 'perok.lang';

const FLIGHT_KEYS: Record<DroneState['flight'], Key> = {
  landed: 'flightLanded',
  takingOff: 'flightTakingOff',
  hovering: 'flightHovering',
  flying: 'flightFlying',
  landing: 'flightLanding',
  emergency: 'flightEmergency',
  rolling: 'flightRolling',
  init: 'flightInit',
  unknown: 'flightUnknown',
};

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element not found: ${id}`);
  return el as T;
}

function knobOf(stick: HTMLElement): HTMLElement {
  const knob = stick.querySelector<HTMLElement>('[data-knob]');
  if (!knob) throw new Error('Stick without a position indicator');
  return knob;
}

/**
 * Neither Screen Wake Lock nor orientation locking is described by the
 * standard library. We reach them through a local cast rather than adding a
 * global declaration that could clash.
 */
type WakeLockSentinel = { release(): Promise<void> };

const wakeLockApi = (): { request(type: string): Promise<WakeLockSentinel> } | undefined =>
  (navigator as unknown as { wakeLock?: { request(type: string): Promise<WakeLockSentinel> } })
    .wakeLock;

const orientationApi = (): { lock(orientation: string): Promise<void> } | undefined =>
  (screen as unknown as { orientation?: { lock(orientation: string): Promise<void> } })
    .orientation;

const connectBtn = byId<HTMLButtonElement>('connect');
const takeOffBtn = byId<HTMLButtonElement>('takeoff');
const landBtn = byId<HTMLButtonElement>('land');
const flightChip = byId('flight');
const batteryChip = byId('battery');
const leftStick = byId('stick-left');
const rightStick = byId('stick-right');
const leftKnob = knobOf(leftStick);
const rightKnob = knobOf(rightStick);
const cutoffTrack = byId('cutoff');
const settingsPanel = byId('settings');
const settingsOpenBtn = byId<HTMLButtonElement>('settings-open');
const settingsCloseBtn = byId<HTMLButtonElement>('settings-close');
const languageChoices = byId('language-choices');
const updateRow = byId('update-row');
const updateLabel = byId('update-label');
const updateApplyBtn = byId<HTMLButtonElement>('update-apply');
const versionValue = byId('version-value');

const flatTrimBtn = byId<HTMLButtonElement>('flattrim');
const flipBtn = byId<HTMLButtonElement>('flip');
const photoBtn = byId<HTMLButtonElement>('photo');
const notice = byId('notice');
const limitRows = byId('limit-rows');
const limitsUnavailable = byId('limits-unavailable');
const lightRow = byId('light-row');
const lightChoices = byId('light-choices');
const lightIntensity = byId<HTMLInputElement>('light-intensity');

const updates = watchForUpdates();
let pendingUpdate = false;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let renderedLimits: readonly LimitName[] = [];
const limitControls = new Map<LimitName, { input: HTMLInputElement; show: () => void }>();

const LIMIT_UNITS: Record<LimitName, string> = {
  maxAltitude: 'm',
  maxTilt: '°',
  maxVerticalSpeed: 'm/s',
  maxRotationSpeed: '°/s',
};

const LIMIT_LABELS: Record<LimitName, Key> = {
  maxAltitude: 'maxAltitude',
  maxTilt: 'maxTilt',
  maxVerticalSpeed: 'maxVerticalSpeed',
  maxRotationSpeed: 'maxRotationSpeed',
};

const PICTURE_ERROR_LABELS: Record<string, Key> = {
  busy: 'pictureErrorBusy',
  notAvailable: 'pictureErrorNotAvailable',
  memoryFull: 'pictureErrorMemoryFull',
  lowBattery: 'pictureErrorLowBattery',
};

const LIGHT_CHOICES: ReadonlyArray<{ key: Key; mode: LightMode; intensity: number | null }> = [
  { key: 'lightOff', mode: 'fixed', intensity: 0 },
  { key: 'lightFixed', mode: 'fixed', intensity: null },
  { key: 'lightBlinked', mode: 'blinked', intensity: null },
  { key: 'lightOscillated', mode: 'oscillated', intensity: null },
];

let transport: Transport | null = null;
let drone: Drone | null = null;
let sentinel: WakeLockSentinel | null = null;
let lastState: DroneState | null = null;

/* ---------- Language ---------- */

function readStoredLang(): string | null {
  // Storage can throw or come back empty in a private window; the app must
  // still start.
  try {
    return localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeLang(next: Lang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    /* ignored */
  }
}

let lang: Lang = resolveLang(readStoredLang(), navigator.languages ?? [navigator.language]);

function buildLanguageChoices(): void {
  languageChoices.replaceChildren();

  for (const option of LANGS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.textContent = LANG_NAMES[option];
    button.setAttribute('aria-pressed', String(option === lang));
    button.addEventListener('click', () => {
      setLang(option);
    });
    languageChoices.append(button);
  }
}

function setLang(next: Lang): void {
  lang = next;
  storeLang(next);
  render();
}

/* ---------- Rendering ---------- */

/** Static labels carry their key in the markup; dynamic ones are set below. */
function applyStaticLabels(): void {
  document.documentElement.lang = lang;

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as Key | undefined;
    if (key) el.textContent = t(lang, key);
  }

  leftStick.setAttribute('aria-label', t(lang, 'stickLeftAria'));
  rightStick.setAttribute('aria-label', t(lang, 'stickRightAria'));
  cutoffTrack.setAttribute('aria-label', t(lang, 'cutoffAria'));
  settingsCloseBtn.setAttribute('aria-label', t(lang, 'close'));
}

/**
 * A notice that clears itself. Used for the picture outcome, which is the one
 * thing the drone answers that is neither a state nor an error to log.
 */
function showNotice(text: string): void {
  notice.textContent = text;
  notice.hidden = false;
  if (noticeTimer !== null) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.hidden = true;
  }, 4000);
}

/**
 * One row per limit the drone has reported, bounded by the range it gave. The
 * value is sent on release, not while dragging: a slider emitting on every
 * pixel would flood a Bluetooth link that carries the flight commands.
 *
 * Rows are rebuilt only when the *set* of reported limits changes. Rebuilding
 * on every notification — a battery reading is enough — would detach an input
 * mid-drag: the drag is cancelled, `change` never fires on the detached node so
 * the value is silently dropped, and the replacement is seeded from the stale
 * one. `force` is for a language change, which must relabel everything.
 */
function buildLimitRows(force = false): void {
  const current = drone;
  const names = current ? current.limits.known : [];
  limitsUnavailable.hidden = names.length > 0;

  if (!force && sameLimitSet(renderedLimits, names) && limitControls.size === names.length) {
    for (const name of names) {
      const control = limitControls.get(name);
      const range = current?.limits.range(name);
      if (!control || !range) continue;

      control.input.min = String(range.min);
      control.input.max = String(range.max);

      // Never overwrite a value the pilot is holding.
      if (document.activeElement !== control.input) {
        control.input.value = String(range.current);
        control.show();
      }
    }
    return;
  }

  limitRows.replaceChildren();
  limitControls.clear();
  renderedLimits = names;

  for (const name of names) {
    const range = current?.limits.range(name);
    if (!range) continue;

    const row = document.createElement('div');
    row.className = 'panel-row';

    const label = document.createElement('span');
    label.className = 'panel-label';
    label.textContent = t(lang, LIMIT_LABELS[name]);

    const readout = document.createElement('span');
    readout.className = 'limit-value';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String((range.max - range.min) / 100 || 1);
    input.value = String(range.current);

    const show = (): void => {
      readout.textContent = `${Number(input.value).toFixed(1)} ${LIMIT_UNITS[name]}`;
    };
    show();

    input.addEventListener('input', show);
    input.addEventListener('change', () => {
      void drone?.setLimit(name, Number(input.value)).catch((error: unknown) => {
        console.error('Setting the limit failed', error);
      });
    });

    limitControls.set(name, { input, show });
    row.append(label, input, readout);
    limitRows.append(row);
  }
}

function buildLightChoices(): void {
  lightChoices.replaceChildren();

  for (const choice of LIGHT_CHOICES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.textContent = t(lang, choice.key);
    button.addEventListener('click', () => {
      const intensity = choice.intensity ?? Number(lightIntensity.value);
      void drone?.setLight(choice.mode, intensity).catch((error: unknown) => {
        console.error('Setting the lights failed', error);
      });
    });
    lightChoices.append(button);
  }
}

function renderStatus(): void {
  const current = drone;
  const live = current !== null;
  const hovering = live && lastState?.flight === 'hovering';

  connectBtn.textContent = t(lang, live ? 'disconnect' : 'connect');
  document.body.classList.toggle('connected', live);

  takeOffBtn.disabled = current === null || current.airborne;
  landBtn.disabled = current === null;
  // Flat trim realigns the inertial horizon: only ever on the ground.
  flatTrimBtn.disabled = current === null || current.airborne;
  // A flip needs a stable drone, so the reported state must say hovering.
  flipBtn.disabled = !hovering;
  photoBtn.disabled = current === null;

  lightRow.hidden = lastState?.light == null;

  // The settings panel overlays the flight controls, so it is locked while the
  // drone is in the air; the label says why rather than leaving a dead button.
  const airborne = current !== null && current.airborne;
  settingsOpenBtn.disabled = airborne;
  const settingsLabel = t(lang, airborne ? 'settingsLockedInFlight' : 'settingsAria');
  settingsOpenBtn.setAttribute('aria-label', settingsLabel);
  settingsOpenBtn.title = settingsLabel;

  if (!live || !lastState || lastState.connection === 'disconnected') {
    flightChip.textContent = t(lang, 'statusOffline');
    batteryChip.textContent = t(lang, 'batteryUnknown');
    document.body.classList.remove('low-battery');
    return;
  }

  flightChip.textContent = t(lang, FLIGHT_KEYS[lastState.flight]);
  batteryChip.textContent =
    lastState.battery === null
      ? t(lang, 'batteryUnknown')
      : t(lang, 'battery', { level: lastState.battery });
  document.body.classList.toggle(
    'low-battery',
    lastState.battery !== null && lastState.battery < LOW_BATTERY,
  );
}

/**
 * An update is applied at once when nothing is connected. With a live session
 * it waits: reloading would drop the Bluetooth link, and doing that to someone
 * holding an airborne drone is not acceptable.
 */
function renderUpdate(): void {
  updateRow.hidden = !pendingUpdate;
  const waiting = drone !== null;
  updateLabel.textContent = t(lang, waiting ? 'updateWaitsForLanding' : 'updateAvailable');
  updateApplyBtn.hidden = waiting;
}

function showVersion(): void {
  void updates.version().then((version) => {
    if (!version) return;
    const build = version.replace(/^perok-/, '');
    versionValue.textContent = build.startsWith('__') ? build : build.slice(0, 7);
  });
}

function render(): void {
  applyStaticLabels();
  buildLanguageChoices();
  buildLightChoices();
  // A language change must relabel every row, so the rebuild is forced.
  buildLimitRows(true);
  renderStatus();
  renderUpdate();
}

function onState(state: DroneState): void {
  const previousPicture = lastState?.picture;
  lastState = state;

  if (state.connection === 'disconnected') {
    teardown();
    return;
  }

  if (state.picture && state.picture !== previousPicture) {
    showNotice(
      state.picture.taken
        ? t(lang, 'photoTaken')
        : t(lang, PICTURE_ERROR_LABELS[state.picture.error] ?? 'pictureErrorUnknown'),
    );
  }

  // A newly reported limit adds a row, so the panel is rebuilt, not just
  // relabelled.
  buildLimitRows();
  renderStatus();
}

/* ---------- Sticks ---------- */

function placeKnob(stick: HTMLElement, knob: HTMLElement, x: number, y: number): void {
  const radius = Math.min(stick.clientWidth, stick.clientHeight) / 2;
  const travel = Math.max(0, radius - knob.offsetWidth / 2);
  knob.style.transform = `translate(${(x / 100) * travel}px, ${(-y / 100) * travel}px)`;
}

function showAxes(axes: Axes): void {
  // Same mapping as `combineSticks`: left moves, right climbs and turns. They
  // must agree, otherwise the indicator would lie about what is being sent.
  placeKnob(leftStick, leftKnob, axes.roll, axes.pitch);
  placeKnob(rightStick, rightKnob, axes.yaw, axes.gaz);
}

/* ---------- Connection ---------- */

async function acquireWakeLock(): Promise<void> {
  // A screen that sleeps in flight loses you the drone. A refusal is not
  // fatal: we fly anyway.
  try {
    sentinel = (await wakeLockApi()?.request('screen')) ?? null;
  } catch {
    sentinel = null;
  }
}

async function lockLandscape(): Promise<void> {
  // Outside installed mode this fails normally, and must stay silent.
  try {
    await orientationApi()?.lock('landscape');
  } catch {
    /* ignored */
  }
}

function teardown(): void {
  drone = null;
  transport = null;
  lastState = null;
  void sentinel?.release().catch(() => undefined);
  sentinel = null;
  showAxes(NEUTRAL);
  renderStatus();

  // The session is over: a deferred update can land now.
  if (pendingUpdate) updates.apply();
}

async function connect(): Promise<void> {
  const device = await requestDrone();

  transport = await openTransport(device, () => {
    drone?.handleDisconnect();
    teardown();
  });

  const connected = new Drone(transport);
  await connected.init();
  connected.onState(onState);
  drone = connected;

  renderStatus();
  await acquireWakeLock();
  await lockLandscape();
}

/* ---------- Wiring ---------- */

// Sticks and the cut-off are wired on load: the interface is then verifiable
// without a drone, and the indicators follow the finger right away.
new DualStickInput(leftStick, rightStick, (axes) => {
  showAxes(axes);
  drone?.setAxes(axes);
});

new SlideToConfirm(cutoffTrack, () => {
  void drone?.emergency().catch((error: unknown) => {
    console.error('Motor cut-off failed', error);
  });
});

connectBtn.addEventListener('click', () => {
  if (drone) {
    const current = drone;
    connectBtn.disabled = true;

    // Never drop the link on an airborne drone: command a landing first.
    // Without this, a stray thumb on this button cuts the link mid-hover.
    const settle = current.airborne ? current.land() : Promise.resolve();

    void settle
      .catch((error: unknown) => {
        console.error('Landing before disconnect failed', error);
      })
      .finally(() => {
        transport?.disconnect();
        current.handleDisconnect();
        teardown();
        connectBtn.disabled = false;
      });
    return;
  }

  connectBtn.disabled = true;
  void connect()
    .catch((error: unknown) => {
      console.error('Connection failed', error);
      teardown();
      flightChip.textContent = t(lang, 'connectionFailed');
    })
    .finally(() => {
      connectBtn.disabled = false;
    });
});

takeOffBtn.addEventListener('click', () => {
  void drone
    ?.takeOff()
    .catch((error: unknown) => {
      console.error('Take-off failed', error);
    })
    .finally(renderStatus);
});

landBtn.addEventListener('click', () => {
  void drone
    ?.land()
    .catch((error: unknown) => {
      console.error('Landing failed', error);
    })
    .finally(renderStatus);
});

flatTrimBtn.addEventListener('click', () => {
  void drone
    ?.flatTrim()
    .catch((error: unknown) => {
      console.error('Flat trim failed', error);
    })
    .finally(renderStatus);
});

flipBtn.addEventListener('click', () => {
  void drone?.flip().catch((error: unknown) => {
    console.error('Flip failed', error);
  });
});

photoBtn.addEventListener('click', () => {
  void drone?.takePicture().catch((error: unknown) => {
    console.error('Taking a picture failed', error);
  });
});

settingsOpenBtn.addEventListener('click', () => {
  if (drone?.airborne) return;
  settingsPanel.hidden = false;
  // Read it again on open: the worker may have claimed the page since load.
  showVersion();
});

settingsCloseBtn.addEventListener('click', () => {
  settingsPanel.hidden = true;
});

settingsPanel.addEventListener('click', (event) => {
  // Tapping the backdrop closes; tapping the card does not.
  if (event.target === settingsPanel) settingsPanel.hidden = true;
});

updateApplyBtn.addEventListener('click', () => {
  updates.apply();
});

updates.onReady(() => {
  pendingUpdate = true;
  if (drone === null) {
    updates.apply();
    return;
  }
  renderUpdate();
});

render();
showVersion();
showAxes(NEUTRAL);
