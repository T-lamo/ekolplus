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
import { useId, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import {
  ANNUAL_DISCOUNT,
  PLAN_FEATURES,
  PLAN_KEYS,
  PLAN_LABELS,
  formatUsd,
  type BillingIntervalKey,
  type BillingSummary,
  type PlanKey,
} from '@/lib/billing-plans';
import { cn } from '@/lib/utils';
import { BillingCycleToggle } from './BillingCycleToggle';
import { planTransition, salesMailto, type PlanTransition } from './plan-transition';
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
  schoolName?: string | null | undefined;
  busy: PlanBusy;
}) {
  const groupId = useId();
  const annualAvailable = billing.rates.annualAvailable;
  const current = billing.plan;
  const perStudent =
    interval === 'YEAR' && annualAvailable
      ? `${formatUsd(Math.round(billing.rates.annualCents / 12))}`
      : formatUsd(billing.rates.monthlyCents);
  const monthlyEstimate =
    interval === 'YEAR' && annualAvailable
      ? Math.round(billing.estimate.annualCents / 12)
      : billing.estimate.monthlyCents;
  const yearlyEstimate =
    interval === 'YEAR' && annualAvailable
      ? billing.estimate.annualCents
      : billing.estimate.monthlyCents * 12;

  const transitions = Object.fromEntries(
    PLAN_KEYS.map((k) => [k, planTransition({ selected: k, billing, canManage, interval })]),
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
  });

  return (
    <section id="plans" className="flex scroll-mt-4 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[15px] font-extrabold text-foreground">Choisir un plan</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Sélectionnez un plan pour voir exactement ce qui changerait — rien n’est modifié sans
            votre confirmation.
          </div>
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
        aria-label="Choisir un plan"
        className="grid grid-cols-1 gap-4 pt-3 md:grid-cols-3"
      >
        {/* Starter */}
        <PlanCard
          {...cardProps('STARTER')}
          icon={<Sprout size={20} />}
          iconClass="bg-muted text-muted-foreground"
          tagline="Découverte & petites écoles"
          price={<PriceRow amount="0" currency="$" period="/ mois" note="Gratuit pour toujours" />}
          cta={<PlanCta {...ctaProps('STARTER')} />}
        />

        {/* Pro — popular, the gold card */}
        <PlanCard
          {...cardProps('PRO')}
          popular
          badge="⭐ Le plus populaire"
          icon={<Crown size={20} />}
          iconClass="bg-linear-to-br from-gold-300 to-gold-500 text-gold-900"
          nameClass="text-gold-700"
          tagline="Établissements jusqu’à 1000 élèves"
          price={
            <PriceRow
              amount={perStudent.replace(/\s\$$/, '')}
              currency="$"
              period="/ élève / mois"
              accent
              note={
                billing.studentCount > 0
                  ? `≈ ${formatUsd(monthlyEstimate, { decimals: 0 })} / mois pour ${billing.studentCount} élève${billing.studentCount > 1 ? 's' : ''} · ${formatUsd(yearlyEstimate, { decimals: 0 })} / an${interval === 'YEAR' && annualAvailable ? ` (−${Math.round(ANNUAL_DISCOUNT * 100)} %)` : ''}`
                  : `Essai gratuit ${billing.rates.trialDays} jours, sans engagement`
              }
            />
          }
          cta={<PlanCta {...ctaProps('PRO')} gold />}
          footer={
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded bg-[#635bff] px-[7px] py-0.5 text-[10px] font-extrabold tracking-[0.3px] text-white">
                <CreditCard size={9} />
                Paiement via Stripe
              </span>
            </div>
          }
        />

        {/* Enterprise */}
        <PlanCard
          {...cardProps('ENTERPRISE')}
          badge="🏆 Le plus complet"
          icon={<Building2 size={20} />}
          iconClass="bg-muted text-muted-foreground"
          tagline="Réseaux & grands établissements"
          price={
            <div>
              <div className="text-xl leading-[1.2] font-extrabold text-foreground">
                Prix sur devis
              </div>
              <div className="mt-1 text-2xs text-muted-foreground">
                Sur mesure · tarif dégressif selon le volume
              </div>
            </div>
          }
          cta={
            <PlanCta
              {...ctaProps('ENTERPRISE')}
              href={
                transitions.ENTERPRISE.kind === 'contact'
                  ? salesMailto({ billing, schoolName: schoolName ?? null, topic: 'enterprise' })
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
  gold = false,
  href,
}: {
  transition: PlanTransition;
  busy: boolean;
  disabledByBusy: boolean;
  onAction: () => void;
  gold?: boolean;
  href?: string | undefined;
}) {
  if (t.kind === 'current') return <CurrentCta gold={gold} />;
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

  const disabled = t.disabledReason !== null || disabledByBusy;
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
        )}
        onClick={(e) => {
          e.stopPropagation();
          onAction();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        disabled={disabled}
        loading={busy}
        aria-disabled={disabled}
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

function CurrentCta({ gold = false }: { gold?: boolean }) {
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
      Plan actif
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
      aria-label={`${PLAN_LABELS[plan]}${isCurrent ? ' (plan actuel)' : ''}`}
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
              {PLAN_LABELS[plan]}
            </span>
            {isCurrent && (
              <span
                className={cn(
                  'rounded-full px-[7px] py-0.5 text-[10px] font-bold',
                  popular ? 'bg-gold-100 text-gold-700' : 'bg-secondary text-secondary-foreground',
                )}
              >
                Plan actuel
              </span>
            )}
          </div>
          <div className="mt-0.5 text-2xs text-muted-foreground">{tagline}</div>
        </div>
      </div>
      {price}
      <div className="h-px bg-border" />
      <ul className="flex flex-col gap-2">
        {PLAN_FEATURES[plan].map((f) => (
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
