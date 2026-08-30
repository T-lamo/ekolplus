'use client';

// Compte › Abonnement (/abonnement) — Banani « Subscription Plans »
// (KM_nZ7xzMgAE), plan: .planning/banani/abonnement-stripe.md. Real data
// from GET /api/school/billing (OWNER/ADMIN — a MEMBER lands on a « réservé
// aux administrateurs » state, never a 500). Stripe actions (checkout /
// portal redirect, in-app downgrade · resume · interval switch) are OWNER-
// only — an ADMIN sees the same page read-only. Sections, top to bottom, as
// in the mockup: header (title + renewal chip + « Mettre à niveau ») ·
// current-plan banner · usage · plan cards (selectable radiogroup — every
// click explains the transition, see plan-transition.ts) · manage block ·
// payment method + billing history. « Or = plan payant » : every upgrade CTA
// is the gold Button variant, the paid state reads gold.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, ArrowUpCircle, Settings2, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { useToast } from '@/contexts/ToastContext';
import { useApi } from '@/lib/useApi';
import { isPlanKey, type BillingIntervalKey, type PlanKey } from '@/lib/billing-plans';
import { planLabel } from '@/lib/billing-plan-i18n';
import { LOCALE_BCP47 } from '@/lib/locales';
import type { SchoolResponse } from '@/app/(school)/settings/types';
import { useBilling } from '@/components/school/billing/useBilling';
import { CurrentPlanBanner } from '@/components/school/billing/CurrentPlanBanner';
import { UsageCard } from '@/components/school/billing/UsageCard';
import { PlanCards } from '@/components/school/billing/PlanCards';
import { DowngradeDialog } from '@/components/school/billing/DowngradeDialog';
import { PaymentMethodCard } from '@/components/school/billing/PaymentMethodCard';
import { BillingHistoryTable } from '@/components/school/billing/BillingHistoryTable';
import { daysUntil, fmtDateLong } from '@/components/school/billing/billing-format';
import {
  salesMailto,
  type PlanTransition,
  type PlanTransitionT,
} from '@/components/school/billing/plan-transition';

