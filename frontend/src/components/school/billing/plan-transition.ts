// Plan transition matrix — what selecting a plan card MEANS for this school
// right now, as one pure function so every combination (current plan ×
// selected plan × subscription state × role) is unit tested without React.
//
// The Abonnement page renders the three cards as a radiogroup; the selected
// card's CTA label / hint / disabled state and the sentence under the grid
// all come from here, so a click on any card always explains exactly what
// would happen next (upgrade with trial, reactivation without trial,
// downgrade at period end, resume, regularise an unpaid card, ask for a
// quote…). No module locking (user decision 2026-08-18): a downgrade only
// re-applies the 50-student cap — data and modules stay reachable.
import {
  PLAN_STUDENT_HARD_LIMIT,
  formatUsd,
  type BillingIntervalKey,
  type BillingSummary,
  type PlanKey,
} from '@/lib/billing-plans';
import { planLabel, type PlanLabelT } from '@/lib/billing-plan-i18n';
import { fmtDateLong } from './billing-format';

export type PlanTransitionT = {
  t(
    key:
      | 'ownerOnly'
      | 'resumeLabel'
      | 'resumeHint'
      | 'currentStarterSuspended'
      | 'currentStarter'
      | 'currentProTrial'
      | 'currentProActive.one'
      | 'currentProActive.other'
      | 'currentProActiveRenewalDate'
      | 'currentProActiveRenewalNone'
      | 'currentEnterprise'
      | 'requestQuoteLabel'
      | 'requestQuoteHint'
      | 'managedByContractLabel'
      | 'managedByContractHint'
      | 'managedByContractDisabled'
      | 'regularizeLabel'
      | 'regularizeHint'
      | 'contactSuspendedLabel'
      | 'contactSuspendedHint'
      | 'unavailableLabel'
      | 'unavailableHint'
      | 'unavailableDisabled'
      | 'reactivateLabel'
      | 'reactivateHint'
      | 'upgradeLabel'
      | 'upgradeHint'
      | 'managedManuallyLabel'
      | 'managedManuallyHint'
      | 'managedManuallyDisabled'
      | 'downgradeScheduledLabel'
      | 'downgradeScheduledHint'
      | 'downgradeLabel'
      | 'downgradeEffective'
      | 'downgradeOver'
      | 'downgradeUnder'
      | 'downgradeSuffix'
      | 'estimatePerMonth'
      | 'estimatePerYear'
      | 'pluralStudent.one'
      | 'pluralStudent.other'
      | 'salesDefaultSchool'
      | 'salesEnterpriseSubject'
      | 'salesSupportSubject'
      | 'salesGreeting'
      | 'salesEnterpriseBody'
      | 'salesSupportBody'
      | 'salesSchool'
      | 'salesCurrentPlan'
      | 'salesCurrentPlanWithSub'
      | 'salesHeadcount'
      | 'salesThanks',
    values?: Record<string, string | number>,
  ): string;
}['t'];

export type PlanTransitionKind =
  /** Selected = current plan, nothing to do (badge « Plan actif »). */
  | 'current'
  /** Pro with a scheduled downgrade → un-schedule it (PATCH cancelAtPeriodEnd:false). */
  | 'resume'
  /** Starter, never billed → Checkout with the 30-day trial. */
  | 'upgrade'
  /** Starter after a canceled / expired Pro → Checkout, no trial. */
  | 'reactivate'
  /** Starter because the Pro row is SUSPENDED (unpaid) → Stripe portal to fix the card. */
  | 'regularize'
  /** Pro → Starter: schedule the downgrade at period end (confirmation dialog). */
  | 'downgrade'
  /** Pro → Starter while a downgrade is already scheduled: the CTA cancels it. */
  | 'downgrade-scheduled'
  /** → Enterprise (or a manual/suspended row): mail the sales/support team. */
  | 'contact'
  /** Enterprise / manual Pro contract: plan changes go through the team. */
  | 'managed'
  /** Stripe not configured on this deployment: nothing can be bought here. */
  | 'unavailable';

export type PlanTransitionTone = 'gold' | 'primary' | 'outline' | 'destructive';

export interface PlanTransition {
  kind: PlanTransitionKind;
  /** CTA label; null when the card shows the « Plan actif » badge instead. */
  label: string | null;
  /** One sentence, shown under the grid for the selected card. */
  hint: string;
  /** When set, the CTA renders disabled and this text is its tooltip. */
  disabledReason: string | null;
  /**
   * True only when `disabledReason` comes from `ownerGated` (an ADMIN
   * viewing a mutating transition) — the CTA stays clickable so the click
   * always surfaces the reason (a toast), instead of a native `disabled`
   * button silently swallowing the click with nothing but a small caption
   * as the only explanation. Transitions that are disabled for every role
   * (Stripe not configured, Enterprise contract…) leave this false and stay
   * genuinely inert.
   */
  disabledByOwnership: boolean;
  tone: PlanTransitionTone;
}

