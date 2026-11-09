export type Lang = 'fr' | 'en';

export const LANGS: readonly Lang[] = ['fr', 'en'];

/**
 * English is the fallback for any language the interface does not translate:
 * it is the likeliest second language of a visitor who speaks neither.
 */
const FALLBACK: Lang = 'en';

/** Each language named in its own language, as a language picker should. */
export const LANG_NAMES: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
};

type Dict = {
  connect: string;
  disconnect: string;
  takeOff: string;
  land: string;
  cutoffLabel: string;
  cutoffAria: string;
  stickLeftHint: string;
  stickLeftAria: string;
  stickRightHint: string;
  stickRightAria: string;
  statusOffline: string;
  connectionFailed: string;
  battery: string;
  batteryUnknown: string;
  settings: string;
  settingsAria: string;
  close: string;
  language: string;
  settingsLockedInFlight: string;
  version: string;
  updateAvailable: string;
  applyUpdate: string;
  updateWaitsForLanding: string;
  flatTrim: string;
  flip: string;
  photo: string;
  photoTaken: string;
  pictureErrorUnknown: string;
  pictureErrorBusy: string;
  pictureErrorNotAvailable: string;
  pictureErrorMemoryFull: string;
  pictureErrorLowBattery: string;
  lights: string;
  lightOff: string;
  lightFixed: string;
  lightBlinked: string;
  lightOscillated: string;
  intensity: string;
  maxAltitude: string;
  maxTilt: string;
  maxVerticalSpeed: string;
  maxRotationSpeed: string;
  limitsUnavailable: string;
  flightLanded: string;
  flightTakingOff: string;
  flightHovering: string;
  flightFlying: string;
  flightLanding: string;
  flightEmergency: string;
  flightRolling: string;
  flightInit: string;
  flightUnknown: string;
};

export type Key = keyof Dict;

const FR: Dict = {
  connect: 'Connecter',
  disconnect: 'Déconnecter',
  takeOff: 'Décoller',
  land: 'Atterrir',
  cutoffLabel: 'Glisser pour couper les moteurs',
  cutoffAria: 'Coupure moteur : glisser jusqu’au bout pour confirmer',
  stickLeftHint: 'déplacement',
  stickLeftAria: 'Manche gauche : déplacement dans les quatre directions',
  stickRightHint: 'altitude · cap',
  stickRightAria: 'Manche droit : altitude et orientation',
  statusOffline: 'hors ligne',
  connectionFailed: 'connexion échouée',
  battery: 'batterie {level} %',
  batteryUnknown: 'batterie —',
  settings: 'Paramètres',
  settingsAria: 'Ouvrir les paramètres',
  close: 'Fermer',
  language: 'Langue',
  settingsLockedInFlight: 'Posez le drone pour ouvrir les paramètres.',
  version: 'Version',
  updateAvailable: 'Mise à jour disponible',
  applyUpdate: 'Appliquer',
  updateWaitsForLanding: 'Mise à jour prête, appliquée dès la déconnexion.',
  flatTrim: 'Calibrer',
  flip: 'Looping',
  photo: 'Photo',
  photoTaken: 'photo prise',
  pictureErrorUnknown: 'échec photo',
  pictureErrorBusy: 'caméra occupée',
  pictureErrorNotAvailable: 'caméra indisponible',
  pictureErrorMemoryFull: 'mémoire pleine',
  pictureErrorLowBattery: 'batterie trop faible',
  lights: 'LED',
  lightOff: 'Éteintes',
  lightFixed: 'Fixes',
  lightBlinked: 'Clignotantes',
  lightOscillated: 'Oscillantes',
  intensity: 'Intensité',
  maxAltitude: 'Altitude max',
  maxTilt: 'Inclinaison max',
  maxVerticalSpeed: 'Vitesse verticale max',
  maxRotationSpeed: 'Vitesse de rotation max',
  limitsUnavailable: 'Limites de vol disponibles une fois le drone connecté.',
  flightLanded: 'posé',
  flightTakingOff: 'décollage',
  flightHovering: 'stationnaire',
  flightFlying: 'en vol',
  flightLanding: 'atterrissage',
  flightEmergency: 'moteurs coupés',
  flightRolling: 'roulage',
  flightInit: 'initialisation',
  flightUnknown: 'indéterminé',
};

const EN: Dict = {
  connect: 'Connect',
  disconnect: 'Disconnect',
  takeOff: 'Take off',
  land: 'Land',
  cutoffLabel: 'Slide to cut the motors',
  cutoffAria: 'Motor cut-off: slide all the way to confirm',
  stickLeftHint: 'movement',
  stickLeftAria: 'Left stick: movement in all four directions',
  stickRightHint: 'altitude · heading',
  stickRightAria: 'Right stick: altitude and heading',
  statusOffline: 'offline',
  connectionFailed: 'connection failed',
  battery: 'battery {level}%',
  batteryUnknown: 'battery —',
  settings: 'Settings',
  settingsAria: 'Open settings',
  close: 'Close',
  language: 'Language',
  settingsLockedInFlight: 'Land the drone to open the settings.',
  version: 'Version',
  updateAvailable: 'Update available',
  applyUpdate: 'Apply',
  updateWaitsForLanding: 'Update ready, applied as soon as you disconnect.',
  flatTrim: 'Flat trim',
  flip: 'Flip',
  photo: 'Photo',
  photoTaken: 'picture taken',
  pictureErrorUnknown: 'picture failed',
  pictureErrorBusy: 'camera busy',
  pictureErrorNotAvailable: 'camera unavailable',
  pictureErrorMemoryFull: 'memory full',
  pictureErrorLowBattery: 'battery too low',
  lights: 'Lights',
  lightOff: 'Off',
  lightFixed: 'Fixed',
  lightBlinked: 'Blinking',
  lightOscillated: 'Oscillating',
  intensity: 'Intensity',
  maxAltitude: 'Max altitude',
  maxTilt: 'Max tilt',
  maxVerticalSpeed: 'Max vertical speed',
  maxRotationSpeed: 'Max rotation speed',
  limitsUnavailable: 'Flight limits available once the drone is connected.',
  flightLanded: 'landed',
  flightTakingOff: 'taking off',
  flightHovering: 'hovering',
  flightFlying: 'flying',
  flightLanding: 'landing',
  flightEmergency: 'motors cut',
  flightRolling: 'rolling',
  flightInit: 'starting up',
  flightUnknown: 'unknown',
};

const DICTS: Record<Lang, Dict> = { fr: FR, en: EN };

/** Every translation key, so a test can prove none is missing. */
export function keys(): readonly Key[] {
  return Object.keys(EN) as Key[];
}

function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

/**
 * First translated language among the browser's preferences. A browser that
 * asks for German and then French gets French, not the fallback.
 */
export function pickLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base && isLang(base)) return base;
  }
  return FALLBACK;
}

/** An explicit choice always wins; an unreadable one is ignored. */
export function resolveLang(stored: string | null, preferred: readonly string[]): Lang {
  if (stored && isLang(stored)) return stored;
  return pickLang(preferred);
}

export function t(
  lang: Lang,
  key: Key,
  vars?: Readonly<Record<string, string | number>>,
): string {
  const template = DICTS[lang][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
