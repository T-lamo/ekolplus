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
import frCommon from '../messages/fr/common.json';
import htCommon from '../messages/ht/common.json';
import enCommon from '../messages/en/common.json';
import frLogin from '../messages/fr/login.json';
import htLogin from '../messages/ht/login.json';
import enLogin from '../messages/en/login.json';

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

// Deep key-set equality per namespace — a message added to French but
// forgotten in Creole/English must fail `pnpm test`, not silently render
// as a missing-key fallback (or worse, leak the raw key) in production.
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('message files stay in sync across locales', () => {
  const namespaces = [
    { name: 'common', fr: frCommon, ht: htCommon, en: enCommon },
    { name: 'login', fr: frLogin, ht: htLogin, en: enLogin },
  ];

  it.each(namespaces)('$name: fr/ht/en share the exact same key set', ({ fr, ht, en }) => {
    const frKeys = keyPaths(fr)
      .filter((k) => k !== '_review')
      .sort();
    const htKeys = keyPaths(ht)
      .filter((k) => k !== '_review')
      .sort();
    const enKeys = keyPaths(en)
      .filter((k) => k !== '_review')
      .sort();
    expect(htKeys).toEqual(frKeys);
    expect(enKeys).toEqual(frKeys);
  });

  it.each(namespaces)('$name: no empty-string values in any locale', ({ name, fr, ht, en }) => {
    for (const [label, tree] of [
      ['fr', fr],
      ['ht', ht],
      ['en', en],
    ] as const) {
      const empties = keyPaths(tree).filter((path) => {
        const value = path.split('.').reduce<unknown>((acc, key) => {
          return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined;
        }, tree);
        return value === '';
      });
      expect(empties, `${label}.${name} has empty values: ${empties.join(', ')}`).toEqual([]);
    }
  });
});
