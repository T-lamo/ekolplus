'use client';

// UI language (Paramètres › Langue) — per-user preference.
//
// Unlike the colour theme, there's no flash-of-wrong-language to prevent:
// the server already resolves the locale from the `sg-locale` cookie on
// the very first response (src/i18n/request.ts), so whatever language the
// initial HTML renders in is already correct — no pre-paint script needed
// the way THEME_INIT_SCRIPT is for colours.
//
// This provider's job is narrower: track the current value for the
// LanguagePicker, write the cookie + persist `User.locale` when it
// changes, and force a `router.refresh()` so already-rendered Server
// Components (which read next-intl's server-side request config, not
// this client context) re-render in the new language — a plain client
// state update alone would never reach them.
//
// Registry (keys, native names): src/lib/locales.ts.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  resolveLocaleKey,
  type LocaleKey,
} from '@/lib/locales';

interface LocaleContextValue {
  locale: LocaleKey;
  /** Applies immediately (cookie + refresh); persists to the account when
   * signed in. Resolves once the server write is done (rejects on
   * failure — the UI already shows the new language, callers decide
   * whether to revert). */
  setLocale: (next: LocaleKey) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function storeCookieLocale(locale: LocaleKey): void {
  // Plain (non-httpOnly) cookie, 1 year, root-scoped — read server-side by
  // src/i18n/request.ts on every request via `cookies()`.
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  /** The locale the server actually rendered this page in (from
   * next-intl's `getLocale()` in the root layout), passed down so the
   * client provider's first render always agrees with the DOM — never
   * guessed independently on the client. */
  initialLocale: LocaleKey;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [locale, setLocaleState] = useState<LocaleKey>(initialLocale);
  const syncedForUser = useRef<string | null>(null);

  // Server truth (User.locale) wins once per signed-in user — new device,
  // cleared cookie, or a change made from another device — including
  // `null` → French, so a shared computer never keeps a previous user's
  // language after switching accounts.
  useEffect(() => {
    if (!user) {
      syncedForUser.current = null;
      return;
    }
    if (syncedForUser.current === user.id) return;
    syncedForUser.current = user.id;
    const serverLocale = resolveLocaleKey(user.locale);
    if (serverLocale !== locale) {
      storeCookieLocale(serverLocale);
      setLocaleState(serverLocale);
      router.refresh();
    }
    // `locale` intentionally excluded: this effect only reacts to `user`
    // changing (login/logout/account switch), not to `locale` itself —
    // including it would re-run this sync loop on every language change
    // made via `setLocale` below, fighting the user's own click.
  }, [user, router]);

  const setLocale = useCallback(
    async (next: LocaleKey) => {
      storeCookieLocale(next);
      setLocaleState(next);
      router.refresh();
      if (!user) return;
      await api('/api/auth/me', { method: 'PATCH', body: { locale: next } });
    },
    [router, user],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

const SSR_STUB: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: async () => {},
};

export function useLocalePreference(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    if (typeof window === 'undefined') return SSR_STUB;
    throw new Error('useLocalePreference must be used inside a LocaleProvider');
  }
  return ctx;
}
