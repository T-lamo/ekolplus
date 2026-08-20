'use client';

// Loads GET /api/school/billing for the Abonnement screen and the checkout
// récap page, and exposes the three Stripe actions (checkout / portal
// redirect, in-app PATCH). One hook so both screens share the same error
// mapping (503 STRIPE_NOT_CONFIGURED → friendly copy, 403 → OWNER-only hint).
// Every successful load/patch is pushed into SchoolPlanContext so the sidebar
// plan card mirrors the page instantly (no second request).
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { toPlanSnapshot, type BillingIntervalKey, type BillingSummary } from '@/lib/billing-plans';

export interface BillingResponse {
  billing: BillingSummary;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

type ErrorsT = (
  key:
    | 'stripeNotConfigured'
    | 'ownerOnly'
    | 'alreadySubscribed'
    | 'noStripeSubscription'
    | 'stripeError'
    | 'generic'
    | 'network',
) => string;

type LoadErrorT = (key: 'loadErrorNoSchool' | 'loadErrorRestricted' | 'loadError') => string;

function billingErrorMessage(err: unknown, t: ErrorsT): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'STRIPE_NOT_CONFIGURED':
        return t('stripeNotConfigured');
      case 'ORG_ROLE_INSUFFICIENT':
        return t('ownerOnly');
      case 'ALREADY_SUBSCRIBED':
        return t('alreadySubscribed');
      case 'NO_STRIPE_CUSTOMER':
      case 'NO_STRIPE_SUBSCRIPTION':
        return t('noStripeSubscription');
      case 'STRIPE_ERROR':
        return t('stripeError');
      default:
        return err.message || t('generic');
    }
  }
  return t('network');
}

export function useBilling(enabled = true) {
  const t = useTranslations('Abonnement.errors') as unknown as ErrorsT;
  const tScreen = useTranslations('Abonnement.screen') as unknown as LoadErrorT;
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
          ? tScreen('loadErrorNoSchool')
          : code === 'ORG_ROLE_INSUFFICIENT'
            ? tScreen('loadErrorRestricted')
            : tScreen('loadError'),
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyPlan, tScreen]);

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
        return billingErrorMessage(err, t);
      }
    },
    [t],
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
        return billingErrorMessage(err, t);
      } finally {
        setBusy(null);
      }
    },
    [applyPlan, t],
  );

  return { data, loading, error, errorCode, busy, reload: load, redirectTo, patchSubscription };
}
