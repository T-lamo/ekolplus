'use client';

// Banani « Subscription Plans » → `.current-plan-banner` : white card,
// icon 44px · « Plan actuel » / plan name / billing sub · divider · 4 live
// stats ; right column : status pill · « Expire le … » · « Gérer le plan ».
// Mobile-first : the two columns stack, the stats wrap 2×2.
// « Or = plan payant » : on Pro / Enterprise the banner reads gold (gold
// border + faint wash, gold gradient icon chip with a crown, gold plan name,
// « PRO » pill) ; Starter keeps the neutral look.
import { CheckCircle2, Crown, Sprout } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { formatUsd, type BillingSummary } from '@/lib/billing-plans';
import { planLabel } from '@/lib/billing-plan-i18n';
import { LOCALE_BCP47 } from '@/lib/locales';
import { cn } from '@/lib/utils';
import { fmtDateLong, subscriptionStatusLabel, type SubscriptionStatusT } from './billing-format';

export function CurrentPlanBanner({
  billing,
  action,
}: {
  billing: BillingSummary;
  /** Right-column button (« Gérer le plan » / « Passer à Pro ») — owner-only. */
  action?: ReactNode;
}) {
  const t = useTranslations('Abonnement.currentPlanBanner');
  const tStatus = useTranslations('Abonnement') as unknown as SubscriptionStatusT;
  const tPlan = useTranslations('BillingPlans.label');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const status = subscriptionStatusLabel(billing, tStatus);
  const isFree = billing.plan === 'STARTER';
  // Unpaid Pro → effective Starter (user decision 2026-08-18): the banner
  // shows the plan the school is actually on and says why.
  const proSuspended = isFree && billing.subscribedPlan === 'PRO' && billing.status === 'SUSPENDED';
  const Icon = isFree ? Sprout : Crown;
  const proLabel = planLabel('PRO', tPlan);

  const sub = proSuspended
    ? t('subProSuspended', { plan: proLabel })
    : isFree
      ? t('subFree')
      : billing.plan === 'ENTERPRISE'
        ? t('subEnterprise')
        : billing.billingInterval === 'YEAR'
          ? t('subAnnual', { amount: formatUsd(billing.rates.annualCents, bcp47) })
          : t('subMonthly', { amount: formatUsd(billing.rates.monthlyCents, bcp47) });

  const dateLine = isFree
    ? null
    : billing.cancelAtPeriodEnd
      ? t('dateActiveUntil', { date: fmtDateLong(billing.renewsAt, bcp47) })
      : billing.status === 'TRIAL'
        ? t('dateTrialEnds', { date: fmtDateLong(billing.trialEndsAt ?? billing.renewsAt, bcp47) })
        : t('dateRenewal', { date: fmtDateLong(billing.renewsAt, bcp47) });

  const stats: { value: number; label: string }[] = [
    { value: billing.usage.students, label: t('statStudents') },
    { value: billing.usage.teachers, label: t('statTeachers') },
    { value: billing.usage.classes, label: t('statClasses') },
    { value: billing.usage.admins, label: t('statAdmins') },
  ];

  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-[18px]',
        proSuspended
          ? 'border-destructive-foreground/30 bg-card'
          : isFree
            ? 'border-border bg-card'
            : 'border-gold-300 bg-linear-to-r from-gold-100/70 via-card to-card',
      )}
      data-testid="current-plan-banner"
      data-plan={billing.plan}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
              isFree
                ? 'bg-secondary text-primary'
                : 'bg-linear-to-br from-gold-300 to-gold-500 text-gold-900',
            )}
          >
            <Icon size={22} />
          </span>
          <div className="min-w-0 sm:shrink-0">
            <div className="mb-[3px] text-[10px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">
              {t('label')}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'text-xl leading-[1.1] font-extrabold',
                  isFree ? 'text-primary' : 'text-gold-700',
                )}
              >
                {planLabel(billing.plan, tPlan)}
              </span>
              {!isFree && (
                <Badge tone="gold" className="px-2 py-0.5 text-[10px] tracking-[0.5px] uppercase">
                  {billing.plan === 'ENTERPRISE' ? t('badgeEnterprise') : t('badgePro')}
                </Badge>
              )}
            </div>
            <div className="mt-[3px] text-2xs text-muted-foreground">{sub}</div>
          </div>
        </div>
        <div className="hidden h-11 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
        <dl className="grid grid-cols-2 gap-x-7 gap-y-3 sm:flex">
          {stats.map((s) => (
            <div key={s.label}>
              <dd className="text-[22px] leading-none font-extrabold text-foreground tabular-nums">
                {s.value}
              </dd>
              <dt className="mt-0.5 text-2xs text-muted-foreground">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex shrink-0 flex-row flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1.5">
        <Badge tone={status.tone} className="px-3 py-1 text-xs">
          <CheckCircle2 size={12} />
          {status.label}
        </Badge>
        {dateLine && <div className="text-2xs text-muted-foreground">{dateLine}</div>}
        {action}
      </div>
    </section>
  );
}