export function AbonnementScreen() {
  const t = useTranslations('Abonnement.screen');
  const tTransition = useTranslations('Abonnement.planTransition') as unknown as PlanTransitionT;
  const tPlan = useTranslations('BillingPlans.label');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data, loading, error, errorCode, busy, redirectTo, patchSubscription } = useBilling();
  const { data: schoolRes } = useApi<SchoolResponse>('/api/school');
  const [interval, setInterval_] = useState<BillingIntervalKey>('MONTH');
  const [confirm, setConfirm] = useState<null | 'resume' | 'interval'>(null);
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  // Selected plan card — controlled here so a `?plan=PRO` deep link (sidebar
  // « Découvrir » / « Réactiver ») pre-selects Pro and scrolls to the grid.
  const [selected, setSelected] = useState<PlanKey | null>(null);
  const deepLinkApplied = useRef(false);

  // Default the toggle to the school's live cycle once loaded.
  useEffect(() => {
    if (data?.billing.billingInterval) setInterval_(data.billing.billingInterval);
  }, [data?.billing.billingInterval]);

  // Default selection = current plan; a valid `?plan=` wins once, then scrolls.
  useEffect(() => {
    if (!data) return;
    const wanted = params.get('plan');
    if (!deepLinkApplied.current && wanted && isPlanKey(wanted)) {
      deepLinkApplied.current = true;
      setSelected(wanted);
      // Let the grid paint before scrolling.
      requestAnimationFrame(() => {
        document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }
    setSelected((s) => s ?? data.billing.plan);
  }, [data, params]);

  const openPortal = useCallback(async () => {
    const msg = await redirectTo('portal');
    if (msg) toast(msg, 'error');
  }, [redirectTo, toast]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-96 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    );
  }
  if (errorCode === 'ORG_ROLE_INSUFFICIENT') {
    return (
      <section
        role="status"
        data-testid="billing-restricted"
        className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldAlert size={22} />
        </span>
        <h1 className="text-base font-extrabold text-foreground">{t('restrictedTitle')}</h1>
        <p className="max-w-md text-caption text-muted-foreground">{t('restrictedBody')}</p>
      </section>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        {error ?? t('loadError')}
      </p>
    );
  }

  const { billing, role } = data;
  const canManage = role === 'OWNER';
  const schoolName = schoolRes?.school.name ?? null;
  // Live = a Stripe subscription the school can still manage in-app (cycle,
  // downgrade, resume). SUSPENDED (unpaid) is handled by its own banner CTA
  // (portal → fix the card), not by the manage block.
  const live =
    billing.managedByStripe && (billing.status === 'TRIAL' || billing.status === 'ACTIVE');
  const proSuspended = billing.subscribedPlan === 'PRO' && billing.status === 'SUSPENDED';
  const days = daysUntil(billing.renewsAt);
  const nearHardLimit =
    billing.studentHardLimit !== null &&
    billing.studentCount < billing.studentHardLimit &&
    billing.studentCount >= Math.floor(billing.studentHardLimit * 0.8);
  const atHardLimit =
    billing.studentHardLimit !== null && billing.studentCount >= billing.studentHardLimit;
  const overSoftLimit =
    billing.studentSoftLimit !== null && billing.studentCount >= billing.studentSoftLimit;

  function goCheckout() {
    router.push(`/abonnement/paiement?cycle=${interval}`);
  }
  const proLabel = planLabel('PRO', tPlan);
  async function resume() {
    const msg = await patchSubscription({ cancelAtPeriodEnd: false });
    setConfirm(null);
    if (msg) toast(msg, 'error');
    else toast(t('toastDowngradeCanceled', { plan: proLabel }), 'success');
  }
  async function confirmDowngrade() {
    const msg = await patchSubscription({ cancelAtPeriodEnd: true });
    setDowngradeOpen(false);
    if (msg) toast(msg, 'error');
    else
      toast(
        t('toastDowngradeScheduled', {
          plan: proLabel,
          date: fmtDateLong(billing.renewsAt, bcp47),
        }),
        'success',
      );
  }
  async function runConfirm() {
    if (!confirm) return;
    if (confirm === 'resume') return resume();
    const msg = await patchSubscription({ interval });
    setConfirm(null);
    if (msg) toast(msg, 'error');
    else toast(t('toastIntervalUpdated'), 'success');
  }

  /** A plan card's CTA was pressed — dispatch by transition kind. */
  function onPlanAction(transition: PlanTransition, plan: PlanKey) {
    switch (transition.kind) {
      case 'upgrade':
      case 'reactivate':
        goCheckout();
        return;
      case 'regularize':
        void openPortal();
        return;
      case 'resume':
      case 'downgrade-scheduled':
        void resume();
        return;
      case 'downgrade':
        setDowngradeOpen(true);
        return;
      case 'contact':
        window.location.href = salesMailto(
          {
            billing,
            schoolName,
            topic: plan === 'ENTERPRISE' ? 'enterprise' : 'support',
          },
          tTransition,
          tPlan,
        );
        return;
      default:
        return;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
            <HelpTooltip label={t('help.pageOverview')} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {live && days !== null && days >= 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-[7px] text-xs font-semibold whitespace-nowrap text-warning-foreground">
              <Zap size={13} />
              {billing.cancelAtPeriodEnd
                ? t(days > 1 ? 'daysEndsAccess.other' : 'daysEndsAccess.one', { days })
                : billing.status === 'TRIAL'
                  ? t(days > 1 ? 'daysEndsTrial.other' : 'daysEndsTrial.one', { days })
                  : t(days > 1 ? 'daysRenewsIn.other' : 'daysRenewsIn.one', { days })}
            </span>
          )}
          {canManage && billing.plan === 'STARTER' && billing.stripeConfigured && !proSuspended && (
            <Button type="button" variant="gold" size="sm" className="w-fit" onClick={goCheckout}>
              <ArrowUpCircle size={14} />
              {t('upgradeCta')}
            </Button>
          )}
        </div>
      </div>

      {/* Alerts (informative, never blocking) */}
      {proSuspended && (
        <Alert tone="destructive">
          {billing.managedByStripe
            ? t.rich('alertProSuspendedStripe', {
                plan: proLabel,
                b: (chunks) => <strong>{chunks}</strong>,
              })
            : t.rich('alertProSuspendedManual', {
                plan: proLabel,
                b: (chunks) => <strong>{chunks}</strong>,
              })}
        </Alert>
      )}
      {billing.stripeStatus === 'past_due' && (
        <Alert tone="warning">{t('alertPastDue', { plan: planLabel(billing.plan, tPlan) })}</Alert>
      )}
      {billing.status === 'TRIAL' && billing.managedByStripe && !billing.cancelAtPeriodEnd && (
        <Alert tone="gold">
          {t.rich('alertTrial', {
            date: fmtDateLong(billing.trialEndsAt ?? billing.renewsAt, bcp47),
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </Alert>
      )}
      {billing.cancelAtPeriodEnd && (
        <Alert
          tone="warning"
          action={
            canManage ? (
              <Button
                type="button"
                size="sm"
                variant="gold"
                className="w-fit"
                onClick={resume}
                loading={busy === 'patch'}
                data-testid="cancel-downgrade"
              >
                {t('cancelDowngrade')}
              </Button>
            ) : undefined
          }
        >
          {t.rich('alertDowngradeScheduled', {
            date: fmtDateLong(billing.renewsAt, bcp47),
            plan: proLabel,
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </Alert>
      )}
      {atHardLimit && (
        <Alert tone="destructive">
          {t.rich('alertAtHardLimit', {
            limit: billing.studentHardLimit ?? 0,
            plan: proLabel,
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </Alert>
      )}
      {nearHardLimit && (
        <Alert tone="warning">
          {t('alertNearHardLimit', {
            count: billing.studentCount,
            limit: billing.studentHardLimit ?? 0,
            plan: proLabel,
          })}
        </Alert>
      )}
      {overSoftLimit && (
        <Alert tone="primary">
          {t.rich('alertOverSoftLimit', {
            limit: billing.studentSoftLimit ?? 0,
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </Alert>
      )}
      {!billing.stripeConfigured && billing.plan === 'STARTER' && (
        <Alert tone="muted">{t('alertStripeNotConfigured', { plan: proLabel })}</Alert>
      )}

      <CurrentPlanBanner
        billing={billing}
        action={
          canManage && proSuspended && billing.managedByStripe ? (
            <Button
              type="button"
              variant="gold"
              size="sm"
              className="h-8 w-fit px-3 text-2xs"
              onClick={openPortal}
              loading={busy === 'portal'}
              data-testid="banner-regularize"
            >
              <Settings2 size={11} />
              {t('bannerUpdateCard')}
            </Button>
          ) : canManage && live ? (
            <button
              type="button"
              onClick={openPortal}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-2xs font-semibold text-primary hover:bg-secondary/80 disabled:opacity-60"
            >
              <Settings2 size={11} />
              {t('bannerManagePlan')}
            </button>
          ) : canManage && billing.plan === 'STARTER' && billing.stripeConfigured ? (
            <Button
              type="button"
              variant="gold"
              size="sm"
              className="h-8 w-fit px-3 text-2xs"
              onClick={goCheckout}
            >
              <Sparkles size={11} />
              {t('bannerUpgradeToPro')}
            </Button>
          ) : undefined
        }
      />

      <UsageCard billing={billing} />

      <PlanCards
        billing={billing}
        interval={interval}
        onIntervalChange={setInterval_}
        canManage={canManage}
        selected={selected ?? billing.plan}
        onSelect={setSelected}
        onAction={onPlanAction}
        schoolName={schoolName}
        busy={busy}
      />

      {/* In-app subscription management (live Stripe subscription, OWNER) */}
      {canManage && live && (
        <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-1.5">
            <div className="text-caption font-bold text-foreground">{t('manageTitle')}</div>
            <HelpTooltip label={t('help.manageProration')} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('manageBody')}</p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={openPortal}
              disabled={busy !== null}
            >
              {t('managePaymentAndInvoices')}
            </Button>
            {billing.rates.annualAvailable &&
              !billing.cancelAtPeriodEnd &&
              confirm !== 'interval' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    setInterval_(billing.billingInterval === 'YEAR' ? 'MONTH' : 'YEAR');
                    setConfirm('interval');
                  }}
                  disabled={busy !== null}
                >
                  {billing.billingInterval === 'YEAR'
                    ? t('manageSwitchMonthly')
                    : t('manageSwitchAnnual')}
                </Button>
              )}
            {billing.cancelAtPeriodEnd ? (
              <Button
                type="button"
                size="sm"
                variant="gold"
                className="w-fit"
                onClick={() => setConfirm('resume')}
                disabled={busy !== null}
              >
                {t('manageResume', { plan: proLabel })}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit border-destructive-foreground/30 text-destructive-foreground hover:bg-destructive"
                onClick={() => setDowngradeOpen(true)}
                disabled={busy !== null}
                data-testid="manage-downgrade"
              >
                {t('manageDowngrade')}
              </Button>
            )}
          </div>

          {confirm && (
            <div className="mt-3.5 rounded-md border border-primary/20 bg-secondary p-3.5 text-caption text-primary">
              {confirm === 'resume' && <p>{t('confirmResume', { plan: proLabel })}</p>}
              {confirm === 'interval' && (
                <p>
                  {t.rich('confirmInterval', {
                    cycle:
                      interval === 'YEAR'
                        ? t('confirmIntervalAnnual')
                        : t('confirmIntervalMonthly'),
                    b: (chunks) => <strong>{chunks}</strong>,
                  })}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="w-fit"
                  onClick={runConfirm}
                  loading={busy === 'patch'}
                >
                  {t('confirmBtn')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setConfirm(null)}
                  disabled={busy !== null}
                >
                  {t('back')}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Bottom row — 1fr / 2fr on lg, stacked below */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <PaymentMethodCard
          billing={billing}
          canManage={canManage}
          onOpenPortal={openPortal}
          busy={busy === 'portal'}
        />
        <BillingHistoryTable billing={billing} />
      </div>

      {downgradeOpen && (
        <DowngradeDialog
          billing={billing}
          busy={busy === 'patch'}
          onConfirm={confirmDowngrade}
          onClose={() => setDowngradeOpen(false)}
        />
      )}
    </div>
  );
}

function Alert({
  tone,
  action,
  children,
}: {
  tone: 'warning' | 'primary' | 'gold' | 'destructive' | 'muted';
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls = {
    warning: 'border-warning-foreground/30 bg-warning text-warning-foreground',
    primary: 'border-primary/20 bg-secondary text-primary',
    // Paid-plan good news (trial running) — « or = plan payant ».
    gold: 'border-gold-300 bg-gold-100 text-gold-700',
    destructive: 'border-destructive-foreground/30 bg-destructive text-destructive-foreground',
    muted: 'border-border bg-muted text-muted-foreground',
  }[tone];
  const Icon = tone === 'primary' || tone === 'gold' ? Sparkles : AlertTriangle;
  return (
    <div
      className={`flex flex-col gap-3 rounded-md border p-3.5 text-caption sm:flex-row sm:items-center ${cls}`}
    >
      <div className="flex flex-1 items-start gap-2.5">
        <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>{children}</p>
      </div>
      {action && <div className="shrink-0 sm:pl-3">{action}</div>}
    </div>
  );
}
