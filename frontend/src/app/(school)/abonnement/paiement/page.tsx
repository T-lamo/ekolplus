'use client';

// Compte › Abonnement › Paiement (/abonnement/paiement) — Banani « Stripe Checkout »
// (2Pl77h7xYQk2), plan: .planning/banani/abonnement-stripe.md. The récap
// step BEFORE the hosted Stripe Checkout: steps · plan/cycle/headcount ·
// billing info · « paiement par carte » explainer, with the sticky order
// summary + « Continuer vers le paiement sécurisé » on the right. The card
// itself is entered on Stripe's page (redirect) — no card fields here, no
// PCI scope, no publishable key. `?etape=confirmation` is the return step
// (polls the billing summary until the webhook has activated the plan) ;
// `?annule=1` is Stripe's cancel_url. Right column = ASIDE_GRID (app-wide
// rule), not the mockup's fixed 340px.
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Headphones,
  Layers,
  Lock,
  Mail,
  PiggyBank,
  RotateCcw,
  School as SchoolIcon,
  Crown,
  Shield,
  ShieldCheck,
  Sprout,
  XCircle,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ASIDE_GRID } from '@/lib/layout';
import { cn } from '@/lib/utils';
import {
  ANNUAL_DISCOUNT,
  PLAN_FEATURES,
  PLAN_LABELS,
  formatUsd,
  type BillingIntervalKey,
  type PlanKey,
} from '@/lib/billing-plans';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageHeaderCard } from '@/components/school/PageHeaderCard';
import { FormStepsBar } from '@/components/school/FormStepsBar';
import { FormSectionCard } from '@/components/school/FormSectionCard';
import { useBilling } from '@/components/school/billing/useBilling';
import { fmtDateLong } from '@/components/school/billing/billing-format';
import { LOCALE_BCP47 } from '@/lib/locales';
import type { SchoolResponse } from '@/app/(school)/settings/types';

/** Terms page linked from the récap — override per deployment (NEXT_PUBLIC_TERMS_URL). */
const TERMS_URL = process.env.NEXT_PUBLIC_TERMS_URL || '/cgu';

const STEPS = [
  { id: 'plan', label: 'Choisir le plan' },
  { id: 'paiement', label: 'Paiement' },
  { id: 'confirmation', label: 'Confirmation' },
];

export default function PaiementPage() {
  return (
    <Suspense fallback={null}>
      <PaiementScreen />
    </Suspense>
  );
}

