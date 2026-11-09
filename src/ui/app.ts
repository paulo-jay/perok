import { openTransport, requestDrone, type Transport } from '../transport/ble.js';
import { Drone, type DroneState } from '../drone/drone.js';
import { DualStickInput } from '../input/dualstick.js';
import { SlideToConfirm } from './slide-to-confirm.js';
import { NEUTRAL, type Axes } from '../axes.js';

const LOW_BATTERY = 10;

const FLIGHT_LABELS: Record<DroneState['flight'], string> = {
  landed: 'posé',
  takingOff: 'décollage',
  hovering: 'stationnaire',
  unknown: 'indéterminé',
  landing: 'atterrissage',
  cutOff: 'moteurs coupés',
};

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Élément introuvable : ${id}`);
  return el as T;
}

function knobOf(stick: HTMLElement): HTMLElement {
  const knob = stick.querySelector<HTMLElement>('[data-knob]');
  if (!knob) throw new Error('Manche sans témoin de position');
  return knob;
}

/**
 * Ni Screen Wake Lock ni le verrouillage d'orientation ne sont décrits par la
 * bibliothèque standard. On les atteint par une conversion locale plutôt que
 * d'ajouter une déclaration globale susceptible d'entrer en conflit.
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

let transport: Transport | null = null;
let drone: Drone | null = null;
let sentinel: WakeLockSentinel | null = null;

function placeKnob(stick: HTMLElement, knob: HTMLElement, x: number, y: number): void {
  const radius = Math.min(stick.clientWidth, stick.clientHeight) / 2;
  const travel = Math.max(0, radius - knob.offsetWidth / 2);
  knob.style.transform = `translate(${(x / 100) * travel}px, ${(-y / 100) * travel}px)`;
}

function showAxes(axes: Axes): void {
  placeKnob(leftStick, leftKnob, axes.yaw, axes.gaz);
  placeKnob(rightStick, rightKnob, axes.roll, axes.pitch);
}

function setConnected(connected: boolean): void {
  document.body.classList.toggle('connected', connected);
  connectBtn.textContent = connected ? 'Déconnecter' : 'Connecter';
  takeOffBtn.disabled = !connected;
  landBtn.disabled = !connected;

  if (!connected) {
    flightChip.textContent = 'hors ligne';
    batteryChip.textContent = 'batterie —';
    document.body.classList.remove('low-battery');
  }
}

function render(state: DroneState): void {
  if (state.connection === 'disconnected') {
    teardown();
    return;
  }

  flightChip.textContent = FLIGHT_LABELS[state.flight];
  batteryChip.textContent =
    state.battery === null ? 'batterie —' : `batterie ${state.battery} %`;
  document.body.classList.toggle(
    'low-battery',
    state.battery !== null && state.battery < LOW_BATTERY,
  );
}

async function acquireWakeLock(): Promise<void> {
  // Un écran qui s'éteint en vol fait perdre le drone. Un refus n'est pas
  // bloquant : on vole quand même.
  try {
    sentinel = (await wakeLockApi()?.request('screen')) ?? null;
  } catch {
    sentinel = null;
  }
}

async function lockLandscape(): Promise<void> {
  // Hors mode installé, l'échec est normal et doit rester silencieux.
  try {
    await orientationApi()?.lock('landscape');
  } catch {
    /* ignoré */
  }
}

function teardown(): void {
  drone = null;
  transport = null;
  void sentinel?.release().catch(() => undefined);
  sentinel = null;
  showAxes(NEUTRAL);
  setConnected(false);
}

async function connect(): Promise<void> {
  const device = await requestDrone();

  transport = await openTransport(device, () => {
    drone?.handleDisconnect();
    teardown();
  });

  const connected = new Drone(transport);
  await connected.init();
  connected.onState(render);
  drone = connected;

  setConnected(true);
  flightChip.textContent = FLIGHT_LABELS.landed;

  await acquireWakeLock();
  await lockLandscape();
}

// Les manches et la coupure sont câblés dès le chargement : l'interface est
// ainsi vérifiable sans drone, et les témoins suivent le doigt tout de suite.
new DualStickInput(leftStick, rightStick, (axes) => {
  showAxes(axes);
  drone?.setAxes(axes);
});

new SlideToConfirm(byId('cutoff'), () => {
  void drone?.emergency().catch((error: unknown) => {
    console.error('Coupure moteur impossible', error);
  });
});

connectBtn.addEventListener('click', () => {
  if (drone) {
    transport?.disconnect();
    drone.handleDisconnect();
    teardown();
    return;
  }

  connectBtn.disabled = true;
  void connect()
    .catch((error: unknown) => {
      console.error('Connexion impossible', error);
      teardown();
      flightChip.textContent = 'connexion échouée';
    })
    .finally(() => {
      connectBtn.disabled = false;
    });
});

takeOffBtn.addEventListener('click', () => {
  void drone?.takeOff().catch((error: unknown) => {
    console.error('Décollage impossible', error);
  });
});

landBtn.addEventListener('click', () => {
  void drone?.land().catch((error: unknown) => {
    console.error('Atterrissage impossible', error);
  });
});

setConnected(false);
showAxes(NEUTRAL);