export interface PlanTransitionInput {
  selected: PlanKey;
  billing: BillingSummary;
  /** OWNER → live CTAs; ADMIN reads only (money leaves the school's account). */
  canManage: boolean;
  /** Cycle picked with the Mensuel/Annuel toggle — drives the estimate in the hint. */
  interval: BillingIntervalKey;
}

const STARTER_CAP = PLAN_STUDENT_HARD_LIMIT.STARTER ?? 50;

function pluralStudents(n: number, t: PlanTransitionT): string {
  return t(n > 1 ? 'pluralStudent.other' : 'pluralStudent.one', { count: n });
}

/** « ≈ 25 $ / mois » or « ≈ 270 $ / an » for the school's headcount on the chosen cycle. */
function estimateSentence(
  b: BillingSummary,
  interval: BillingIntervalKey,
  t: PlanTransitionT,
  bcp47: string,
): string {
  const annual = interval === 'YEAR' && b.rates.annualAvailable;
  const n = Math.max(b.studentCount, 1);
  const amount = annual ? b.rates.annualCents * n : b.rates.monthlyCents * n;
  const formatted = formatUsd(amount, bcp47, { decimals: amount % 100 === 0 ? 0 : 2 });
  return t(annual ? 'estimatePerYear' : 'estimatePerMonth', {
    amount: formatted,
    students: pluralStudents(n, t),
  });
}

/** Applies the OWNER-only rule to a transition that would mutate the subscription. */
function ownerGated(
  transition: PlanTransition,
  canManage: boolean,
  t: PlanTransitionT,
): PlanTransition {
  if (canManage) return transition;
  return { ...transition, disabledReason: t('ownerOnly'), disabledByOwnership: true };
}