function PaiementScreen() {
  const user = useUser();
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const params = useSearchParams();
  const { toast } = useToast();
  const isConfirmation = params.get('etape') === 'confirmation';
  const canceled = params.get('annule') === '1';
  const { data, loading, error, busy, redirectTo, reload } = useBilling(Boolean(user));
  const [school, setSchool] = useState<SchoolResponse['school'] | null>(null);
  const [interval, setInterval_] = useState<BillingIntervalKey>(
    params.get('cycle') === 'YEAR' ? 'YEAR' : 'MONTH',
  );

  useEffect(() => {
    if (!user) return;
    api<SchoolResponse>('/api/school')
      .then((r) => setSchool(r.school))
      .catch(() => setSchool(null));
  }, [user]);

  // Annual toggle only if the annual Price is configured server-side.
  useEffect(() => {
    if (data && !data.billing.rates.annualAvailable && interval === 'YEAR') setInterval_('MONTH');
  }, [data, interval]);

  const billing = data?.billing ?? null;
  const canManage = data?.role === 'OWNER';
  const annual = interval === 'YEAR' && Boolean(billing?.rates.annualAvailable);

  const totals = useMemo(() => {
    if (!billing) return null;
    const n = billing.studentCount;
    const monthlyList = n * billing.rates.monthlyCents; // undiscounted monthly
    const annualList = monthlyList * 12;
    const annualNet = n * billing.rates.annualCents;
    return {
      students: n,
      monthlyList,
      annualList,
      annualNet,
      annualSaving: annualList - annualNet,
      due: annual ? annualNet : monthlyList,
    };
  }, [billing, annual]);

  async function pay() {
    const msg = await redirectTo('checkout', { interval });
    if (msg) toast(msg, 'error');
  }

  if (!user || loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }
  if (error || !billing || !totals) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        {error ?? 'Impossible de charger l’abonnement.'}
      </p>
    );
  }

  if (isConfirmation) {
    return <ConfirmationStep activated={billing.managedByStripe} reload={reload} />;
  }

  const alreadyPro =
    billing.managedByStripe && billing.plan === 'PRO' && !billing.cancelAtPeriodEnd;
  const rateLabel = annual
    ? `${formatUsd(billing.rates.annualCents, bcp47)} / élève / an`
    : `${formatUsd(billing.rates.monthlyCents, bcp47)} / élève / mois`;
  const trialEnds = new Date(Date.now() + billing.rates.trialDays * 86_400_000).toISOString();
  const firstStripe = !billing.managedByStripe && billing.status !== 'CANCELED';

  return (
    <div className="flex flex-col gap-4">
      <PageHeaderCard
        backHref="/abonnement"
        chip={
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary sm:flex">
            <Lock size={16} />
          </span>
        }
        title="Paiement sécurisé"
        meta={`Abonnement › ${PLAN_LABELS.PRO}`}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 text-2xs font-semibold text-success-foreground">
            <Lock size={12} />
            Connexion SSL 256-bit
          </span>
        }
      />

      <FormStepsBar steps={STEPS} activeIndex={1} maxReachedIndex={1} onStepSelect={() => {}} />

      {canceled && (
        <div className="flex items-start gap-2.5 rounded-md border border-warning-foreground/30 bg-warning p-3.5 text-caption text-warning-foreground">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            Paiement annulé — aucun montant n’a été prélevé. Vous pouvez reprendre quand vous
            voulez.
          </p>
        </div>
      )}
      {alreadyPro && (
        <div className="flex items-start gap-2.5 rounded-md border border-primary/20 bg-secondary p-3.5 text-caption text-primary">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <p>
            Cette école est déjà abonnée au plan {PLAN_LABELS.PRO}. Gérez le cycle, la carte et les
            factures depuis la page{' '}
            <Link href="/abonnement" className="font-semibold underline">
              Abonnement
            </Link>
            .
          </p>
        </div>
      )}
      {!canManage && (
        <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted p-3.5 text-caption text-muted-foreground">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>Seul le propriétaire de l’établissement peut souscrire un abonnement.</p>
        </div>
      )}

      <div className={cn(ASIDE_GRID, 'items-start')}>
        {/* LEFT */}
        <div className="flex min-w-0 flex-col gap-4">
          <FormSectionCard
            id="plan"
            icon={<Layers size={15} />}
            title="Sélectionner le plan"
            subtitle={`Tarification à ${formatUsd(billing.rates.monthlyCents, bcp47)} par élève / mois`}
          >
            <div role="radiogroup" aria-label="Plan" className="flex flex-col gap-2">
              <PlanOption
                value="STARTER"
                icon={<Sprout size={14} className="text-muted-foreground" />}
                iconBg="bg-muted"
                name="Starter"
                desc={
                  billing.plan === 'STARTER'
                    ? 'Jusqu’à 50 élèves · gratuit pour toujours — votre plan actuel'
                    : 'Jusqu’à 50 élèves · plan de repli après rétrogradation'
                }
                price="0 $"
                current={billing.plan === 'STARTER'}
                disabled
                disabledReason={
                  billing.plan === 'STARTER'
                    ? 'Vous êtes déjà sur Starter'
                    : 'Rétrogradez depuis la page Abonnement'
                }
              />
              <PlanOption
                value="PRO"
                icon={<Crown size={14} className="text-gold-900" />}
                iconBg="bg-linear-to-br from-gold-300 to-gold-500"
                name={PLAN_LABELS.PRO}
                desc="Jusqu’à 1000 élèves"
                price={rateLabel}
                selected
                current={billing.plan === 'PRO'}
                popular
              />
            </div>

            {billing.rates.annualAvailable && (
              <div className="mt-3.5">
                <div className="mb-2 text-xs font-semibold text-foreground">
                  Cycle de facturation
                </div>
                <div className="flex gap-2">
                  <CycleTile
                    label="Mensuel"
                    sub={`${formatUsd(billing.rates.monthlyCents, bcp47)} / élève / mois`}
                    active={!annual}
                    onClick={() => setInterval_('MONTH')}
                  />
                  <CycleTile
                    label="Annuel"
                    sub={`${formatUsd(Math.round(billing.rates.annualCents / 12), bcp47)} / élève / mois`}
                    active={annual}
                    badge={`Économisez ${Math.round(ANNUAL_DISCOUNT * 100)} %`}
                    onClick={() => setInterval_('YEAR')}
                  />
                </div>
              </div>
            )}

            <div className="mt-3.5">
              <div className="mb-2 text-xs font-semibold text-foreground">Nombre d’élèves</div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 flex-1 items-center justify-center rounded-md border-[1.5px] border-border bg-card text-[22px] font-extrabold text-primary tabular-nums">
                  {totals.students}
                </div>
                <div className="text-xs whitespace-nowrap text-muted-foreground">
                  élève{totals.students > 1 ? 's' : ''} inscrit{totals.students > 1 ? 's' : ''}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3 rounded-md bg-secondary px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-secondary-foreground">
                    Estimation {annual ? 'annuelle' : 'mensuelle'}
                  </div>
                  <div className="mt-0.5 text-2xs text-secondary-foreground/80">
                    {totals.students} élève{totals.students > 1 ? 's' : ''} ×{' '}
                    {annual
                      ? `${formatUsd(billing.rates.annualCents, bcp47)} / an`
                      : `${formatUsd(billing.rates.monthlyCents, bcp47)} / mois`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[15px] font-extrabold whitespace-nowrap text-primary tabular-nums">
                    {formatUsd(totals.due, bcp47)} / {annual ? 'an' : 'mois'}
                  </div>
                  <div className="text-2xs text-muted-foreground">
                    ≈{' '}
                    {formatUsd(
                      annual ? Math.round(totals.annualNet / 12) : totals.monthlyList * 12,
                      bcp47,
                      { decimals: 0 },
                    )}{' '}
                    / {annual ? 'mois' : 'an'}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-2xs text-muted-foreground">
                Le nombre de sièges facturés suit automatiquement vos effectifs (synchronisation
                quotidienne, sans prorata surprise) — nul besoin de l’ajuster à la main.
              </p>
            </div>
          </FormSectionCard>

          <FormSectionCard
            id="facturation"
            icon={<Building2 size={15} />}
            title="Informations de facturation"
            subtitle="Ces informations apparaîtront sur vos factures"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ReadField
                label="Nom de l’établissement"
                icon={<SchoolIcon size={14} />}
                value={school?.name}
              />
              <ReadField
                label="Code officiel / NIF (facultatif)"
                value={school?.officialCode}
                placeholder="Ex : 123-456-789"
              />
              <ReadField
                label="Email de facturation"
                icon={<Mail size={14} />}
                value={school?.officialEmail ?? user.email}
              />
              <ReadField label="Téléphone" value={school?.phone} placeholder="—" />
              <ReadField label="Pays" value={school?.country} />
              <ReadField
                label="Adresse"
                value={[school?.address, school?.city].filter(Boolean).join(', ') || null}
                placeholder="—"
              />
            </div>
            <p className="mt-3 text-2xs text-muted-foreground">
              Modifiables dans{' '}
              <Link
                href="/settings?tab=etablissement"
                className="font-semibold text-primary hover:underline"
              >
                Paramètres › Établissement
              </Link>
              . L’adresse de facturation est confirmée sur la page de paiement Stripe.
            </p>
          </FormSectionCard>

          <FormSectionCard
            id="carte"
            icon={<CreditCard size={15} />}
            title="Paiement par carte"
            subtitle="Formulaire sécurisé hébergé par Stripe"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1">
                <BrandChip className="bg-[#1a1a6e]">VISA</BrandChip>
                <BrandChip className="bg-[linear-gradient(90deg,#eb001b_50%,#f79e1b_50%)]">
                  {' '}
                </BrandChip>
                <BrandChip className="bg-[#006FCF]">AMEX</BrandChip>
                <span className="ml-2 text-2xs text-muted-foreground">
                  Cartes de crédit et de débit internationales
                </span>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-secondary px-3 py-2.5">
                <ShieldCheck size={15} className="mt-px shrink-0 text-primary" />
                <div>
                  <div className="text-xs font-semibold text-primary">
                    Paiement traité par Stripe
                  </div>
                  <div className="mt-0.5 text-2xs text-muted-foreground">
                    Vos données bancaires ne sont jamais stockées sur nos serveurs. En cliquant sur
                    « Continuer », vous saisirez votre carte sur la page sécurisée Stripe (PCI-DSS
                    niveau 1, 3D Secure).
                  </div>
                </div>
              </div>
              <p className="text-2xs text-muted-foreground">
                Un code promotionnel ? Il se saisit directement sur la page Stripe.
              </p>
            </div>
          </FormSectionCard>
        </div>

        {/* RIGHT — order summary */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="bg-linear-to-br from-gold-300 to-gold-500 px-[18px] py-3.5 text-gold-900">
              <div className="flex items-center gap-1.5 text-caption font-bold">
                <Crown size={14} />
                Résumé de la commande
              </div>
              <div className="mt-0.5 text-2xs text-gold-900/75">
                {PLAN_LABELS.PRO} · {annual ? 'Annuel' : 'Mensuel'} · {totals.students} élève
                {totals.students > 1 ? 's' : ''}
              </div>
            </div>
            <div className="flex flex-col gap-2.5 px-[18px] py-4">
              <SummaryRow label={`Plan ${PLAN_LABELS.PRO}`} value={rateLabel} />
              <SummaryRow
                label="Nombre d’élèves"
                value={`${totals.students} élève${totals.students > 1 ? 's' : ''}`}
              />
              <SummaryRow
                label="Sous-total mensuel"
                value={`${formatUsd(totals.monthlyList, bcp47)} / mois`}
              />
              {annual && (
                <>
                  <SummaryRow label="Facturation annuelle" value="× 12 mois" />
                  <SummaryRow
                    label={`Remise annuelle (−${Math.round(ANNUAL_DISCOUNT * 100)} %)`}
                    value={`−${formatUsd(totals.annualSaving, bcp47)}`}
                    accent
                  />
                </>
              )}
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-foreground">Total à payer</div>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-primary tabular-nums">
                    {formatUsd(totals.due, bcp47)}
                  </div>
                  <div className="mt-0.5 text-2xs text-muted-foreground">
                    {annual ? 'par an' : 'par mois'} · TTC
                  </div>
                </div>
              </div>
              {annual && totals.annualSaving > 0 && (
                <div className="flex items-center gap-1.5 rounded-md bg-success px-2.5 py-2">
                  <PiggyBank size={13} className="shrink-0 text-success-foreground" />
                  <span className="text-2xs font-semibold text-success-foreground">
                    Vous économisez {formatUsd(totals.annualSaving, bcp47)} vs. mensuel
                  </span>
                </div>
              )}
              {firstStripe && (
                <div className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-2">
                  <Zap size={13} className="shrink-0 text-primary" />
                  <span className="text-2xs font-semibold text-primary">
                    Essai gratuit {billing.rates.trialDays} jours — premier prélèvement le{' '}
                    {fmtDateLong(trialEnds, bcp47)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5 border-t border-border px-[18px] py-3.5">
              <div className="mb-0.5 text-2xs font-bold tracking-[0.6px] text-muted-foreground uppercase">
                Inclus dans le plan
              </div>
              {PLAN_FEATURES.PRO.map((f) => (
                <div key={f.label} className="flex items-start gap-[7px] text-xs text-foreground">
                  <Check size={11} className="mt-px shrink-0 text-success-foreground" />
                  {f.label}
                </div>
              ))}
            </div>
          </section>

          <Button
            type="button"
            variant="gold"
            className="h-12 text-sm font-bold"
            onClick={pay}
            loading={busy === 'checkout'}
            disabled={!canManage || alreadyPro || !billing.stripeConfigured}
          >
            <Lock size={16} />
            {firstStripe
              ? 'Démarrer l’essai gratuit'
              : `Payer ${formatUsd(totals.due, bcp47)} maintenant`}
          </Button>
          <p className="text-center text-2xs text-muted-foreground">
            En cliquant, vous acceptez nos{' '}
            <a
              href={TERMS_URL}
              target={TERMS_URL.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="font-semibold text-foreground underline underline-offset-2"
            >
              conditions d’utilisation
            </a>{' '}
            et serez redirigé vers Stripe.
          </p>

          <div className="flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-secondary px-3.5 py-2">
            <span className="inline-flex items-center gap-1 rounded bg-[#635bff] px-2 py-0.5 text-[10px] font-extrabold tracking-[0.5px] text-white">
              <CreditCard size={9} />
              Stripe
            </span>
            <span className="text-2xs font-medium text-primary">Paiement sécurisé via Stripe</span>
          </div>

          <div className="flex flex-col gap-1.5 rounded-md bg-muted px-3.5 py-3">
            <Note icon={<RotateCcw size={12} />}>
              Essai gratuit {billing.rates.trialDays} jours, sans engagement
            </Note>
            <Note icon={<XCircle size={12} />}>
              Résiliation à tout moment depuis votre espace client
            </Note>
            <Note icon={<Headphones size={12} />}>Support disponible par email</Note>
          </div>

          <div className="flex items-center justify-center gap-5 pt-1">
            <Sec icon={<Shield size={13} />}>SSL 256-bit</Sec>
            <Sec icon={<BadgeCheck size={13} />}>PCI-DSS</Sec>
            <Sec icon={<Lock size={13} />}>3D Secure</Sec>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ConfirmationStep({
  activated,
  reload,
}: {
  activated: boolean;
  reload: () => Promise<unknown>;
}) {
  const [tries, setTries] = useState(0);
  // The webhook usually lands within a second or two of the redirect — poll
  // the summary a few times before giving up on the spinner (the daily
  // stripe-sync cron self-heals if the webhook was missed).
  useEffect(() => {
    if (activated || tries >= 10) return;
    const t = setTimeout(() => {
      void reload().finally(() => setTries((n) => n + 1));
    }, 2000);
    return () => clearTimeout(t);
  }, [activated, tries, reload]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeaderCard
        backHref="/abonnement"
        backLabel="Abonnement"
        title="Confirmation"
        meta={`Abonnement › ${PLAN_LABELS.PRO}`}
      />
      <FormStepsBar steps={STEPS} activeIndex={2} maxReachedIndex={2} onStepSelect={() => {}} />
      <section className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-10 text-center">
        <span
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-full',
            activated ? 'bg-success text-success-foreground' : 'bg-secondary text-primary',
          )}
        >
          <CheckCircle2 size={28} />
        </span>
        <h2 className="text-lg font-extrabold text-foreground">
          {activated ? 'Abonnement activé' : 'Paiement confirmé'}
        </h2>
        <p className="max-w-md text-caption text-muted-foreground">
          {activated
            ? `Votre école est maintenant sur le plan ${PLAN_LABELS.PRO}. Un reçu vous a été envoyé par Stripe.`
            : tries < 10
              ? 'Merci ! Stripe nous confirme votre abonnement — activation en cours, quelques secondes…'
              : 'Le paiement est enregistré côté Stripe ; l’activation sera visible sous peu (synchronisation automatique).'}
        </p>
        <Link href="/abonnement" className="mt-2">
          <Button type="button" size="sm" className="w-fit">
            Voir mon abonnement
          </Button>
        </Link>
      </section>
    </div>
  );
}

// ── small presentational bits ────────────────────────────────────────────

/**
 * A real radio (native `<input type="radio">`, visually replaced by the dot)
 * so the récap's plan choice is a form control: Starter is disabled (it is
 * the free fallback — a downgrade is done from the Abonnement page), Pro is
 * the checked option; the checkout only ever creates a Pro subscription.
 */
function PlanOption({
  value,
  icon,
  iconBg,
  name,
  desc,
  price,
  selected,
  current,
  popular,
  disabled,
  disabledReason,
}: {
  value: PlanKey;
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  desc: string;
  price: string;
  selected?: boolean;
  current?: boolean;
  /** The Pro option — « or = plan payant » : gold selection ring + « Le plus populaire » pill. */
  popular?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <label
      data-testid={`plan-option-${value}`}
      {...(disabledReason ? { title: disabledReason } : {})}
      className={cn(
        'flex items-center gap-3 rounded-md border-[1.5px] px-3.5 py-3',
        selected
          ? popular
            ? 'border-gold-400 bg-gold-100/60'
            : 'border-primary bg-secondary'
          : 'border-border',
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
      )}
    >
      <input
        type="radio"
        name="plan"
        value={value}
        checked={Boolean(selected)}
        disabled={disabled}
        readOnly
        className="sr-only"
        aria-label={name}
      />
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
          selected
            ? popular
              ? 'border-gold-500 bg-gold-500'
              : 'border-primary bg-primary'
            : 'border-border',
        )}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded', iconBg)}>
        {icon}
      </span>
      {/* Info + price: stacked on small screens, side by side from sm. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption font-bold',
              selected ? (popular ? 'text-gold-700' : 'text-primary') : 'text-foreground',
            )}
          >
            <span>{name}</span>
            {popular && (
              <span className="rounded-full bg-linear-to-br from-gold-300 to-gold-500 px-[7px] py-0.5 text-[10px] font-bold text-gold-900">
                ⭐ Le plus populaire
              </span>
            )}
            {selected && (
              <span
                className={cn(
                  'rounded-full px-[7px] py-0.5 text-[10px] font-bold',
                  popular ? 'bg-gold-700 text-gold-100' : 'bg-primary text-white',
                )}
              >
                Sélectionné
              </span>
            )}
            {current && (
              <span className="rounded-full bg-muted px-[7px] py-0.5 text-[10px] font-bold text-muted-foreground">
                Plan actuel
              </span>
            )}
          </div>
          <div className="mt-0.5 text-2xs text-muted-foreground">{desc}</div>
        </div>
        <div
          className={cn(
            'shrink-0 text-caption font-bold whitespace-nowrap',
            selected ? (popular ? 'text-gold-700' : 'text-primary') : 'text-foreground',
          )}
        >
          {price}
        </div>
      </div>
    </label>
  );
}

function CycleTile({
  label,
  sub,
  active,
  badge,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative flex-1 rounded-md px-3.5 py-2.5 text-center',
        active
          ? 'border-2 border-gold-400 bg-gold-100/60'
          : 'border-[1.5px] border-border hover:bg-muted',
      )}
    >
      {badge && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-success px-2 py-0.5 text-[9px] font-bold whitespace-nowrap text-success-foreground">
          {badge}
        </span>
      )}
      <div
        className={cn(
          'text-caption',
          active ? 'font-bold text-gold-700' : 'font-semibold text-foreground',
        )}
      >
        {label}
      </div>
      <div className="mt-0.5 text-2xs text-muted-foreground">{sub}</div>
    </button>
  );
}

function ReadField({
  label,
  icon,
  value,
  placeholder,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string | null | undefined;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-xs font-semibold text-foreground">{label}</div>
      <div className="flex min-h-[38px] min-w-0 items-center gap-2 overflow-hidden rounded-md border-[1.5px] border-border bg-input px-3 py-2 text-caption">
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        <span
          className={cn('flex-1 truncate', value ? 'text-foreground' : 'text-muted-foreground')}
        >
          {value || placeholder || '—'}
        </span>
      </div>
    </div>
  );
}

function BrandChip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-5 w-8 shrink-0 items-center justify-center rounded-[3px] text-[7px] font-black tracking-[0.5px] text-white',
        className,
      )}
    >
      {children}
    </span>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-xs font-semibold whitespace-nowrap',
          accent ? 'text-success-foreground' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Note({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-[7px] text-2xs text-muted-foreground">
      <span className="mt-px shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function Sec({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}
