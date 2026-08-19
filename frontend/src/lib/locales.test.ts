// Locale registry — the accessibility/consistency guard behind
// « Paramètres › Langue » mirrors src/lib/themes.test.ts's role for
// themes. The first two describe blocks test the registry itself; the
// rest scan src/messages/ on disk against MESSAGE_NAMESPACES, so a
// namespace forgotten in one locale — or never registered at all — fails
// `pnpm test` instead of silently breaking at runtime for non-French
// users.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE_NAME,
  LOCALE_KEYS,
  MESSAGE_NAMESPACES,
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

// This test file lives at src/lib/locales.test.ts; src/messages/ is a
// sibling of src/lib — same "__dirname-relative path" pattern already
// used in src/lib/server/observability/runtime-enforcement.test.ts.
const MESSAGES_DIR = join(__dirname, '..', 'messages');

function namespacesOnDisk(locale: string): string[] {
  return readdirSync(join(MESSAGES_DIR, locale))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

function readNamespace(locale: string, namespace: string): unknown {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, locale, `${namespace}.json`), 'utf8'));
}

describe('message-namespace registry stays in sync with disk', () => {
  it('MESSAGE_NAMESPACES matches the fr/ directory listing exactly', () => {
    expect([...MESSAGE_NAMESPACES].sort()).toEqual(namespacesOnDisk('fr'));
  });

  it.each(['ht', 'en'] as const)('%s/ has the exact same namespace files as fr/', (locale) => {
    expect(namespacesOnDisk(locale)).toEqual(namespacesOnDisk('fr'));
  });
});

// request.ts and next-intl.d.ts stay hand-written explicit lists (Next's
// bundler and TypeScript's structural typing both need real, static
// declarations — MESSAGE_NAMESPACES can't replace either) — but a
// namespace added to the registry+disk and forgotten in either file must
// fail here instead of throwing MISSING_MESSAGE at runtime for non-French
// users. Mirrors runtime-enforcement.test.ts's readFileSync + toContain
// pattern.
const REQUEST_SRC = readFileSync(join(__dirname, '..', 'i18n', 'request.ts'), 'utf8');
const TYPES_SRC = readFileSync(join(__dirname, '..', 'types', 'next-intl.d.ts'), 'utf8');

function pascalCase(namespace: string): string {
  return namespace.charAt(0).toUpperCase() + namespace.slice(1);
}

describe('message-namespace registry stays in sync with i18n/request.ts', () => {
  it.each(MESSAGE_NAMESPACES)('%s: imported from the message file', (namespace) => {
    expect(REQUEST_SRC).toContain('`../messages/${locale}/' + namespace + '.json`');
  });

  it.each(MESSAGE_NAMESPACES)('%s: returned under its PascalCase key', (namespace) => {
    expect(REQUEST_SRC).toContain(`${pascalCase(namespace)}: ${namespace}.default`);
  });
});

describe('message-namespace registry stays in sync with next-intl.d.ts', () => {
  it.each(MESSAGE_NAMESPACES)('%s: imported as a type from the fr message file', (namespace) => {
    expect(TYPES_SRC).toContain(`import type ${namespace} from '@/messages/fr/${namespace}.json'`);
  });

  it.each(MESSAGE_NAMESPACES)('%s: declared under AppConfig.Messages', (namespace) => {
    expect(TYPES_SRC).toContain(`${pascalCase(namespace)}: typeof ${namespace};`);
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
  it.each(MESSAGE_NAMESPACES)('%s: fr/ht/en share the exact same key set', (namespace) => {
    const frKeys = keyPaths(readNamespace('fr', namespace))
      .filter((k) => k !== '_review')
      .sort();
    const htKeys = keyPaths(readNamespace('ht', namespace))
      .filter((k) => k !== '_review')
      .sort();
    const enKeys = keyPaths(readNamespace('en', namespace))
      .filter((k) => k !== '_review')
      .sort();
    expect(htKeys).toEqual(frKeys);
    expect(enKeys).toEqual(frKeys);
  });

  it.each(MESSAGE_NAMESPACES)('%s: no empty-string values in any locale', (namespace) => {
    for (const locale of ['fr', 'ht', 'en'] as const) {
      const tree = readNamespace(locale, namespace);
      const empties = keyPaths(tree).filter((path) => {
        const value = path.split('.').reduce<unknown>((acc, key) => {
          return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined;
        }, tree);
        return value === '';
      });
      expect(empties, `${locale}.${namespace} has empty values: ${empties.join(', ')}`).toEqual([]);
    }
  });
});
