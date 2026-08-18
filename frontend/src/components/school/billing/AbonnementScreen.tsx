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
import { AlertTriangle, ArrowUpCircle, Settings2, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { useApi } from '@/lib/useApi';
import { PLAN_LABELS, isPlanKey, type BillingIntervalKey, type PlanKey } from '@/lib/billing-plans';
import type { SchoolResponse } from '@/app/(school)/settings/types';
import { useBilling } from '@/components/school/billing/useBilling';
import { CurrentPlanBanner } from '@/components/school/billing/CurrentPlanBanner';
import { UsageCard } from '@/components/school/billing/UsageCard';
import { PlanCards } from '@/components/school/billing/PlanCards';
import { DowngradeDialog } from '@/components/school/billing/DowngradeDialog';
import { PaymentMethodCard } from '@/components/school/billing/PaymentMethodCard';
import { BillingHistoryTable } from '@/components/school/billing/BillingHistoryTable';
import { daysUntil, fmtDateLong } from '@/components/school/billing/billing-format';
import { salesMailto, type PlanTransition } from '@/components/school/billing/plan-transition';

export function AbonnementScreen() {
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
        <h1 className="text-base font-extrabold text-foreground">
          Réservé aux administrateurs de l’établissement
        </h1>
        <p className="max-w-md text-caption text-muted-foreground">
          L’abonnement, les montants facturés et les reçus ne sont visibles que par le propriétaire
          et les administrateurs de l’école. Adressez-vous à eux pour toute question sur le plan.
        </p>
      </section>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        {error ?? 'Impossible de charger l’abonnement.'}
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
  async function resume() {
    const msg = await patchSubscription({ cancelAtPeriodEnd: false });
    setConfirm(null);
    if (msg) toast(msg, 'error');
    else
      toast(`Rétrogradation annulée — ${PLAN_LABELS.PRO} continue sans interruption.`, 'success');
  }
  async function confirmDowngrade() {
    const msg = await patchSubscription({ cancelAtPeriodEnd: true });
    setDowngradeOpen(false);
    if (msg) toast(msg, 'error');
    else
      toast(
        `Rétrogradation programmée — ${PLAN_LABELS.PRO} reste actif jusqu’au ${fmtDateLong(billing.renewsAt)}.`,
        'success',
      );
  }
  async function runConfirm() {
    if (!confirm) return;
    if (confirm === 'resume') return resume();
    const msg = await patchSubscription({ interval });
    setConfirm(null);
    if (msg) toast(msg, 'error');
    else toast('Cycle de facturation mis à jour.', 'success');
  }

  /** A plan card's CTA was pressed — dispatch by transition kind. */
  function onPlanAction(t: PlanTransition, plan: PlanKey) {
    switch (t.kind) {
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
        window.location.href = salesMailto({
          billing,
          schoolName,
          topic: plan === 'ENTERPRISE' ? 'enterprise' : 'support',
        });
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
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">
            Abonnement & Facturation
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Gérez votre plan, suivez votre consommation et consultez vos factures.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {live && days !== null && days >= 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-[7px] text-xs font-semibold whitespace-nowrap text-warning-foreground">
              <Zap size={13} />
              {billing.cancelAtPeriodEnd
                ? `Fin d’accès dans ${days} jour${days > 1 ? 's' : ''}`
                : billing.status === 'TRIAL'
                  ? `Fin d’essai dans ${days} jour${days > 1 ? 's' : ''}`
                  : `Renouvellement dans ${days} jour${days > 1 ? 's' : ''}`}
            </span>
          )}
          {canManage && billing.plan === 'STARTER' && billing.stripeConfigured && !proSuspended && (
            <Button type="button" variant="gold" size="sm" className="w-fit" onClick={goCheckout}>
              <ArrowUpCircle size={14} />
              Mettre à niveau
            </Button>
          )}
        </div>
      </div>

      {/* Alerts (informative, never blocking) */}
      {proSuspended && (
        <Alert tone="destructive">
          {billing.managedByStripe ? (
            <>
              Abonnement {PLAN_LABELS.PRO} <strong>suspendu pour impayé</strong> — votre école est
              repassée aux règles du plan gratuit (50 élèves). Mettez votre carte à jour pour
              rétablir {PLAN_LABELS.PRO} immédiatement ; vos données n’ont pas bougé.
            </>
          ) : (
            <>
              Abonnement {PLAN_LABELS.PRO} <strong>suspendu</strong> par l’équipe Schoolgesti —
              votre école applique les règles du plan gratuit. Contactez-nous pour le rétablir.
            </>
          )}
        </Alert>
      )}
      {billing.stripeStatus === 'past_due' && (
        <Alert tone="warning">
          Votre dernier paiement a échoué. Mettez à jour votre moyen de paiement pour conserver le
          plan {PLAN_LABELS[billing.plan]} — l’accès reste ouvert entre-temps.
        </Alert>
      )}
      {billing.status === 'TRIAL' && billing.managedByStripe && !billing.cancelAtPeriodEnd && (
        <Alert tone="gold">
          Essai gratuit en cours — première facturation le{' '}
          <strong>{fmtDateLong(billing.trialEndsAt ?? billing.renewsAt)}</strong>.
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
                Annuler la rétrogradation
              </Button>
            ) : undefined
          }
        >
          <strong>Rétrogradation vers Starter programmée le {fmtDateLong(billing.renewsAt)}</strong>{' '}
          — {PLAN_LABELS.PRO} reste actif jusque-là, puis votre école repassera automatiquement au
          plan gratuit (50 élèves). Aucune nouvelle facture ne sera émise.
        </Alert>
      )}
      {atHardLimit && (
        <Alert tone="destructive">
          Vous avez atteint la limite de <strong>{billing.studentHardLimit} élèves</strong> du plan
          gratuit. Passez au plan Établissement Pro pour en ajouter davantage.
        </Alert>
      )}
      {nearHardLimit && (
        <Alert tone="warning">
          {billing.studentCount} / {billing.studentHardLimit} élèves — votre plan gratuit approche
          de sa limite. Pensez à passer à Établissement Pro pour continuer à inscrire.
        </Alert>
      )}
      {overSoftLimit && (
        <Alert tone="primary">
          Vous gérez plus de <strong>{billing.studentSoftLimit} élèves</strong> — le plan Enterprise
          (tarif dégressif, accompagnement dédié) est fait pour vous.
        </Alert>
      )}
      {!billing.stripeConfigured && billing.plan === 'STARTER' && (
        <Alert tone="muted">
          La facturation en ligne n’est pas encore activée sur cette plateforme — pour passer à
          Établissement Pro, contactez-nous.
        </Alert>
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
              Mettre à jour la carte
            </Button>
          ) : canManage && live ? (
            <button
              type="button"
              onClick={openPortal}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-2xs font-semibold text-primary hover:bg-secondary/80 disabled:opacity-60"
            >
              <Settings2 size={11} />
              Gérer le plan
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
              Passer à Pro
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
          <div className="text-caption font-bold text-foreground">Gérer votre abonnement</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Changez de cycle ou rétrogradez directement ici. Le moyen de paiement et les factures se
            gèrent dans l’espace sécurisé Stripe.
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={openPortal}
              disabled={busy !== null}
            >
              Moyen de paiement & factures
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
                    ? 'Repasser au mensuel'
                    : 'Passer à l’annuel (−10 %)'}
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
                Reprendre {PLAN_LABELS.PRO}
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
                Rétrograder vers Starter
              </Button>
            )}
          </div>

          {confirm && (
            <div className="mt-3.5 rounded-md border border-primary/20 bg-secondary p-3.5 text-caption text-primary">
              {confirm === 'resume' && (
                <p>
                  Reprendre {PLAN_LABELS.PRO} ? La rétrogradation programmée sera annulée — aucune
                  nouvelle facture, votre cycle continue normalement.
                </p>
              )}
              {confirm === 'interval' && (
                <p>
                  Confirmer le passage à la facturation{' '}
                  <strong>{interval === 'YEAR' ? 'annuelle (−10 %)' : 'mensuelle'}</strong> ? Le
                  changement est proratisé immédiatement par Stripe.
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
                  Confirmer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setConfirm(null)}
                  disabled={busy !== null}
                >
                  Retour
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
