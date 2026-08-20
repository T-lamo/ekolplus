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
import { useLocale, useTranslations } from 'next-intl';
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
  formatUsd,
  type BillingIntervalKey,
  type PlanKey,
} from '@/lib/billing-plans';
import { planFeatures, planLabel, type PlanFeatureT } from '@/lib/billing-plan-i18n';
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

export default function PaiementPage() {
  return (
    <Suspense fallback={null}>
      <PaiementScreen />
    </Suspense>
  );
}

const STEP_IDS = ['plan', 'paiement', 'confirmation'] as const;

function PaiementScreen() {
  const t = useTranslations('AbonnementPaiement');
  const tPlan = useTranslations('BillingPlans.label');
  const tFeatures = useTranslations('BillingPlans.features') as unknown as PlanFeatureT;
  const steps = [
    { id: STEP_IDS[0], label: t('steps.plan') },
    { id: STEP_IDS[1], label: t('steps.payment') },
    { id: STEP_IDS[2], label: t('steps.confirmation') },
  ];
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
        {error ?? t('loadError')}
      </p>
    );
  }

  if (isConfirmation) {
    return <ConfirmationStep activated={billing.managedByStripe} reload={reload} />;
  }

  const proLabel = planLabel('PRO', tPlan);
  const alreadyPro =
    billing.managedByStripe && billing.plan === 'PRO' && !billing.cancelAtPeriodEnd;
  const rateLabel = annual
    ? `${formatUsd(billing.rates.annualCents, bcp47)} ${t('plan.perElevePerYear')}`
    : `${formatUsd(billing.rates.monthlyCents, bcp47)} ${t('plan.perElevePerMonth')}`;
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
        title={t('header.title')}
        meta={t('header.meta', { plan: proLabel })}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 text-2xs font-semibold text-success-foreground">
            <Lock size={12} />
            {t('header.sslBadge')}
          </span>
        }
      />

      <FormStepsBar steps={steps} activeIndex={1} maxReachedIndex={1} onStepSelect={() => {}} />

      {canceled && (
        <div className="flex items-start gap-2.5 rounded-md border border-warning-foreground/30 bg-warning p-3.5 text-caption text-warning-foreground">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{t('banners.canceled')}</p>
        </div>
      )}
      {alreadyPro && (
        <div className="flex items-start gap-2.5 rounded-md border border-primary/20 bg-secondary p-3.5 text-caption text-primary">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <p>
            {t.rich('banners.alreadyPro', {
              plan: proLabel,
              link: (chunks) => (
                <Link href="/abonnement" className="font-semibold underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      )}
      {!canManage && (
        <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted p-3.5 text-caption text-muted-foreground">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{t('banners.notOwner')}</p>
        </div>
      )}

      <div className={cn(ASIDE_GRID, 'items-start')}>
        {/* LEFT */}
        <div className="flex min-w-0 flex-col gap-4">
          <FormSectionCard
            id="plan"
            icon={<Layers size={15} />}
            title={t('plan.title')}
            subtitle={t('plan.subtitle', {
              amount: formatUsd(billing.rates.monthlyCents, bcp47),
            })}
          >
            <div role="radiogroup" aria-label={t('plan.ariaLabel')} className="flex flex-col gap-2">
              <PlanOption
                value="STARTER"
                icon={<Sprout size={14} className="text-muted-foreground" />}
                iconBg="bg-muted"
                name={t('plan.starterName')}
                desc={
                  billing.plan === 'STARTER'
                    ? t('plan.starterDescCurrent')
                    : t('plan.starterDescOther')
                }
                price={t('plan.starterPrice')}
                current={billing.plan === 'STARTER'}
                disabled
                disabledReason={
                  billing.plan === 'STARTER'
                    ? t('plan.starterDisabledCurrent')
                    : t('plan.starterDisabledOther')
                }
              />
              <PlanOption
                value="PRO"
                icon={<Crown size={14} className="text-gold-900" />}
                iconBg="bg-linear-to-br from-gold-300 to-gold-500"
                name={proLabel}
                desc={t('plan.proDesc')}
                price={rateLabel}
                selected
                current={billing.plan === 'PRO'}
                popular
              />
            </div>

            {billing.rates.annualAvailable && (
              <div className="mt-3.5">
                <div className="mb-2 text-xs font-semibold text-foreground">
                  {t('plan.cycleTitle')}
                </div>
                <div className="flex gap-2">
                  <CycleTile
                    label={t('plan.monthly')}
                    sub={`${formatUsd(billing.rates.monthlyCents, bcp47)} ${t('plan.perElevePerMonth')}`}
                    active={!annual}
                    onClick={() => setInterval_('MONTH')}
                  />
                  <CycleTile
                    label={t('plan.annual')}
                    sub={`${formatUsd(Math.round(billing.rates.annualCents / 12), bcp47)} ${t('plan.perElevePerMonth')}`}
                    active={annual}
                    badge={t('plan.cycleSave', { pct: Math.round(ANNUAL_DISCOUNT * 100) })}
                    onClick={() => setInterval_('YEAR')}
                  />
                </div>
              </div>
            )}

            <div className="mt-3.5">
              <div className="mb-2 text-xs font-semibold text-foreground">
                {t('plan.studentCountLabel')}
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 flex-1 items-center justify-center rounded-md border-[1.5px] border-border bg-card text-[22px] font-extrabold text-primary tabular-nums">
                  {totals.students}
                </div>
                <div className="text-xs whitespace-nowrap text-muted-foreground">
                  {t(
                    totals.students > 1
                      ? 'plan.studentsEnrolled.other'
                      : 'plan.studentsEnrolled.one',
                  )}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3 rounded-md bg-secondary px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-secondary-foreground">
                    {annual ? t('plan.estimateAnnual') : t('plan.estimateMonthly')}
                  </div>
                  <div className="mt-0.5 text-2xs text-secondary-foreground/80">
                    {t(
                      totals.students > 1
                        ? 'summary.studentCountValue.other'
                        : 'summary.studentCountValue.one',
                      { count: totals.students },
                    )}{' '}
                    ×{' '}
                    {annual
                      ? `${formatUsd(billing.rates.annualCents, bcp47)} ${t('plan.unitPerYear')}`
                      : `${formatUsd(billing.rates.monthlyCents, bcp47)} ${t('plan.unitPerMonth')}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[15px] font-extrabold whitespace-nowrap text-primary tabular-nums">
                    {formatUsd(totals.due, bcp47)}{' '}
                    {annual ? t('plan.unitPerYear') : t('plan.unitPerMonth')}
                  </div>
                  <div className="text-2xs text-muted-foreground">
                    ≈{' '}
                    {formatUsd(
                      annual ? Math.round(totals.annualNet / 12) : totals.monthlyList * 12,
                      bcp47,
                      { decimals: 0 },
                    )}{' '}
                    {annual ? t('plan.unitPerMonth') : t('plan.unitPerYear')}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-2xs text-muted-foreground">{t('plan.seatsHint')}</p>
            </div>
          </FormSectionCard>

          <FormSectionCard
            id="facturation"
            icon={<Building2 size={15} />}
            title={t('billingInfo.title')}
            subtitle={t('billingInfo.subtitle')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ReadField
                label={t('billingInfo.schoolName')}
                icon={<SchoolIcon size={14} />}
                value={school?.name}
              />
              <ReadField
                label={t('billingInfo.officialCode')}
                value={school?.officialCode}
                placeholder={t('billingInfo.officialCodePlaceholder')}
              />
              <ReadField
                label={t('billingInfo.billingEmail')}
                icon={<Mail size={14} />}
                value={school?.officialEmail ?? user.email}
              />
              <ReadField label={t('billingInfo.phone')} value={school?.phone} placeholder="—" />
              <ReadField label={t('billingInfo.country')} value={school?.country} />
              <ReadField
                label={t('billingInfo.address')}
                value={[school?.address, school?.city].filter(Boolean).join(', ') || null}
                placeholder="—"
              />
            </div>
            <p className="mt-3 text-2xs text-muted-foreground">
              {t.rich('billingInfo.footer', {
                link: (chunks) => (
                  <Link
                    href="/settings?tab=etablissement"
                    className="font-semibold text-primary hover:underline"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </FormSectionCard>

          <FormSectionCard
            id="carte"
            icon={<CreditCard size={15} />}
            title={t('card.title')}
            subtitle={t('card.subtitle')}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1">
                <BrandChip className="bg-[#1a1a6e]">VISA</BrandChip>
                <BrandChip className="bg-[linear-gradient(90deg,#eb001b_50%,#f79e1b_50%)]">
                  {' '}
                </BrandChip>
                <BrandChip className="bg-[#006FCF]">AMEX</BrandChip>
                <span className="ml-2 text-2xs text-muted-foreground">{t('card.cardTypes')}</span>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-secondary px-3 py-2.5">
                <ShieldCheck size={15} className="mt-px shrink-0 text-primary" />
                <div>
                  <div className="text-xs font-semibold text-primary">
                    {t('card.processedByStripe')}
                  </div>
                  <div className="mt-0.5 text-2xs text-muted-foreground">
                    {t('card.dataNotice')}
                  </div>
                </div>
              </div>
              <p className="text-2xs text-muted-foreground">{t('card.promoNotice')}</p>
            </div>
          </FormSectionCard>
        </div>

        {/* RIGHT — order summary */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="bg-linear-to-br from-gold-300 to-gold-500 px-[18px] py-3.5 text-gold-900">
              <div className="flex items-center gap-1.5 text-caption font-bold">
                <Crown size={14} />
                {t('summary.title')}
              </div>
              <div className="mt-0.5 text-2xs text-gold-900/75">
                {t(totals.students > 1 ? 'summary.meta.other' : 'summary.meta.one', {
                  plan: proLabel,
                  cycle: annual ? t('plan.annual') : t('plan.monthly'),
                  count: totals.students,
                })}
              </div>
            </div>
            <div className="flex flex-col gap-2.5 px-[18px] py-4">
              <SummaryRow label={t('summary.planLabel', { plan: proLabel })} value={rateLabel} />
              <SummaryRow
                label={t('summary.studentCount')}
                value={t(
                  totals.students > 1
                    ? 'summary.studentCountValue.other'
                    : 'summary.studentCountValue.one',
                  { count: totals.students },
                )}
              />
              <SummaryRow
                label={t('summary.monthlySubtotal')}
                value={`${formatUsd(totals.monthlyList, bcp47)} ${t('plan.unitPerMonth')}`}
              />
              {annual && (
                <>
                  <SummaryRow
                    label={t('summary.annualBilling')}
                    value={t('summary.annualBillingValue')}
                  />
                  <SummaryRow
                    label={t('summary.annualDiscount', { pct: Math.round(ANNUAL_DISCOUNT * 100) })}
                    value={`−${formatUsd(totals.annualSaving, bcp47)}`}
                    accent
                  />
                </>
              )}
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-foreground">{t('summary.totalDue')}</div>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-primary tabular-nums">
                    {formatUsd(totals.due, bcp47)}
                  </div>
                  <div className="mt-0.5 text-2xs text-muted-foreground">
                    {annual ? t('summary.perYear') : t('summary.perMonth')} ·{' '}
                    {t('summary.taxIncluded')}
                  </div>
                </div>
              </div>
              {annual && totals.annualSaving > 0 && (
                <div className="flex items-center gap-1.5 rounded-md bg-success px-2.5 py-2">
                  <PiggyBank size={13} className="shrink-0 text-success-foreground" />
                  <span className="text-2xs font-semibold text-success-foreground">
                    {t('summary.savingBanner', { amount: formatUsd(totals.annualSaving, bcp47) })}
                  </span>
                </div>
              )}
              {firstStripe && (
                <div className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-2">
                  <Zap size={13} className="shrink-0 text-primary" />
                  <span className="text-2xs font-semibold text-primary">
                    {t('summary.trialBanner', {
                      days: billing.rates.trialDays,
                      date: fmtDateLong(trialEnds, bcp47),
                    })}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5 border-t border-border px-[18px] py-3.5">
              <div className="mb-0.5 text-2xs font-bold tracking-[0.6px] text-muted-foreground uppercase">
                {t('summary.includedInPlan')}
              </div>
              {planFeatures('PRO', tFeatures).map((f) => (
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
              ? t('cta.startTrial')
              : t('cta.payNow', { amount: formatUsd(totals.due, bcp47) })}
          </Button>
          <p className="text-center text-2xs text-muted-foreground">
            {t.rich('cta.termsNotice', {
              link: (chunks) => (
                <a
                  href={TERMS_URL}
                  target={TERMS_URL.startsWith('http') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className="font-semibold text-foreground underline underline-offset-2"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>

          <div className="flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-secondary px-3.5 py-2">
            <span className="inline-flex items-center gap-1 rounded bg-[#635bff] px-2 py-0.5 text-[10px] font-extrabold tracking-[0.5px] text-white">
              <CreditCard size={9} />
              {t('cta.stripeBadge')}
            </span>
            <span className="text-2xs font-medium text-primary">{t('cta.stripeSecure')}</span>
          </div>

          <div className="flex flex-col gap-1.5 rounded-md bg-muted px-3.5 py-3">
            <Note icon={<RotateCcw size={12} />}>
              {t('notes.freeTrial', { days: billing.rates.trialDays })}
            </Note>
            <Note icon={<XCircle size={12} />}>{t('notes.cancelAnytime')}</Note>
            <Note icon={<Headphones size={12} />}>{t('notes.support')}</Note>
          </div>

          <div className="flex items-center justify-center gap-5 pt-1">
            <Sec icon={<Shield size={13} />}>{t('security.ssl')}</Sec>
            <Sec icon={<BadgeCheck size={13} />}>{t('security.pci')}</Sec>
            <Sec icon={<Lock size={13} />}>{t('security.threeDs')}</Sec>
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
  const t = useTranslations('AbonnementPaiement');
  const tPlan = useTranslations('BillingPlans.label');
  const proLabel = planLabel('PRO', tPlan);
  const steps = [
    { id: STEP_IDS[0], label: t('steps.plan') },
    { id: STEP_IDS[1], label: t('steps.payment') },
    { id: STEP_IDS[2], label: t('steps.confirmation') },
  ];
  const [tries, setTries] = useState(0);
  // The webhook usually lands within a second or two of the redirect — poll
  // the summary a few times before giving up on the spinner (the daily
  // stripe-sync cron self-heals if the webhook was missed).
  useEffect(() => {
    if (activated || tries >= 10) return;
    const timer = setTimeout(() => {
      void reload().finally(() => setTries((n) => n + 1));
    }, 2000);
    return () => clearTimeout(timer);
  }, [activated, tries, reload]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeaderCard
        backHref="/abonnement"
        backLabel={t('confirmation.backLabel')}
        title={t('confirmation.title')}
        meta={t('confirmation.meta', { plan: proLabel })}
      />
      <FormStepsBar steps={steps} activeIndex={2} maxReachedIndex={2} onStepSelect={() => {}} />
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
          {activated ? t('confirmation.activatedTitle') : t('confirmation.confirmedTitle')}
        </h2>
        <p className="max-w-md text-caption text-muted-foreground">
          {activated
            ? t('confirmation.activatedBody', { plan: proLabel })
            : tries < 10
              ? t('confirmation.pollingBody')
              : t('confirmation.timeoutBody')}
        </p>
        <Link href="/abonnement" className="mt-2">
          <Button type="button" size="sm" className="w-fit">
            {t('confirmation.viewSubscription')}
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
  const t = useTranslations('AbonnementPaiement.planOption');
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
                {t('popularBadge')}
              </span>
            )}
            {selected && (
              <span
                className={cn(
                  'rounded-full px-[7px] py-0.5 text-[10px] font-bold',
                  popular ? 'bg-gold-700 text-gold-100' : 'bg-primary text-white',
                )}
              >
                {t('selectedBadge')}
              </span>
            )}
            {current && (
              <span className="rounded-full bg-muted px-[7px] py-0.5 text-[10px] font-bold text-muted-foreground">
                {t('currentBadge')}
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
