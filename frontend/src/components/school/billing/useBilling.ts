'use client';

// Loads GET /api/school/billing for the Abonnement screen and the checkout
// récap page, and exposes the three Stripe actions (checkout / portal
// redirect, in-app PATCH). One hook so both screens share the same error
// mapping (503 STRIPE_NOT_CONFIGURED → friendly copy, 403 → OWNER-only hint).
// Every successful load/patch is pushed into SchoolPlanContext so the sidebar
// plan card mirrors the page instantly (no second request).
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { toPlanSnapshot, type BillingIntervalKey, type BillingSummary } from '@/lib/billing-plans';

export interface BillingResponse {
  billing: BillingSummary;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export function billingErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'STRIPE_NOT_CONFIGURED':
        return 'La facturation en ligne n’est pas encore activée sur cette plateforme.';
      case 'ORG_ROLE_INSUFFICIENT':
        return 'Seul le propriétaire de l’établissement peut modifier l’abonnement.';
      case 'ALREADY_SUBSCRIBED':
        return 'Cette école a déjà un abonnement actif.';
      case 'NO_STRIPE_CUSTOMER':
      case 'NO_STRIPE_SUBSCRIPTION':
        return 'Aucun abonnement Stripe à gérer pour cette école.';
      case 'STRIPE_ERROR':
        return 'Stripe n’a pas pu traiter la demande. Réessaie dans un instant.';
      default:
        return err.message || 'Action impossible pour le moment.';
    }
  }
  return 'Erreur réseau. Réessaie.';
}

export function useBilling(enabled = true) {
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Stable server code of the load failure (ORG_ROLE_INSUFFICIENT for a MEMBER, NO_SCHOOL…). */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'checkout' | 'portal' | 'patch'>(null);
  const { apply: applyPlan } = useSchoolPlan();

  const load = useCallback(async () => {
    try {
      const res = await api<BillingResponse>('/api/school/billing');
      setData(res);
      setError(null);
      setErrorCode(null);
      applyPlan({ plan: toPlanSnapshot(res.billing), role: res.role });
      return res;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setErrorCode(code ?? null);
      setError(
        code === 'NO_SCHOOL'
          ? 'Aucun établissement rattaché à ce compte.'
          : code === 'ORG_ROLE_INSUFFICIENT'
            ? 'La facturation est réservée aux administrateurs de l’établissement.'
            : 'Impossible de charger l’abonnement.',
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyPlan]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  /** POST → { url } → full-page redirect to Stripe. Returns an error message or null. */
  const redirectTo = useCallback(
    async (kind: 'checkout' | 'portal', body?: { interval: BillingIntervalKey }) => {
      setBusy(kind);
      try {
        const res = await api<{ url: string }>(`/api/school/billing/${kind}`, {
          method: 'POST',
          body: body ?? {},
        });
        window.location.assign(res.url);
        return null;
      } catch (err) {
        setBusy(null);
        return billingErrorMessage(err);
      }
    },
    [],
  );

  /** PATCH /subscription — cancel/resume or interval switch, then refresh. */
  const patchSubscription = useCallback(
    async (body: { cancelAtPeriodEnd?: boolean; interval?: BillingIntervalKey }) => {
      setBusy('patch');
      try {
        const res = await api<BillingResponse>('/api/school/billing/subscription', {
          method: 'PATCH',
          body,
        });
        setData(res);
        applyPlan({ plan: toPlanSnapshot(res.billing), role: res.role });
        return null;
      } catch (err) {
        return billingErrorMessage(err);
      } finally {
        setBusy(null);
      }
    },
    [applyPlan],
  );

  return { data, loading, error, errorCode, busy, reload: load, redirectTo, patchSubscription };
}
