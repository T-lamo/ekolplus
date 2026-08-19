'use client';

// Colour theme (Paramètres › Apparence) — per-user preference.
//
// Three layers keep it flash-free and cross-device:
//   1. app/layout.tsx runs THEME_INIT_SCRIPT in <head> → the localStorage
//      theme is on <html> before the first paint (no flash on reload).
//   2. This provider owns the runtime value: `setTheme` stamps <html>,
//      mirrors localStorage and (when signed in) persists `User.theme`
//      via PATCH /api/auth/me so the choice follows the user everywhere.
//   3. When the signed-in user loads, the server value wins over a stale
//      local one (new device / cleared storage) — once per session.
//
// Registry (keys, labels, swatches): src/lib/themes.ts. Token values: the
// `[data-theme]` blocks in app/globals.css.
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
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_THEME,
  THEME_ATTR,
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  resolveThemeKey,
  type ThemeKey,
} from '@/lib/themes';

interface ThemeContextValue {
  theme: ThemeKey;
  /** Applies immediately; persists to the account when signed in.
   * Resolves once the server write is done (rejects on failure — the UI
   * already shows the new theme, callers decide whether to revert). */
  setTheme: (next: ThemeKey) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeKey {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  // The pre-paint script already stamped <html>; trust it over localStorage
  // so the provider's first render agrees with what is on screen.
  const fromDom = document.documentElement.getAttribute(THEME_ATTR);
  if (fromDom) return resolveThemeKey(fromDom);
  try {
    return resolveThemeKey(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function storeLocal(theme: ThemeKey): void {
  try {
    if (theme === DEFAULT_THEME) localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode quota, disabled) — the DOM attribute
    // still applies for this page view and the account keeps the value.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Lazy initialiser: runs on the client's first render only. During SSR
  // this is DEFAULT_THEME; <html suppressHydrationWarning> in the root
  // layout tolerates the attribute the pre-paint script added.
  const [theme, setThemeState] = useState<ThemeKey>(readInitialTheme);
  const syncedForUser = useRef<string | null>(null);

  // Keep <html> + localStorage aligned with the runtime value.
  useEffect(() => {
    applyThemeToDocument(document, theme);
    storeLocal(theme);
  }, [theme]);

  // Server truth wins once per signed-in user (new device, cleared storage,
  // a change made from another device) — including `null` → default, so a
  // shared computer never shows the previous user's palette.
  useEffect(() => {
    if (!user) {
      syncedForUser.current = null;
      return;
    }
    if (syncedForUser.current === user.id) return;
    syncedForUser.current = user.id;
    setThemeState(resolveThemeKey(user.theme));
  }, [user]);

  const setTheme = useCallback(
    async (next: ThemeKey) => {
      setThemeState(next);
      if (!user) return;
      await api('/api/auth/me', { method: 'PATCH', body: { theme: next } });
    },
    [user],
  );

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const SSR_STUB: ThemeContextValue = {
  theme: DEFAULT_THEME,
  setTheme: async () => {},
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    if (typeof window === 'undefined') return SSR_STUB;
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return ctx;
}
