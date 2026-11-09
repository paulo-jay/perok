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
  flightLanded: string;
  flightTakingOff: string;
  flightHovering: string;
  flightUnknown: string;
  flightLanding: string;
  flightCutOff: string;
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
  flightLanded: 'posé',
  flightTakingOff: 'décollage',
  flightHovering: 'stationnaire',
  flightUnknown: 'indéterminé',
  flightLanding: 'atterrissage',
  flightCutOff: 'moteurs coupés',
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
  flightLanded: 'landed',
  flightTakingOff: 'taking off',
  flightHovering: 'hovering',
  flightUnknown: 'unknown',
  flightLanding: 'landing',
  flightCutOff: 'motors cut',
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
