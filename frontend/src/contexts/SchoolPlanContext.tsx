'use client';

// School plan snapshot shared by the whole school shell — the sidebar plan
// card (desktop + mobile drawer instances), the Abonnement page and the
// checkout confirmation all read the SAME state, so a plan change (checkout,
// cancel/resume, portal return) is reflected in the sidebar in the same
// second as on the page, without a full reload:
//   · `refresh()` re-fetches GET /api/school/billing/plan (2 DB reads);
//   · `apply()` pushes a snapshot the caller already has (useBilling derives
//     it from the full summary it just loaded/patched) — zero extra request;
//   · a client-side navigation revalidates in the background when the last
//     fetch is older than REVALIDATE_MS (the App Router keeps this layout
//     mounted, so a webhook-driven change — cancel from the Stripe Dashboard,
//     trial ending — still shows up within a click, not only after a reload).
// The last snapshot is kept in lib/useApi's module cache so a re-mount of the
// shell paints instantly. A user without a school (404 NO_SCHOOL) or a failed
// request yields `snapshot: null` — consumers render nothing rather than crash.
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
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { getCache, setCache } from '@/lib/useApi';
import type { PlanSnapshot } from '@/lib/billing-plans';

export const PLAN_SNAPSHOT_PATH = '/api/school/billing/plan';

export type SchoolRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface PlanResponse {
  /** null for a plain MEMBER — plan visibility is an OWNER/ADMIN matter. */
  plan: PlanSnapshot | null;
  role: SchoolRole;
}

export interface SchoolPlanState {
  snapshot: PlanSnapshot | null;
  role: SchoolRole | null;
  /** True only until the first result — later refreshes keep the previous snapshot visible. */
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  apply: (res: PlanResponse) => void;
}

const NOOP_STATE: SchoolPlanState = {
  snapshot: null,
  role: null,
  loading: false,
  error: null,
  refresh: async () => {},
  apply: () => {},
};

const SchoolPlanContext = createContext<SchoolPlanState>(NOOP_STATE);

const REVALIDATE_MS = 60_000;

interface Internal {
  data: PlanResponse | null;
  loading: boolean;
  error: string | null;
}

export function SchoolPlanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Internal>(() => {
    const cached = getCache<PlanResponse>(PLAN_SNAPSHOT_PATH);
    return { data: cached, loading: !cached, error: null };
  });

  const lastFetchedAt = useRef(0);
  const pathname = usePathname();

  const fetchSnapshot = useCallback(async () => {
    // Stamped before the await so overlapping triggers (StrictMode double
    // effect, quick navigations) collapse into one request.
    lastFetchedAt.current = Date.now();
    try {
      const res = await api<PlanResponse>(PLAN_SNAPSHOT_PATH);
      setCache(PLAN_SNAPSHOT_PATH, res);
      setState({ data: res, loading: false, error: null });
    } catch (err) {
      // 404 NO_SCHOOL, network… — keep whatever we had, never throw into the shell.
      setState((s) => ({
        data: s.data,
        loading: false,
        error: err instanceof Error ? err.message : 'Network error',
      }));
    }
  }, []);

  // Always revalidate on shell mount (cheap) — the cache only avoids the flash —
  // then at most once a minute, on client-side navigation.
  useEffect(() => {
    if (Date.now() - lastFetchedAt.current < REVALIDATE_MS) return;
    void fetchSnapshot();
  }, [fetchSnapshot, pathname]);

  const apply = useCallback((res: PlanResponse) => {
    lastFetchedAt.current = Date.now();
    setCache(PLAN_SNAPSHOT_PATH, res);
    setState({ data: res, loading: false, error: null });
  }, []);

  const value = useMemo<SchoolPlanState>(
    () => ({
      snapshot: state.data?.plan ?? null,
      role: state.data?.role ?? null,
      loading: state.loading,
      error: state.error,
      refresh: fetchSnapshot,
      apply,
    }),
    [state, fetchSnapshot, apply],
  );
  return <SchoolPlanContext.Provider value={value}>{children}</SchoolPlanContext.Provider>;
}

/** Plan state of the current school; a no-op state outside the provider. */
export function useSchoolPlan(): SchoolPlanState {
  return useContext(SchoolPlanContext);
}
