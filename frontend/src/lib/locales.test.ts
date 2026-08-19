// Locale registry — the accessibility/consistency guard behind
// « Paramètres › Langue » mirrors src/lib/themes.test.ts's role for
// themes. This file's first describe block only needs the registry
// itself; a second block (added once the message JSON files exist, in a
// later task) asserts the three message trees stay key-for-key identical.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE_NAME,
  LOCALE_KEYS,
  isLocaleKey,
  matchAcceptLanguage,
  resolveLocaleKey,
} from './locales';

describe('locale registry', () => {
  it('lists exactly fr, ht, en — French default first', () => {
    expect(LOCALE_KEYS).toEqual(['fr', 'ht', 'en']);
    expect(DEFAULT_LOCALE).toBe('fr');
    expect(LOCALES.map((l) => l.key)).toEqual(['fr', 'ht', 'en']);
  });

  it('every locale has its own native name, never translated', () => {
    const names = Object.fromEntries(LOCALES.map((l) => [l.key, l.nativeName]));
    expect(names).toEqual({ fr: 'Français', ht: 'Kreyòl Ayisyen', en: 'English' });
  });

  it('validates keys strictly and falls back to French', () => {
    expect(isLocaleKey('ht')).toBe(true);
    expect(isLocaleKey('es')).toBe(false);
    expect(isLocaleKey(null)).toBe(false);
    expect(resolveLocaleKey('en')).toBe('en');
    expect(resolveLocaleKey('xx')).toBe('fr');
    expect(resolveLocaleKey(undefined)).toBe('fr');
  });

  it("cookie name is app-owned, not next-intl's default", () => {
    expect(LOCALE_COOKIE_NAME).toBe('sg-locale');
  });
});

describe('matchAcceptLanguage', () => {
  it('matches the first supported language in preference order', () => {
    expect(matchAcceptLanguage('en-US,en;q=0.9,fr;q=0.8')).toBe('en');
    expect(matchAcceptLanguage('fr-FR,fr;q=0.9')).toBe('fr');
    expect(matchAcceptLanguage('de-DE,de;q=0.9,en;q=0.8')).toBe('en');
  });

  it('falls back to French when nothing matches or the header is absent', () => {
    expect(matchAcceptLanguage('de-DE,es-ES')).toBe('fr');
    expect(matchAcceptLanguage(null)).toBe('fr');
    expect(matchAcceptLanguage(undefined)).toBe('fr');
    expect(matchAcceptLanguage('')).toBe('fr');
  });

  it('matches on the primary subtag (fr-CA still matches fr)', () => {
    expect(matchAcceptLanguage('fr-CA')).toBe('fr');
  });
});
