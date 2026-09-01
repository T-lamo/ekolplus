'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, clearCsrfToken, storeCsrfToken } from '@/lib/api';
import { invalidateCachePrefix } from '@/lib/useApi';
import { COOKIE_PREFIX } from '@/lib/constants';

export interface User {
  id: string;
  email: string;
  /** App-wide role — USER for everyone except Schoolgesti platform staff. */
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  name: string | null;
  avatarUrl: string | null;
  phone: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** false when the account was created via OAuth and never set a password. */
  hasPassword: boolean;
  /** Set on every successful change-password/set-password; null if never changed. */
  passwordChangedAt: string | null;
  /** Provider names already linked, e.g. ['google']. Empty for pure email/password accounts. */
  linkedProviders: string[];
  /** Colour theme key (src/lib/themes.ts) chosen in Paramètres › Apparence;
   * null = never chosen (default theme). Applied by ThemeProvider. */
  theme: string | null;
  /** UI language key (src/lib/locales.ts) chosen in Paramètres › Langue;
   * null = never chosen (default: French). Applied by LocaleProvider. */
  locale: string | null;
  /** true for a purely teacher-linked account (MEMBER role + a linked
   * TeacherProfile) — mirrors GET /api/auth/me's deny-by-default check in
   * lib/server/school.ts. false for an admin who happens to also be
   * teacher-linked, so their normal school-admin experience is untouched.
   * Drives the login-time redirect (login/page.tsx) and the
   * belt-and-suspenders guard in (school)/layout.tsx. */
  isTeacherOnly?: boolean;
  /** true for a purely student-linked account (MEMBER role + a linked
   * StudentProfile) — same deny-by-default shape as isTeacherOnly, mirrors
   * GET /api/auth/me's isStudentOnly field. false for an admin who happens
   * to also be student-linked (not a real-world case, but kept symmetric
   * with isTeacherOnly). Drives the login-time redirect (login/page.tsx)
   * and the belt-and-suspenders guard in (school)/layout.tsx. */
  isStudentOnly?: boolean;
  /** Espaces accessibles par ce compte (multi-casquettes) : miroir du champ
   * `spaces` de GET /api/auth/me, calculé côté serveur par resolveMySpaces()
   * (lib/server/school.ts). Drive le routage du login, la page /espaces et
   * le sélecteur « Mes espaces » des trois shells. */
  spaces?: { school: boolean; teacher: boolean; student: boolean };
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loggingOut: boolean;
  error: string | null;
  /** Re-fetches /api/auth/me and returns the fresh user (null when logged
   * out) so callers like the login page can branch on role without a second
   * request racing the context update. */
  refresh: () => Promise<User | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async (): Promise<User | null> => {
    setError(null);
    try {
      const res = await api<{ user: User; csrfToken?: string }>('/api/auth/me');
      setUser(res.user);
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      return res.user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many requests. Wait a few minutes and try again.');
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Cannot reach the server. Check your network and try again.';
        setError(msg);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip /me for anonymous visitors — the JS-readable CSRF cookie is only
    // set after login, so its absence is a reliable "no session" signal.
    const csrfCookieName = `${COOKIE_PREFIX}-csrf`;
    const hasCookie = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith(`${csrfCookieName}=`));
    if (!hasCookie) {
      setLoading(false);
      return;
    }
    void fetchUser();
    // Run once on mount; fetchUser is stable.
  }, []);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore — cookie will expire anyway
    }
    clearCsrfToken();
    invalidateCachePrefix('/api/');
    setUser(null);
    setLoggingOut(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loggingOut, error, refresh: fetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

const SSR_STUB: AuthContextValue = {
  user: null,
  loading: true,
  loggingOut: false,
  error: null,
  refresh: async () => null,
  logout: async () => {},
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (typeof window === 'undefined') return SSR_STUB;
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}

/**
 * Auth-required helper — returns the user, or redirects to the configured
 * login path if logged out. Use on pages that require an authenticated
 * session so each page doesn't reimplement the same `if (!user) router.push`.
 *
 *   export default function DashboardPage() {
 *     const user = useUser();         // never null inside the body
 *     if (!user) return null;         // null while redirecting / loading
 *     return <div>Hello {user.email}</div>;
 *   }
 *
 * Default redirect target is `/login`; override via the `redirectTo` arg.
 * Returns `null` while loading OR while the redirect is in flight, so the
 * UI can render a stub. Use the `loading` field of useAuth() if you want
 * to render a spinner explicitly.
 */
export function useUser(redirectTo: string = '/login'): User | null {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(redirectTo);
    }
  }, [loading, user, redirectTo, router]);

  if (loading || !user) return null;
  return user;
}

/**
 * Auth-required + role-gated helper for the `/admin/*` back-office (Schoolgesti
 * platform staff). Redirects to `/login` when logged out, and to `/` when
 * logged in but role is plain USER — mirrors `useUser()`.
 */
export function useAdminUser(redirectTo: string = '/login'): User | null {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(redirectTo);
    } else if (!isAdmin) {
      router.replace('/');
    }
  }, [loading, user, isAdmin, redirectTo, router]);

  if (loading || !user || !isAdmin) return null;
  return user;
}
