import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, LANG_NAMES, keys, pickLang, resolveLang, t } from './i18n.js';

test('pickLang follows the browser language', () => {
  assert.equal(pickLang(['fr-FR', 'en-US']), 'fr');
  assert.equal(pickLang(['en-GB']), 'en');
  assert.equal(pickLang(['fr']), 'fr');
});

test('pickLang falls back to English for an untranslated language', () => {
  assert.equal(pickLang(['de-DE', 'it']), 'en');
  assert.equal(pickLang([]), 'en');
});

test('pickLang takes the first recognised language, not the first one listed', () => {
  assert.equal(pickLang(['de-DE', 'fr-CA', 'en']), 'fr');
});

test('a stored choice wins over the browser', () => {
  assert.equal(resolveLang('en', ['fr-FR']), 'en');
  assert.equal(resolveLang('fr', ['en-US']), 'fr');
});

test('an invalid stored choice is ignored', () => {
  assert.equal(resolveLang('xx', ['fr-FR']), 'fr');
  assert.equal(resolveLang(null, ['fr-FR']), 'fr');
  assert.equal(resolveLang('', ['de']), 'en');
});

test('labels exist in both languages', () => {
  assert.equal(t('fr', 'takeOff'), 'Décoller');
  assert.equal(t('en', 'takeOff'), 'Take off');
  assert.equal(t('fr', 'flightHovering'), 'stationnaire');
  assert.equal(t('en', 'flightHovering'), 'hovering');
});

test('labels accept interpolation', () => {
  assert.equal(t('fr', 'battery', { level: 82 }), 'batterie 82 %');
  assert.equal(t('en', 'battery', { level: 82 }), 'battery 82%');
});

test('no translation is missing in any language', () => {
  // A forgotten label would leave French showing in the English interface.
  for (const key of keys()) {
    for (const lang of LANGS) {
      assert.ok(t(lang, key).length > 0, `empty label: ${lang}/${key}`);
    }
  }
  assert.ok(keys().length > 10, 'the dictionary must cover the whole interface');
});

test('every language is named in its own language', () => {
  assert.equal(LANG_NAMES.fr, 'Français');
  assert.equal(LANG_NAMES.en, 'English');
});
