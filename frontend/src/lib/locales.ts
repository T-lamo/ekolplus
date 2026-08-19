// UI language registry — shared by the server locale resolver
// (src/i18n/request.ts), the LocaleProvider client context, and the
// LanguagePicker. Mirrors src/lib/themes.ts's shape for the equivalent
// per-user colour preference; the one real difference is that a locale
// must be knowable by the SERVER on every request (to pick the right
// message file for SSR), so this preference travels via a cookie —
// themes stay purely client-side (CSS custom properties).
//
// Client-safe: no server imports.

export const LOCALE_KEYS = ['fr', 'ht', 'en'] as const;
export type LocaleKey = (typeof LOCALE_KEYS)[number];

export const DEFAULT_LOCALE: LocaleKey = 'fr';

/** Cookie read by src/i18n/request.ts on every request and written by
 * LocaleContext on the client — app-owned name, not next-intl's default
 * `NEXT_LOCALE`, to match the sg-theme naming convention. */
export const LOCALE_COOKIE_NAME = 'sg-locale';

export interface LocaleDef {
  key: LocaleKey;
  /** Always the language's own name for itself — never translated, so a
   * user can find their language regardless of which one is active. */
  nativeName: string;
}

export const LOCALES: readonly LocaleDef[] = [
  { key: 'fr', nativeName: 'Français' },
  { key: 'ht', nativeName: 'Kreyòl Ayisyen' },
  { key: 'en', nativeName: 'English' },
];

export function isLocaleKey(value: unknown): value is LocaleKey {
  return typeof value === 'string' && (LOCALE_KEYS as readonly string[]).includes(value);
}

/** Normalises any stored/received value to a known locale (French otherwise). */
export function resolveLocaleKey(value: unknown): LocaleKey {
  return isLocaleKey(value) ? value : DEFAULT_LOCALE;
}

/**
 * Picks the first of the visitor's preferred languages (RFC 4647 loosely —
 * order-of-appearance, no q-value math needed across just 3 locales) that
 * we support, matching on the primary subtag so `fr-CA`/`fr-FR` both hit
 * `fr`. Used only for anonymous visitors with no `sg-locale` cookie yet.
 */
export function matchAcceptLanguage(header: string | null | undefined): LocaleKey {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(',')
    .map((part) => part.split(';')[0]?.trim().toLowerCase())
    .filter((tag): tag is string => Boolean(tag));
  for (const tag of tags) {
    const primary = tag.split('-')[0];
    const match = LOCALE_KEYS.find((key) => key === primary);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
