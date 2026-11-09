# Pilotage web du minidrone — première version volable

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une PWA installable qui connecte le Parrot Airborne Night en Bluetooth, le fait décoller, le pilote au doigt avec deux joysticks virtuels, et le repose — avec batterie, état de vol, atterrissage en un appui et coupure moteur protégée.

**Architecture :** Cinq couches empilées, reliées par un seul type partagé `Axes`. Les couches pures (bornage des axes, encodage des trames, décodage des notifications, boucle de commande) sont testées sous Node avec un transport factice ; les couches navigateur (BLE, joysticks, interface) se vérifient sur le téléphone. La boucle de commande émet en continu toutes les 50 ms, y compris à consignes nulles.

**Tech Stack :** TypeScript compilé par `tsc` seul, modules ES, sans bundler. Tests avec le lanceur intégré de Node. Hébergement GitHub Pages via GitHub Actions.

**Spec :** `docs/superpowers/specs/2026-11-09-perok-pilotage-web-design.md`

## Périmètre de ce plan

**P1 uniquement, avec le seul mode « deux joysticks »** — c'est la « première version volable » définie par la spec. Sont explicitement hors périmètre, et feront l'objet de plans ultérieurs : P2 (loopings, réglages, flat trim exposé à l'utilisateur), P3 (photo), P4 (LED), et les modes « joystick + boutons » et « joystick + inclinaison ».

Le *flat trim* est néanmoins émis automatiquement avant chaque décollage (Tâche 5) parce que l'implémentation de référence le fait et que c'est prouvé — ce qui est hors périmètre, c'est de l'exposer comme commande utilisateur.

## Global Constraints

- TypeScript compilé par **`tsc` seul**, modules **ES**, **aucun bundler**.
- Dépendances de développement limitées à **`typescript` et `@types/node`**. `@types/node` ne porte aucun code exécutable ; il est nécessaire pour typer `node:test`. **Amendement à la consigne « typescript et rien d'autre » — à confirmer par Paul.**
- Les types Web Bluetooth **n'existent pas** dans la bibliothèque standard de TypeScript : aucun paquet tiers, on déclare à la main le sous-ensemble utilisé (Tâche 4).
- `tsc` en modules ES impose des **imports suffixés `.js` dans le source TypeScript** (`import { clamp } from './axes.js'`). Non négociable, et source d'erreur classique.
- Dépôt `perok`, branche d'intégration et de déploiement **`master`**, dépôt **public**.
- Valeurs d'axes : entiers signés dans **`-100..100`**.
- Cadence de la boucle de commande : **50 ms**, émission continue même au neutre.
- UUID des services et caractéristiques : motif **`9a66XXXX-0800-9191-11e4-012d1540cb8e`**.
- Préfixes de nom BLE à filtrer : **`Maclan_`**, `RS_`, `Mars_`, `Travis_`, `Mambo_`, `Blaze_`, `Swat_`, `Swing_`.

## Review Focus

Classes d'entrée que la spec implique, que les tâches doivent couvrir, et qui mordraient un utilisateur réel — la plus probable d'abord.

1. **Débordement du compteur de séquence à 255.** À 50 ms, la caractéristique `fa0a` dépasse 255 envois en **12,8 secondes** : cela arrive à chaque vol, pas en cas limite. Le compteur doit boucler et les trames rester acceptées. → testé en Tâche 2.
2. **Valeurs d'axes négatives.** Elles doivent être encodées en complément à deux sur un octet signé ; une erreur de signe envoie le drone dans la direction opposée à la commande. → testé en Tâche 2.
3. **Dépassement des bornes par la géométrie du joystick.** Un doigt tiré au-delà du rayon produit mathématiquement plus de 100 : il faut borner avant encodage. → testé en Tâche 1.
4. **Déconnexion en plein vol** (extinction automatique du drone, sortie de portée). La boucle doit s'arrêter, aucune promesse ne doit être rejetée sans être traitée, et l'interface doit repasser à l'état déconnecté. → testé en Tâche 5.
5. **Commandes redondantes** — deux décollages de suite, atterrissage alors que le drone est déjà posé. La boucle ne doit ni tourner deux fois ni laisser fuir un intervalle. → testé en Tâche 5.

---

### Task 1: Mise en place du projet et type des axes

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore` (compléter), `src/axes.ts`
- Test: `src/axes.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `type Axes = { roll: number; pitch: number; yaw: number; gaz: number }` ; `const NEUTRAL: Axes` ; `function clamp(value: number): number` (borne à `-100..100` et arrondit à l'entier) ; `function applyDeadzone(value: number, deadzone: number): number` ; `function stickToAxes(dx: number, dy: number, radius: number): { x: number; y: number }`. Commandes : `npm run build`, `npm test`, `npm run typecheck`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// src/axes.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, applyDeadzone, stickToAxes, NEUTRAL } from './axes.js';

test('clamp borne aux valeurs extremes', () => {
  assert.equal(clamp(150), 100);
  assert.equal(clamp(-150), -100);
  assert.equal(clamp(0), 0);
  assert.equal(clamp(42.7), 43);
});

test('clamp borne le depassement geometrique du joystick', () => {
  // Review Focus 3 : doigt tire au-dela du rayon
  assert.equal(clamp(141), 100);
});

test('applyDeadzone annule sous le seuil et remet a l echelle au-dela', () => {
  assert.equal(applyDeadzone(5, 10), 0);
  assert.equal(applyDeadzone(-5, 10), 0);
  assert.equal(applyDeadzone(100, 10), 100);
  assert.equal(applyDeadzone(55, 10), 50);
});

test('stickToAxes normalise en pourcentage du rayon', () => {
  assert.deepEqual(stickToAxes(0, 0, 50), { x: 0, y: 0 });
  assert.deepEqual(stickToAxes(50, 0, 50), { x: 100, y: 0 });
  assert.deepEqual(stickToAxes(0, -50, 50), { x: 0, y: 100 });
});

test('NEUTRAL est a zero sur les quatre axes', () => {
  assert.deepEqual(NEUTRAL, { roll: 0, pitch: 0, yaw: 0, gaz: 0 });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: ÉCHEC — module `./axes.js` introuvable.

- [ ] **Step 3: Créer `package.json`, `tsconfig.json` et `src/axes.ts`**

`package.json` : `"type": "module"`, `devDependencies` limitées à `typescript` et `@types/node`, et les scripts `build` → `tsc`, `typecheck` → `tsc --noEmit`, `test` → `tsc && node --test dist`.

`tsconfig.json` : `target` et `module` en `ES2022`, `moduleResolution` `node16`, `lib` `["ES2022","DOM"]`, `types` `["node"]`, `strict` activé, `rootDir` `src`, `outDir` `dist`.

`applyDeadzone` remet à l'échelle linéairement sur l'intervalle restant, de sorte que la sortie atteigne toujours 100 au maximum de l'entrée. `stickToAxes` prend l'axe `y` de l'écran vers le haut comme positif (d'où le signe dans le test).

Ajouter `dist/` et `node_modules/` au `.gitignore`.

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: SUCCÈS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore src/axes.ts src/axes.test.ts
git commit -m "feat: mise en place du projet et normalisation des axes"
```

---

### Task 2: Encodage des trames de commande

**Files:**
- Create: `src/protocol/uuids.ts`, `src/protocol/sequence.ts`, `src/protocol/frames.ts`
- Test: `src/protocol/frames.test.ts`, `src/protocol/sequence.test.ts`

**Interfaces:**
- Consumes: `Axes` de `src/axes.ts`.
- Produces:
  - `function uuid(short: string): string`
  - `const SERVICE = { CMD: 'fa00', NOTIFY: 'fb00', FD21: 'fd21', FD51: 'fd51' }`
  - `const CHAR = { PCMD: 'fa0a', CMD: 'fa0b', EMERGENCY: 'fa0c', FLIGHT_STATE: 'fb0e', BATTERY: 'fb0f' }`
  - `const NOTIFY_CHARS: ReadonlyArray<readonly [string, string]>`
  - `class SequenceCounters { next(characteristic: string): number }`
  - `function encodeFrame(dataType: number, seq: number, project: number, cls: number, cmd: number, payload?: readonly number[]): Uint8Array`
  - `function currentDate(seq: number): Uint8Array`, `flatTrim(seq)`, `takeOff(seq)`, `land(seq)`, `emergency(seq)`, `flip(seq, direction?)`, `pcmd(seq: number, axes: Axes, active: boolean)`

**Toutes les valeurs d'octets ci-dessous sont reprises du spike qui a réellement fait voler ce drone.** Elles ne sont pas à « améliorer ».

- [ ] **Step 1: Écrire les tests qui échouent — compteurs de séquence**

```ts
// src/protocol/sequence.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SequenceCounters } from './sequence.js';

test('chaque caracteristique a son propre compteur, demarrant a 1', () => {
  const s = new SequenceCounters();
  assert.equal(s.next('fa0a'), 1);
  assert.equal(s.next('fa0a'), 2);
  assert.equal(s.next('fa0b'), 1);
});

test('le compteur boucle a 255 vers 0', () => {
  // Review Focus 1 : survient au bout de 12,8 s de vol sur fa0a
  const s = new SequenceCounters();
  for (let i = 0; i < 255; i++) s.next('fa0a');
  assert.equal(s.next('fa0a'), 0);
  assert.equal(s.next('fa0a'), 1);
});
```

- [ ] **Step 2: Écrire les tests qui échouent — trames**

```ts
// src/protocol/frames.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuid } from './uuids.js';
import { currentDate, flatTrim, takeOff, land, emergency, flip, pcmd } from './frames.js';

const bytes = (f: Uint8Array) => Array.from(f);

test('uuid compose le motif Parrot', () => {
  assert.equal(uuid('fa0a'), '9a66fa0a-0800-9191-11e4-012d1540cb8e');
});

test('trames de commande simples', () => {
  assert.deepEqual(bytes(flatTrim(7)),  [2, 7, 2, 0, 0, 0]);
  assert.deepEqual(bytes(takeOff(7)),   [4, 7, 2, 0, 1, 0]);
  assert.deepEqual(bytes(land(7)),      [4, 7, 2, 0, 3, 0]);
  assert.deepEqual(bytes(emergency(7)), [2, 7, 2, 0, 4, 0]);
  assert.deepEqual(bytes(flip(7)),      [4, 7, 2, 4, 0, 0, 2, 0, 0, 0]);
});

test('poignee de main : date courante en ASCII', () => {
  assert.deepEqual(bytes(currentDate(1)), [
    4, 1, 0, 4, 1, 0,
    0x32, 0x30, 0x31, 0x34, 0x2D, 0x31, 0x30, 0x2D, 0x32, 0x38, 0x00,
  ]);
});

test('pcmd au neutre : drapeau a 0, 19 octets', () => {
  const f = pcmd(3, { roll: 0, pitch: 0, yaw: 0, gaz: 0 }, false);
  assert.equal(f.length, 19);
  assert.deepEqual(bytes(f), [2, 3, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('pcmd actif : drapeau a 1 et axes dans l ordre roll, pitch, yaw, gaz', () => {
  const f = pcmd(3, { roll: 10, pitch: 20, yaw: 30, gaz: 40 }, true);
  assert.deepEqual(bytes(f).slice(0, 11), [2, 3, 2, 0, 2, 0, 1, 10, 20, 30, 40]);
});

test('pcmd encode les negatifs en complement a deux', () => {
  // Review Focus 2 : une erreur de signe inverse la commande
  const f = pcmd(3, { roll: -50, pitch: -100, yaw: -1, gaz: 0 }, true);
  assert.deepEqual(bytes(f).slice(7, 11), [206, 156, 255, 0]);
});

test('pcmd borne les valeurs hors intervalle', () => {
  const f = pcmd(3, { roll: 150, pitch: -150, yaw: 0, gaz: 0 }, true);
  assert.deepEqual(bytes(f).slice(7, 9), [100, 156]);
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: ÉCHEC — modules introuvables.

- [ ] **Step 4: Implémenter les trois modules**

`encodeFrame` produit `[dataType, seq, project, cls, cmd, 0, ...payload]`. `dataType` vaut 2 pour un envoi sans acquittement et 4 avec. Les identifiants proviennent de la spécification ARSDK : projet 0 = `common`, projet 2 = `minidrone` ; classe 0 = `Piloting` (`FlatTrim` 0, `TakeOff` 1, `PCMD` 2, `Landing` 3, `Emergency` 4), classe 4 = `Animations` (`Flip` 0).

`pcmd` écrit onze octets utiles puis huit octets nuls, soit 19. Les quatre axes passent par `clamp` puis sont écrits via une vue `Int8Array` sur le même tampon, ce qui produit le complément à deux sans calcul manuel.

`currentDate` encode la chaîne `2014-10-28` en ASCII suivie d'un octet nul. **Cette date est la valeur prouvée du spike ; ne pas la remplacer par la date du jour sans l'avoir testée en vol.**

`NOTIFY_CHARS` liste, dans cet ordre : `['fb00','fb0f']`, `['fb00','fb0e']`, `['fb00','fb1b']`, `['fb00','fb1c']`, `['fd21','fd22']`, `['fd21','fd23']`, `['fd21','fd24']`, `['fd51','fd52']`, `['fd51','fd53']`, `['fd51','fd54']`.

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: SUCCÈS.

- [ ] **Step 6: Commit**

```bash
git add src/protocol src/axes.ts
git commit -m "feat: encodage des trames de commande du minidrone"
```

---

### Task 3: Décodage des notifications

**Files:**
- Create: `src/protocol/notifications.ts`
- Test: `src/protocol/notifications.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `type FlightState = 'landed' | 'takingOff' | 'hovering' | 'unknown' | 'landing' | 'cutOff'` ; `function decodeFlightState(data: DataView): FlightState` ; `function decodeBattery(data: DataView): number` ; `function isFlying(state: FlightState): boolean`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// src/protocol/notifications.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFlightState, decodeBattery, isFlying } from './notifications.js';

const view = (...b: number[]) => new DataView(new Uint8Array(b).buffer);

test('decodeFlightState lit l octet d index 6', () => {
  assert.equal(decodeFlightState(view(0,0,0,0,0,0,0)), 'landed');
  assert.equal(decodeFlightState(view(0,0,0,0,0,0,1)), 'takingOff');
  assert.equal(decodeFlightState(view(0,0,0,0,0,0,2)), 'hovering');
  assert.equal(decodeFlightState(view(0,0,0,0,0,0,4)), 'landing');
  assert.equal(decodeFlightState(view(0,0,0,0,0,0,5)), 'cutOff');
});

test('decodeFlightState retombe sur unknown hors plage ou trame courte', () => {
  assert.equal(decodeFlightState(view(0,0,0,0,0,0,9)), 'unknown');
  assert.equal(decodeFlightState(view(0,0,0)), 'unknown');
});

test('decodeBattery lit le dernier octet', () => {
  assert.equal(decodeBattery(view(0,0,0,82)), 82);
  assert.equal(decodeBattery(view(0,0,0,9)), 9);
});

test('isFlying couvre les etats 1 a 4', () => {
  assert.equal(isFlying('landed'), false);
  assert.equal(isFlying('cutOff'), false);
  assert.equal(isFlying('takingOff'), true);
  assert.equal(isFlying('hovering'), true);
  assert.equal(isFlying('landing'), true);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: ÉCHEC — module introuvable.

- [ ] **Step 3: Implémenter `src/protocol/notifications.ts`**

L'ordre des états est fixé par la spec : `landed`, `takingOff`, `hovering`, `unknown`, `landing`, `cutOff`. Une trame de moins de 7 octets rend `unknown` plutôt que de lever.

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: SUCCÈS.

- [ ] **Step 5: Commit**

```bash
git add src/protocol/notifications.ts src/protocol/notifications.test.ts
git commit -m "feat: decodage de l etat de vol et de la batterie"
```

---

### Task 4: Transport Bluetooth

**Files:**
- Create: `src/types/web-bluetooth.d.ts`, `src/transport/ble.ts`
- Test: vérification par compilation ; le comportement se vérifie en Tâche 10.

**Interfaces:**
- Consumes: `SERVICE`, `CHAR`, `NOTIFY_CHARS`, `uuid` et `currentDate` de `src/protocol/`.
- Produces:
  ```ts
  export interface Transport {
    write(service: string, characteristic: string, frame: Uint8Array): Promise<void>;
    subscribe(service: string, characteristic: string,
              handler: (data: DataView) => void): Promise<void>;
    disconnect(): void;
    readonly connected: boolean;
  }
  export function requestDrone(): Promise<BluetoothDevice>;
  export function openTransport(device: BluetoothDevice,
                                onDisconnect: () => void): Promise<Transport>;
  ```

- [ ] **Step 1: Déclarer les types Web Bluetooth manquants**

TypeScript ne connaît pas `navigator.bluetooth`. Déclarer dans `src/types/web-bluetooth.d.ts` le strict sous-ensemble utilisé : `Navigator.bluetooth`, `Bluetooth.requestDevice`, `BluetoothDevice` (`name`, `gatt`, écouteurs d'événements), `BluetoothRemoteGATTServer`, `BluetoothRemoteGATTService`, `BluetoothRemoteGATTCharacteristic` (`writeValue`, `startNotifications`, `value`).

- [ ] **Step 2: Implémenter `requestDrone` et `openTransport`**

`requestDrone` appelle `navigator.bluetooth.requestDevice` avec un `namePrefix` par préfixe des contraintes globales, et **`optionalServices` contenant les quatre services** — sans quoi l'accès GATT est refusé après connexion.

`openTransport` enchaîne, dans cet ordre imposé par le spike : `device.gatt.connect()`, puis l'abonnement à chaque entrée de `NOTIFY_CHARS` **séquentiellement** (pas en parallèle), puis une **attente de 100 ms**, puis l'écriture de `currentDate`. Le transport met en cache services et caractéristiques pour éviter une redécouverte à chaque envoi, et branche `gattserverdisconnected` sur `onDisconnect`.

- [ ] **Step 3: Vérifier la compilation**

Run: `npm run typecheck`
Expected: SUCCÈS, aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/types src/transport
git commit -m "feat: transport bluetooth et types web bluetooth"
```

---

### Task 5: Modèle du drone et boucle de commande

**Files:**
- Create: `src/drone/loop.ts`, `src/drone/drone.ts`
- Test: `src/drone/loop.test.ts`, `src/drone/drone.test.ts`

**Interfaces:**
- Consumes: `Transport` de `src/transport/ble.ts` ; `flatTrim`, `takeOff`, `land`, `emergency`, `pcmd`, `SERVICE`, `CHAR` et `SequenceCounters` de `src/protocol/` ; `decodeFlightState`, `decodeBattery`, `isFlying` et `FlightState` de `src/protocol/notifications.ts` ; `Axes` et `NEUTRAL` de `src/axes.ts`.
- Produces:
  ```ts
  export class CommandLoop {
    constructor(transport: Transport, counters: SequenceCounters, intervalMs?: number);
    start(): void; stop(): void;
    setAxes(axes: Axes): void;
    readonly running: boolean;
  }
  export interface DroneState {
    connection: 'disconnected' | 'connected';
    flight: FlightState; battery: number | null;
  }
  export class Drone {
    constructor(transport: Transport);
    init(): Promise<void>;          // abonnements fb0e / fb0f
    onState(listener: (s: DroneState) => void): void;
    takeOff(): Promise<void>; land(): Promise<void>;
    emergency(): Promise<void>;
    setAxes(axes: Axes): void;
    handleDisconnect(): void;
  }
  ```

L'injection de `Transport` rend ces deux classes testables sous Node avec un transport factice. `intervalMs` vaut 50 par défaut et n'existe que pour les tests et le réglage.

- [ ] **Step 1: Écrire le transport factice**

Les deux classes se testent par injection. Cette doublure est l'interface que les tests partagent — créer `src/testing/fake-transport.ts` :

```ts
import type { Transport } from '../transport/ble.js';

export type Written = { service: string; characteristic: string; frame: number[] };

export class FakeTransport implements Transport {
  readonly written: Written[] = [];
  readonly handlers = new Map<string, (data: DataView) => void>();
  failNextWrite = false;
  connected = true;

  async write(service: string, characteristic: string, frame: Uint8Array): Promise<void> {
    if (this.failNextWrite) { this.failNextWrite = false; throw new Error('write failed'); }
    this.written.push({ service, characteristic, frame: Array.from(frame) });
  }
  async subscribe(_s: string, characteristic: string,
                  handler: (data: DataView) => void): Promise<void> {
    this.handlers.set(characteristic, handler);
  }
  disconnect(): void { this.connected = false; }

  /** Simule une notification du drone. */
  emit(characteristic: string, ...bytes: number[]): void {
    this.handlers.get(characteristic)?.(new DataView(new Uint8Array(bytes).buffer));
  }
  on(characteristic: string): Written[] {
    return this.written.filter((w) => w.characteristic === characteristic);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```

- [ ] **Step 2: Écrire les tests qui échouent — boucle de commande**

```ts
// src/drone/loop.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandLoop } from './loop.js';
import { SequenceCounters } from '../protocol/sequence.js';
import { FakeTransport, sleep } from '../testing/fake-transport.js';

const loopOn = (t: FakeTransport) => new CommandLoop(t, new SequenceCounters(), 10);

test('la boucle emet en continu meme au neutre', async () => {
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.start();
  await sleep(55);
  loop.stop();
  const sent = t.on('fa0a');
  assert.ok(sent.length >= 3, `attendu >= 3 envois, recu ${sent.length}`);
  assert.equal(sent[0].frame[6], 0, 'drapeau a 0 au neutre');
});

test('setAxes passe le drapeau a 1 et transmet les axes', async () => {
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.setAxes({ roll: 10, pitch: 0, yaw: 0, gaz: -20 });
  loop.start();
  await sleep(25);
  loop.stop();
  const f = t.on('fa0a')[0].frame;
  assert.equal(f[6], 1);
  assert.equal(f[7], 10);
  assert.equal(f[10], 236); // -20 en complement a deux
});

test('stop arrete toute emission', async () => {
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

test('start deux fois ne cree qu une seule boucle', async () => {
  // Review Focus 5 : pas de fuite d intervalle
  const t = new FakeTransport();
  const loop = loopOn(t);
  loop.start();
  loop.start();
  await sleep(55);
  loop.stop();
  assert.ok(t.on('fa0a').length <= 7, 'cadence doublee : intervalle fuite');
});

test('un echec d ecriture arrete la boucle sans rejet non traite', async () => {
  // Review Focus 4
  const t = new FakeTransport();
  const loop = loopOn(t);
  t.failNextWrite = true;
  loop.start();
  await sleep(40);
  assert.equal(loop.running, false);
});
```

- [ ] **Step 3: Écrire les tests qui échouent — modèle du drone**

```ts
// src/drone/drone.test.ts
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

test('takeOff emet flatTrim puis takeOff puis demarre la boucle', async () => {
  const { t, d } = await connected();
  await d.takeOff();
  const cmd = t.on('fa0b').map((w) => w.frame);
  assert.deepEqual(cmd[0].slice(2), [2, 0, 0, 0], 'flatTrim en premier');
  assert.deepEqual(cmd[1].slice(2), [2, 0, 1, 0], 'takeOff ensuite');
  await sleep(60);
  assert.ok(t.on('fa0a').length > 0, 'la boucle emet');
});

test('land emet land et arrete la boucle', async () => {
  const { t, d } = await connected();
  await d.takeOff();
  t.emit('fb0e', 0, 0, 0, 0, 0, 0, 2); // hovering
  await d.land();
  assert.deepEqual(t.on('fa0b').at(-1)!.frame.slice(2), [2, 0, 3, 0]);
  const count = t.on('fa0a').length;
  await sleep(40);
  assert.equal(t.on('fa0a').length, count);
});

test('emergency ecrit sur fa0c et arrete la boucle', async () => {
  const { t, d } = await connected();
  await d.takeOff();
  await d.emergency();
  assert.deepEqual(t.on('fa0c')[0].frame.slice(2), [2, 0, 4, 0]);
});

test('land alors que deja pose n emet rien et ne leve pas', async () => {
  // Review Focus 5
  const { t, d } = await connected();
  t.emit('fb0e', 0, 0, 0, 0, 0, 0, 0); // landed
  await d.land();
  assert.equal(t.on('fa0b').length, 0);
});

test('handleDisconnect arrete la boucle et notifie disconnected', async () => {
  // Review Focus 4
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

test('les notifications mettent a jour batterie et etat de vol', async () => {
  const { t, d } = await connected();
  let last = { battery: null as number | null, flight: '' };
  d.onState((s) => { last = { battery: s.battery, flight: s.flight }; });
  t.emit('fb0f', 0, 0, 0, 82);
  assert.equal(last.battery, 82);
  t.emit('fb0e', 0, 0, 0, 0, 0, 0, 2);
  assert.equal(last.flight, 'hovering');
});
```

Note d'interface : ces tests imposent à `Drone` une méthode **`init(): Promise<void>`** qui procède aux abonnements. L'ajouter au bloc Produces ci-dessus.

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: ÉCHEC — `./loop.js` et `./drone.js` introuvables.

- [ ] **Step 5: Implémenter `CommandLoop` puis `Drone`**

`CommandLoop` conserve les axes courants, émet `pcmd` toutes les `intervalMs` avec le drapeau à 1 dès qu'un axe est non nul, et s'arrête d'elle-même si une écriture échoue. `start()` sur une boucle déjà active ne fait rien.

`Drone` s'abonne à `fb0e` et `fb0f` via le transport, tient `DroneState`, et n'émet `land` que si l'état de vol n'est pas déjà `landed`. `emergency` écrit sur `CHAR.EMERGENCY` et arrête la boucle sans condition.

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: SUCCÈS.

- [ ] **Step 7: Commit**

```bash
git add src/drone src/testing
git commit -m "feat: modele du drone et boucle de commande continue"
```

---

### Task 6: Entrée à deux joysticks

**Files:**
- Create: `src/input/dualstick.ts`
- Test: `src/input/dualstick.test.ts`

**Interfaces:**
- Consumes: `Axes`, `NEUTRAL`, `clamp`, `applyDeadzone`, `stickToAxes` de `src/axes.ts`.
- Produces: `function combineSticks(left: {x:number;y:number}, right: {x:number;y:number}, deadzone?: number): Axes` ; `class DualStickInput { constructor(leftEl: HTMLElement, rightEl: HTMLElement, onChange: (a: Axes) => void); destroy(): void }`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// src/input/dualstick.test.ts
test('manche gauche : y vers gaz, x vers lacet', () => {
  const a = combineSticks({ x: 0, y: 100 }, { x: 0, y: 0 });
  assert.deepEqual(a, { roll: 0, pitch: 0, yaw: 0, gaz: 100 });
});

test('manche droit : y vers tangage, x vers roulis', () => {
  const a = combineSticks({ x: 0, y: 0 }, { x: 100, y: 100 });
  assert.deepEqual(a, { roll: 100, pitch: 100, yaw: 0, gaz: 0 });
});

test('la zone morte neutralise les petits ecarts', () => {
  assert.deepEqual(combineSticks({ x: 4, y: 0 }, { x: 0, y: 0 }, 10), NEUTRAL);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: ÉCHEC.

- [ ] **Step 3: Implémenter `combineSticks` puis `DualStickInput`**

La correspondance est fixée par la spec : manche **gauche** = altitude (`gaz`) et rotation (`yaw`) ; manche **droit** = tangage (`pitch`) et roulis (`roll`).

`DualStickInput` utilise les **événements pointeur** avec `setPointerCapture`, afin que le doigt reste suivi hors de la zone du manche, et traite les deux manches simultanément via `pointerId`. Au relâchement, le manche concerné revient à zéro. La zone morte par défaut est **10**, à ajuster en vol.

- [ ] **Step 4: Lancer les tests et la compilation**

Run: `npm test && npm run typecheck`
Expected: SUCCÈS.

- [ ] **Step 5: Commit**

```bash
git add src/input
git commit -m "feat: entree a deux joysticks virtuels"
```

---

### Task 7: Coquille d'interface

**Files:**
- Create: `index.html`, `css/app.css`, `src/ui/slide-to-confirm.ts`, `src/ui/app.ts`
- Test: vérification visuelle ; comportement en Tâche 10.

**Interfaces:**
- Consumes: `requestDrone`, `openTransport`, `Drone`, `DualStickInput`.
- Produces: `class SlideToConfirm { constructor(el: HTMLElement, onConfirm: () => void) }`.

- [ ] **Step 1: Écrire `index.html` et `css/app.css`**

Mise en page paysage : bandeau supérieur portant l'état de connexion, le pourcentage de batterie et l'état de vol ; les deux zones de manche en bas à gauche et à droite ; **« Atterrir » en un seul appui**, bien visible ; la piste de glissement de coupure moteur à l'écart des zones de pouce. Sous 10 % de batterie, le bandeau passe en alerte visible.

Le script se charge en `<script type="module" src="dist/ui/app.js">`.

- [ ] **Step 2: Implémenter `SlideToConfirm`**

Piste horizontale à parcourir entièrement du doigt pour déclencher. Un relâchement avant le bout annule et la poignée revient à sa position. C'est **la seule** voie vers la coupure moteur, conformément à la décision de Paul.

- [ ] **Step 3: Implémenter `src/ui/app.ts`**

Câble le bouton Connect sur `requestDrone` puis `openTransport`, instancie `Drone` et `DualStickInput`, abonne le bandeau à `onState`, et branche Atterrir et la coupure. Désactive les commandes de vol tant que l'état n'est pas `connected`.

- [ ] **Step 4: Maintenir l'écran allumé et verrouiller l'orientation**

Un écran qui s'éteint en vol fait perdre le drone : c'est un risque physique, pas un confort. Dans `src/ui/app.ts`, demander un `navigator.wakeLock.request('screen')` à la connexion et le relâcher à la déconnexion, en traitant l'absence de l'API et le rejet de la demande sans casser la page. Tenter aussi `screen.orientation.lock('landscape')`, dont l'échec hors mode installé est normal et doit rester silencieux.

- [ ] **Step 5: Vérifier la compilation et l'affichage**

Run: `npm run build` puis servir le dossier et ouvrir la page.
Expected: compilation sans erreur ; la mise en page tient en paysage sans défilement ; les manches réagissent au doigt sans drone connecté.

- [ ] **Step 6: Commit**

```bash
git add index.html css src/ui
git commit -m "feat: coquille d interface de pilotage"
```

---

### Task 8: Installation en PWA

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/` (192 et 512 px)
- Modify: `index.html` (lien du manifeste, enregistrement du service worker)

- [ ] **Step 1: Écrire le manifeste et les icônes**

`display` en `fullscreen`, `orientation` en `landscape`, `start_url` en `.`, et les deux icônes.

- [ ] **Step 2: Écrire `sw.js`**

JavaScript simple, hors TypeScript. Précache à l'installation la coquille complète — `index.html`, la feuille de style, tous les modules de `dist/`, le manifeste, les icônes — et sert depuis le cache en priorité. **L'application doit se lancer et voler sans réseau** : c'est un objectif de la spec, pas une optimisation. Versionner le nom du cache et purger les anciens à l'activation.

- [ ] **Step 3: Vérifier l'installabilité**

Run: servir en HTTPS ou sur `localhost`, ouvrir les outils de développement.
Expected: le service worker est actif ; l'application est proposée à l'installation ; rechargée hors réseau, elle s'affiche encore.

- [ ] **Step 4: Commit**

```bash
git add manifest.webmanifest sw.js icons index.html
git commit -m "feat: installation en PWA et fonctionnement hors reseau"
```

---

### Task 9: Déploiement sur GitHub Pages

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Écrire le workflow**

Déclenché sur `push` vers `master`. Installe Node, exécute `npm ci`, `npm test`, `npm run build`, puis publie sur Pages l'arborescence servie : `index.html`, `css/`, `dist/`, `icons/`, `manifest.webmanifest`, `sw.js`. **`dist/` n'est pas commité** — il est produit par le workflow.

- [ ] **Step 2: Créer le dépôt distant public et pousser**

```bash
gh repo create perok --public --source=. --remote=origin --push
```

- [ ] **Step 3: Activer Pages et vérifier**

Activer Pages avec GitHub Actions comme source, puis attendre la fin du workflow.
Expected: le workflow est vert et l'URL publique sert l'application en HTTPS.

- [ ] **Step 4: Commit**

```bash
git add .github
git commit -m "ci: deploiement sur github pages"
```

---

### Task 10: Vol de validation

**Files:** aucun. C'est la porte de sortie du plan.

Tout ce qui précède a été vérifié sans drone. Cette tâche est la seule preuve qui compte, et la spec impose qu'elle ait lieu **sur le téléphone**. Batterie du drone fraîchement clipsée, espace dégagé, et un carton rigide à portée de main pour couper le drone par contact en cas de besoin.

- [ ] **Step 1: Installer depuis l'URL Pages**

Ouvrir l'URL publique sur le Galaxy S25 dans Chrome, puis l'ajouter à l'écran d'accueil et la lancer depuis l'icône.
Expected: démarrage en plein écran paysage, sans barre d'adresse.

- [ ] **Step 2: Connexion**

Appuyer sur Connect, choisir le drone dans le sélecteur — son nom commence par
`Maclan_`.
Expected: le bandeau passe à connecté, affiche un pourcentage de batterie plausible et l'état `landed`.

- [ ] **Step 3: Décollage et vol stationnaire**

Expected: le drone décolle et tient le stationnaire ; l'état passe à `hovering`. **Laisser tourner plus de 15 secondes sans toucher aux manches** — cela franchit le débordement du compteur de séquence (Review Focus 1) et le drone doit continuer à répondre.

- [ ] **Step 4: Pilotage aux deux manches**

Expected: réponse continue et dosable, pas de saccade ; les quatre axes vont dans le sens attendu — un mauvais signe se verrait ici (Review Focus 2).

- [ ] **Step 5: Atterrissage en un appui**

Expected: le drone se pose, l'état repasse à `landed`, et la boucle cesse d'émettre.

- [ ] **Step 6: Coupure moteur par glissement**

Redécoller à faible hauteur, au-dessus d'une surface souple, puis parcourir la piste de glissement.
Expected: un appui simple ne déclenche rien ; le glissement complet coupe les moteurs.

- [ ] **Step 7: Perte de liaison**

Éteindre le drone en vol stationnaire, ou s'en éloigner au-delà de la portée.
Expected: l'interface repasse à déconnecté, aucune erreur non traitée en console, et une reconnexion est possible sans recharger la page (Review Focus 4).

- [ ] **Step 8: Consigner les réglages**

Noter les valeurs de zone morte et de courbe qui donnent un pilotage agréable, et les reporter dans le code puis commiter.

```bash
git commit -am "tune: zones mortes et courbes de reponse reglees en vol"
```