export function planTransition(
  { selected, billing: b, canManage, interval }: PlanTransitionInput,
  t: PlanTransitionT,
  tPlan: PlanLabelT,
  bcp47: string,
): PlanTransition {
  const current = b.plan;
  const proSuspended = b.subscribedPlan === 'PRO' && b.status === 'SUSPENDED';
  const proName = planLabel('PRO', tPlan);

  // ── Same plan ─────────────────────────────────────────────────────────
  if (selected === current) {
    if (current === 'PRO' && b.cancelAtPeriodEnd) {
      return ownerGated(
        {
          kind: 'resume',
          label: t('resumeLabel', { plan: proName }),
          hint: t('resumeHint', { date: fmtDateLong(b.renewsAt, bcp47), plan: proName }),
          disabledReason: null,
          disabledByOwnership: false,
          tone: 'gold',
        },
        canManage,
        t,
      );
    }
    let hint: string;
    if (current === 'STARTER') {
      hint = proSuspended
        ? t('currentStarterSuspended', { plan: proName })
        : t('currentStarter', { cap: STARTER_CAP });
    } else if (current === 'PRO') {
      const seats = b.billedSeats ?? b.studentCount;
      hint =
        b.status === 'TRIAL'
          ? t('currentProTrial', {
              plan: proName,
              date: fmtDateLong(b.trialEndsAt ?? b.renewsAt, bcp47),
              estimate: estimateSentence(b, b.billingInterval ?? interval, t, bcp47),
            })
          : t(seats > 1 ? 'currentProActive.other' : 'currentProActive.one', {
              plan: proName,
              count: seats,
              renewal: b.renewsAt
                ? t('currentProActiveRenewalDate', { date: fmtDateLong(b.renewsAt, bcp47) })
                : t('currentProActiveRenewalNone'),
            });
    } else {
      hint = t('currentEnterprise');
    }
    return {
      kind: 'current',
      label: null,
      hint,
      disabledReason: null,
      disabledByOwnership: false,
      tone: 'outline',
    };
  }

  // ── Enterprise selected: always a quote ───────────────────────────────
  if (selected === 'ENTERPRISE') {
    return {
      kind: 'contact',
      label: t('requestQuoteLabel'),
      hint: t('requestQuoteHint', { students: pluralStudents(b.studentCount, t) }),
      disabledReason: null,
      disabledByOwnership: false,
      tone: 'outline',
    };
  }

  // ── Anything from an Enterprise contract goes through the team ────────
  if (current === 'ENTERPRISE') {
    return {
      kind: 'managed',
      label: t('managedByContractLabel'),
      hint: t('managedByContractHint'),
      disabledReason: t('managedByContractDisabled'),
      disabledByOwnership: false,
      tone: 'outline',
    };
  }

  // ── Pro selected from Starter ─────────────────────────────────────────
  if (selected === 'PRO') {
    if (proSuspended) {
      if (b.managedByStripe) {
        return ownerGated(
          {
            kind: 'regularize',
            label: t('regularizeLabel'),
            hint: t('regularizeHint', {
              plan: proName,
              students: pluralStudents(b.studentCount, t),
            }),
            disabledReason: null,
            disabledByOwnership: false,
            tone: 'gold',
          },
          canManage,
          t,
        );
      }
      return {
        kind: 'contact',
        label: t('contactSuspendedLabel'),
        hint: t('contactSuspendedHint', { plan: proName }),
        disabledReason: null,
        disabledByOwnership: false,
        tone: 'outline',
      };
    }
    if (!b.stripeConfigured) {
      return {
        kind: 'unavailable',
        label: t('unavailableLabel', { plan: proName }),
        hint: t('unavailableHint', { plan: proName }),
        disabledReason: t('unavailableDisabled'),
        disabledByOwnership: false,
        tone: 'gold',
      };
    }
    if (b.managedByStripe) {
      // A canceled / expired Stripe row: the trial was already used.
      return ownerGated(
        {
          kind: 'reactivate',
          label: t('reactivateLabel', { plan: proName }),
          hint: t('reactivateHint', { estimate: estimateSentence(b, interval, t, bcp47) }),
          disabledReason: null,
          disabledByOwnership: false,
          tone: 'gold',
        },
        canManage,
        t,
      );
    }
    return ownerGated(
      {
        kind: 'upgrade',
        label: t('upgradeLabel', { days: b.rates.trialDays }),
        hint: t('upgradeHint', {
          days: b.rates.trialDays,
          estimate: estimateSentence(b, interval, t, bcp47),
        }),
        disabledReason: null,
        disabledByOwnership: false,
        tone: 'gold',
      },
      canManage,
      t,
    );
  }

  // ── Starter selected from Pro: downgrade ──────────────────────────────
  if (!b.managedByStripe) {
    return {
      kind: 'managed',
      label: t('managedManuallyLabel'),
      hint: t('managedManuallyHint', { plan: proName }),
      disabledReason: t('managedManuallyDisabled'),
      disabledByOwnership: false,
      tone: 'outline',
    };
  }
  if (b.cancelAtPeriodEnd) {
    return ownerGated(
      {
        kind: 'downgrade-scheduled',
        label: t('downgradeScheduledLabel'),
        hint: t('downgradeScheduledHint', { date: fmtDateLong(b.renewsAt, bcp47), plan: proName }),
        disabledReason: null,
        disabledByOwnership: false,
        tone: 'primary',
      },
      canManage,
      t,
    );
  }
  const over = b.studentCount > STARTER_CAP;
  const capSentence = over
    ? t('downgradeOver', { students: pluralStudents(b.studentCount, t), cap: STARTER_CAP })
    : t('downgradeUnder', { cap: STARTER_CAP, count: b.studentCount });
  return ownerGated(
    {
      kind: 'downgrade',
      label: t('downgradeLabel'),
      hint: `${t('downgradeEffective', { date: fmtDateLong(b.renewsAt, bcp47) })} ${capSentence} ${t('downgradeSuffix')}`,
      disabledReason: null,
      disabledByOwnership: false,
      tone: 'destructive',
    },
    canManage,
    t,
  );
}

/** Default sales address; override per deployment with NEXT_PUBLIC_SALES_EMAIL. */
export const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL || 'contact@schoolgesti.com';

/**
 * `mailto:` for the Enterprise quote / support contact — subject + body are
 * pre-filled with what the team needs to answer (plan, headcount, school).
 */
export function salesMailto(
  input: {
    billing: BillingSummary;
    schoolName?: string | null;
    topic: 'enterprise' | 'support';
  },
  t: PlanTransitionT,
  tPlan: PlanLabelT,
): string {
  const { billing: b, schoolName, topic } = input;
  const subject =
    topic === 'enterprise'
      ? t('salesEnterpriseSubject', { school: schoolName ?? t('salesDefaultSchool') })
      : t('salesSupportSubject', {
          school: schoolName ?? t('salesDefaultSchool'),
          plan: planLabel(b.subscribedPlan ?? b.plan, tPlan),
        });
  const lines = [
    t('salesGreeting'),
    '',
    topic === 'enterprise' ? t('salesEnterpriseBody') : t('salesSupportBody'),
    '',
    t('salesSchool', { school: schoolName ?? '—' }),
    b.subscribedPlan && b.subscribedPlan !== b.plan
      ? t('salesCurrentPlanWithSub', {
          plan: planLabel(b.plan, tPlan),
          subPlan: planLabel(b.subscribedPlan, tPlan),
          status: b.status?.toLowerCase() ?? '',
        })
      : t('salesCurrentPlan', { plan: planLabel(b.plan, tPlan) }),
    t('salesHeadcount', { students: pluralStudents(b.studentCount, t) }),
    '',
    t('salesThanks'),
  ];
  return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
