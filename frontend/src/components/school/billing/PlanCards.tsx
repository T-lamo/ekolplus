'use client';

// Banani « Choisir un plan » : section header (title/sub + cycle toggle) and
// three `.plan-card`s — icon chip · name/tagline · price row · divider ·
// feature list · CTA (· Stripe badge under Pro).
//
// The three cards form a `radiogroup` (2026-08-18 production pass): a click
// anywhere on a card — or ←/→ · Espace/Entrée on the keyboard — selects it,
// the ring shows which one is selected, and every card's CTA says exactly
// what choosing it would DO for this school right now (upgrade with trial,
// reactivate without trial, downgrade at period end, resume, regularise an
// unpaid card, ask for a quote…) — see the pure `planTransition()`. The
// current plan wears a « Plan actuel » chip. « Or = plan payant » (user
// decision, an explicit exception to the app-wide « pas de couleurs par
// carte » rule): Pro is the ONE gold card — gold identity always, gold ring
// + halo when selected; Starter / Enterprise select with the primary ring.
import { Building2, Check, CheckCircle2, CreditCard, Crown, Send, Sprout, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import {
  ANNUAL_DISCOUNT,
  PLAN_KEYS,
  formatUsd,
  type BillingIntervalKey,
  type BillingSummary,
  type PlanKey,
} from '@/lib/billing-plans';
import { planFeatures, planLabel, type PlanFeatureT } from '@/lib/billing-plan-i18n';
import { LOCALE_BCP47 } from '@/lib/locales';
import { cn } from '@/lib/utils';
import { BillingCycleToggle } from './BillingCycleToggle';
import {
  planTransition,
  salesMailto,
  type PlanTransition,
  type PlanTransitionT,
} from './plan-transition';
import { PlanTransitionHint } from './PlanTransitionHint';

export type PlanBusy = null | 'checkout' | 'portal' | 'patch';

/** Which in-flight action each transition kind maps to (for the CTA spinner). */
const BUSY_FOR: Partial<Record<PlanTransition['kind'], Exclude<PlanBusy, null>>> = {
  upgrade: 'checkout',
  reactivate: 'checkout',
  regularize: 'portal',
  resume: 'patch',
  'downgrade-scheduled': 'patch',
  downgrade: 'patch',
};

export function PlanCards({
  billing,
  interval,
  onIntervalChange,
  canManage,
  selected,
  onSelect,
  onAction,
  onOwnerDenied,
  schoolName,
  busy,
}: {
  billing: BillingSummary;
  interval: BillingIntervalKey;
  onIntervalChange: (v: BillingIntervalKey) => void;
  /** OWNER → CTAs are live ; ADMIN sees the cards read-only (owner-only tooltip). */
  canManage: boolean;
  /** Controlled selection (defaults to the current plan; `?plan=PRO` deep link). */
  selected: PlanKey;
  onSelect: (plan: PlanKey) => void;
  /** The selected card's CTA was pressed — the screen dispatches by `kind`. */
  onAction: (transition: PlanTransition, plan: PlanKey) => void;
  /** A non-owner pressed a CTA that's gated to the school owner — the screen
   * surfaces `reason` (e.g. a toast) instead of performing the action. */
  onOwnerDenied: (reason: string) => void;
  schoolName?: string | null | undefined;
  busy: PlanBusy;
}) {
  const t = useTranslations('Abonnement.planCards');
  const tTransition = useTranslations('Abonnement.planTransition') as unknown as PlanTransitionT;
  const tPlan = useTranslations('BillingPlans.label');
  const tFeatures = useTranslations('BillingPlans.features') as unknown as PlanFeatureT;
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const groupId = useId();
  const annualAvailable = billing.rates.annualAvailable;
  const current = billing.plan;
  const perStudent =
    interval === 'YEAR' && annualAvailable
      ? `${formatUsd(Math.round(billing.rates.annualCents / 12), bcp47)}`
      : formatUsd(billing.rates.monthlyCents, bcp47);
  const monthlyEstimate =
    interval === 'YEAR' && annualAvailable
      ? Math.round(billing.estimate.annualCents / 12)
      : billing.estimate.monthlyCents;
  const yearlyEstimate =
    interval === 'YEAR' && annualAvailable
      ? billing.estimate.annualCents
      : billing.estimate.monthlyCents * 12;

  const transitions = Object.fromEntries(
    PLAN_KEYS.map((k) => [
      k,
      planTransition({ selected: k, billing, canManage, interval }, tTransition, tPlan, bcp47),
    ]),
  ) as Record<PlanKey, PlanTransition>;

  // Roving tabindex + arrow keys, as a native radiogroup behaves.
  function onKeyDown(e: KeyboardEvent<HTMLElement>, plan: PlanKey) {
    const idx = PLAN_KEYS.indexOf(plan);
    let next: PlanKey | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
      next = PLAN_KEYS[(idx + 1) % PLAN_KEYS.length] ?? null;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = PLAN_KEYS[(idx - 1 + PLAN_KEYS.length) % PLAN_KEYS.length] ?? null;
    else if (e.key === ' ' || e.key === 'Enter') next = plan;
    if (!next) return;
    e.preventDefault();
    onSelect(next);
    const el = document.getElementById(`${groupId}-${next}`);
    el?.focus();
  }

  const cardProps = (plan: PlanKey) => ({
    id: `${groupId}-${plan}`,
    plan,
    selected: selected === plan,
    isCurrent: current === plan,
    onSelect: () => onSelect(plan),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, plan),
  });

  const ctaProps = (plan: PlanKey) => ({
    transition: transitions[plan],
    busy: busy !== null && BUSY_FOR[transitions[plan].kind] === busy,
    disabledByBusy: busy !== null,
    onAction: () => onAction(transitions[plan], plan),
    onOwnerDenied: () => onOwnerDenied(transitions[plan].disabledReason ?? ''),
  });

  return (
    <section id="plans" className="flex scroll-mt-4 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[15px] font-extrabold text-foreground">{t('heading')}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{t('subheading')}</div>
        </div>
        {annualAvailable && (
          <BillingCycleToggle
            value={interval}
            onChange={onIntervalChange}
            disabled={busy !== null}
          />
        )}
      </div>

      <div
        role="radiogroup"
        aria-label={t('ariaLabel')}
        className="grid grid-cols-1 gap-4 pt-3 md:grid-cols-3"
      >
        {/* Starter */}
        <PlanCard
          {...cardProps('STARTER')}
          planLabel={planLabel('STARTER', tPlan)}
          features={planFeatures('STARTER', tFeatures)}
          currentPlanBadge={t('currentPlanBadge')}
          icon={<Sprout size={20} />}
          iconClass="bg-muted text-muted-foreground"
          tagline={t('starterTagline')}
          price={
            <PriceRow amount="0" currency="$" period={t('perMonth')} note={t('starterFree')} />
          }
          cta={<PlanCta {...ctaProps('STARTER')} activeLabel={t('activePlanBadge')} />}
        />

        {/* Pro — popular, the gold card */}
        <PlanCard
          {...cardProps('PRO')}
          planLabel={planLabel('PRO', tPlan)}
          features={planFeatures('PRO', tFeatures)}
          currentPlanBadge={t('currentPlanBadge')}
          popular
          badge={t('proBadge')}
          icon={<Crown size={20} />}
          iconClass="bg-linear-to-br from-gold-300 to-gold-500 text-gold-900"
          nameClass="text-gold-700"
          tagline={t('proTagline')}
          price={
            <PriceRow
              amount={perStudent.replace(/\s\$$/, '')}
              currency="$"
              period={t('perStudentMonth')}
              accent
              note={
                billing.studentCount > 0
                  ? t(billing.studentCount > 1 ? 'proEstimate.other' : 'proEstimate.one', {
                      monthly: formatUsd(monthlyEstimate, bcp47, { decimals: 0 }),
                      count: billing.studentCount,
                      yearly: formatUsd(yearlyEstimate, bcp47, { decimals: 0 }),
                      discount:
                        interval === 'YEAR' && annualAvailable
                          ? t('proEstimateDiscount', { pct: Math.round(ANNUAL_DISCOUNT * 100) })
                          : '',
                    })
                  : t('proTrialNote', { days: billing.rates.trialDays })
              }
            />
          }
          cta={<PlanCta {...ctaProps('PRO')} gold activeLabel={t('activePlanBadge')} />}
          footer={
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded bg-[#635bff] px-[7px] py-0.5 text-[10px] font-extrabold tracking-[0.3px] text-white">
                <CreditCard size={9} />
                {t('proStripeBadge')}
              </span>
            </div>
          }
        />

        {/* Enterprise */}
        <PlanCard
          {...cardProps('ENTERPRISE')}
          planLabel={planLabel('ENTERPRISE', tPlan)}
          features={planFeatures('ENTERPRISE', tFeatures)}
          currentPlanBadge={t('currentPlanBadge')}
          badge={t('enterpriseBadge')}
          icon={<Building2 size={20} />}
          iconClass="bg-muted text-muted-foreground"
          tagline={t('enterpriseTagline')}
          price={
            <div>
              <div className="text-xl leading-[1.2] font-extrabold text-foreground">
                {t('enterpriseCustomPrice')}
              </div>
              <div className="mt-1 text-2xs text-muted-foreground">
                {t('enterpriseCustomPriceNote')}
              </div>
            </div>
          }
          cta={
            <PlanCta
              {...ctaProps('ENTERPRISE')}
              activeLabel={t('activePlanBadge')}
              href={
                transitions.ENTERPRISE.kind === 'contact'
                  ? salesMailto(
                      { billing, schoolName: schoolName ?? null, topic: 'enterprise' },
                      tTransition,
                      tPlan,
                    )
                  : undefined
              }
            />
          }
        />
      </div>

      <PlanTransitionHint plan={selected} transition={transitions[selected]} />
    </section>
  );
}

/**
 * The card's action, driven by the transition matrix: a real `<button>` (or
 * a `mailto:` link for the quote), never the whole card — the card itself is
 * the radio. « Plan actif » badge when there is nothing to do.
 */
function PlanCta({
  transition: t,
  busy,
  disabledByBusy,
  onAction,
  onOwnerDenied,
  gold = false,
  href,
  activeLabel,
}: {
  transition: PlanTransition;
  busy: boolean;
  disabledByBusy: boolean;
  onAction: () => void;
  onOwnerDenied: () => void;
  gold?: boolean;
  href?: string | undefined;
  activeLabel: string;
}) {
  if (t.kind === 'current') return <CurrentCta gold={gold} activeLabel={activeLabel} />;
  const stop = { onClick: (e: MouseEvent) => e.stopPropagation() };

  if (t.kind === 'contact' && href) {
    return (
      <a
        href={href}
        {...stop}
        className="mt-auto flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-caption font-semibold text-foreground hover:bg-muted"
      >
        <Send size={13} />
        {t.label}
      </a>
    );
  }

  // A CTA disabled only because the caller isn't the owner stays a REAL
  // clickable button — the click always explains why (a toast), instead of
  // a native `disabled` button silently doing nothing with only a small
  // caption underneath as the sole explanation. Anything else that's
  // disabled (Stripe not configured, Enterprise contract…) stays inert for
  // everyone, owner included.
  const ownerBlocked = t.disabledByOwnership && !disabledByBusy;
  const disabled = (t.disabledReason !== null && !t.disabledByOwnership) || disabledByBusy;
  const variant =
    t.tone === 'gold' ? 'gold' : t.tone === 'primary' ? 'primary' : ('outline' as const);
  return (
    <span className="mt-auto flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        className={cn(
          t.tone === 'destructive' &&
            'border-destructive-foreground/30 text-destructive-foreground hover:bg-destructive',
          ownerBlocked && 'cursor-not-allowed opacity-50',
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (ownerBlocked) onOwnerDenied();
          else onAction();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        disabled={disabled}
        loading={busy}
        aria-disabled={disabled || ownerBlocked}
        {...(t.disabledReason ? { title: t.disabledReason } : {})}
      >
        {t.kind === 'contact' && <Send size={13} />}
        {t.label}
      </Button>
      {t.disabledReason && (
        <span className="text-center text-[10px] leading-tight text-muted-foreground">
          {t.disabledReason}
        </span>
      )}
    </span>
  );
}

function CurrentCta({ gold = false, activeLabel }: { gold?: boolean; activeLabel: string }) {
  return (
    <span
      className={cn(
        'mt-auto flex h-10 cursor-default items-center justify-center gap-1.5 rounded-md border px-3.5 text-caption font-semibold',
        gold
          ? 'border-gold-300 bg-gold-100 text-gold-700'
          : 'border-secondary bg-secondary text-secondary-foreground',
      )}
    >
      <CheckCircle2 size={13} />
      {activeLabel}
    </span>
  );
}

function PriceRow({
  amount,
  currency,
  period,
  note,
  accent,
}: {
  amount: string;
  currency: string;
  period: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-[3px]">
        <span
          className={cn(
            'text-[32px] leading-none font-extrabold tabular-nums',
            accent ? 'text-gold-700' : 'text-foreground',
          )}
        >
          {amount}
        </span>
        <span
          className={cn(
            'text-[15px] font-bold',
            accent ? 'text-gold-700' : 'text-muted-foreground',
          )}
        >
          {currency}
        </span>
        <span className="text-xs text-muted-foreground">{period}</span>
      </div>
      <div className="mt-1 text-2xs text-muted-foreground">{note}</div>
    </div>
  );
}

function PlanCard({
  id,
  plan,
  planLabel: planName,
  features,
  currentPlanBadge,
  selected,
  isCurrent,
  onSelect,
  onKeyDown,
  popular,
  badge,
  icon,
  iconClass,
  nameClass,
  tagline,
  price,
  cta,
  footer,
}: {
  id: string;
  plan: PlanKey;
  planLabel: string;
  features: { label: string; included: boolean }[];
  currentPlanBadge: string;
  selected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  popular?: boolean;
  badge?: string;
  icon: ReactNode;
  iconClass: string;
  nameClass?: string;
  tagline: string;
  price: ReactNode;
  cta: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article
      id={id}
      role="radio"
      aria-checked={selected}
      aria-label={`${planName}${isCurrent ? ` (${currentPlanBadge})` : ''}`}
      tabIndex={selected ? 0 : -1}
      data-plan={plan}
      data-selected={selected ? 'true' : 'false'}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'relative flex cursor-pointer flex-col gap-3.5 rounded-lg border bg-card px-5 pt-[22px] pb-[18px] transition-[box-shadow,border-color] outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
        popular
          ? selected
            ? 'border-gold-400 shadow-[0_0_0_2px_var(--color-gold-300)]'
            : 'border-gold-300 hover:border-gold-400'
          : selected
            ? 'border-primary shadow-[0_0_0_2px_var(--color-primary)]'
            : 'border-border hover:border-primary/50',
      )}
    >
      {badge && (
        <span
          className={cn(
            'absolute -top-[11px] left-1/2 -translate-x-1/2 rounded-full px-3.5 py-[3px] text-[10px] font-bold tracking-[0.4px] whitespace-nowrap',
            popular
              ? 'bg-linear-to-br from-gold-300 to-gold-500 text-gold-900'
              : 'bg-muted text-foreground',
          )}
        >
          {badge}
        </span>
      )}
      {/* Radio indicator — the visible « selected » affordance */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full border-2',
          selected
            ? popular
              ? 'border-gold-500 bg-gold-500'
              : 'border-primary bg-primary'
            : 'border-border bg-card',
        )}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <div className="flex items-center gap-2.5 pr-5">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
            iconClass,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className={cn('text-base font-extrabold text-foreground', nameClass)}>
              {planName}
            </span>
            {isCurrent && (
              <span
                className={cn(
                  'rounded-full px-[7px] py-0.5 text-[10px] font-bold',
                  popular ? 'bg-gold-100 text-gold-700' : 'bg-secondary text-secondary-foreground',
                )}
              >
                {currentPlanBadge}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-2xs text-muted-foreground">{tagline}</div>
        </div>
      </div>
      {price}
      <div className="h-px bg-border" />
      <ul className="flex flex-col gap-2">
        {features.map((f) => (
          <li
            key={f.label}
            className={cn(
              'flex items-start gap-2 text-xs leading-[1.4]',
              f.included ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {f.included ? (
              <Check
                size={12}
                className={cn(
                  'mt-px shrink-0',
                  popular ? 'text-gold-700' : 'text-success-foreground',
                )}
              />
            ) : (
              <X size={12} className="mt-px shrink-0 text-muted-foreground" />
            )}
            {f.label}
          </li>
        ))}
      </ul>
      {cta}
      {footer}
    </article>
  );
}
