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

/** Every message namespace that ships today — the single source of truth
 * this app's message files are checked against. `src/i18n/request.ts`'s
 * import list and `src/types/next-intl.d.ts`'s `Messages` interface both
 * stay hand-written (Next.js's bundler and TypeScript's structural typing
 * both need real, static declarations there — this array can't replace
 * either), but `locales.test.ts` scans `src/messages/fr/` on disk and
 * fails `pnpm test` if this array or any locale's file set ever drifts
 * from it — a forgotten namespace, or one that exists in French but not
 * Creole/English, fails loudly here instead of throwing at request time
 * for non-French users. Add your namespace's key here in the same task
 * that creates its `fr`/`ht`/`en` JSON files. */
export const MESSAGE_NAMESPACES = [
  'common',
  'login',
  'shell',
  'schoolSidebar',
  'adminSidebar',
  'schoolTopbar',
  'adminTopbar',
  'forgotPassword',
  'resetPassword',
  'verifyEmail',
  'dashboard',
  'adminDashboard',
  'schoolPlanCard',
  'settings',
  'themePicker',
  'presences',
  'enseignants',
  'eleves',
  'configuration',
  'gradebook',
] as const;
export type MessageNamespace = (typeof MESSAGE_NAMESPACES)[number];

/** BCP-47 tag for native `Intl`/`toLocaleDateString` calls. Haitian Creole
 * has no distinct number/date-formatting convention in wide practical use in
 * Haiti — it maps to French (the shared administrative register) rather
 * than a bare `'ht'` tag the JS engine would otherwise silently fall back
 * on. Add call sites here, not ad hoc `'fr-FR'` literals, whenever a new
 * screen formats a date or number. */
export const LOCALE_BCP47: Record<LocaleKey, string> = {
  fr: 'fr-FR',
  ht: 'fr-FR',
  en: 'en-US',
};

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
