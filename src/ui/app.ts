import { openTransport, requestDrone, type Transport } from '../transport/ble.js';
import { Drone, type DroneState } from '../drone/drone.js';
import { DualStickInput } from '../input/dualstick.js';
import { SlideToConfirm } from './slide-to-confirm.js';
import { NEUTRAL, type Axes } from '../axes.js';
import { LANGS, LANG_NAMES, resolveLang, t, type Key, type Lang } from '../i18n.js';

const LOW_BATTERY = 10;
const LANG_STORAGE_KEY = 'perok.lang';

const FLIGHT_KEYS: Record<DroneState['flight'], Key> = {
  landed: 'flightLanded',
  takingOff: 'flightTakingOff',
  hovering: 'flightHovering',
  unknown: 'flightUnknown',
  landing: 'flightLanding',
  cutOff: 'flightCutOff',
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

function renderStatus(): void {
  const current = drone;
  const live = current !== null;

  connectBtn.textContent = t(lang, live ? 'disconnect' : 'connect');
  document.body.classList.toggle('connected', live);

  takeOffBtn.disabled = current === null || current.airborne;
  landBtn.disabled = current === null;

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

function render(): void {
  applyStaticLabels();
  buildLanguageChoices();
  renderStatus();
}

function onState(state: DroneState): void {
  lastState = state;

  if (state.connection === 'disconnected') {
    teardown();
    return;
  }

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

settingsOpenBtn.addEventListener('click', () => {
  if (drone?.airborne) return;
  settingsPanel.hidden = false;
});

settingsCloseBtn.addEventListener('click', () => {
  settingsPanel.hidden = true;
});

settingsPanel.addEventListener('click', (event) => {
  // Tapping the backdrop closes; tapping the card does not.
  if (event.target === settingsPanel) settingsPanel.hidden = true;
});

render();
showAxes(NEUTRAL);
