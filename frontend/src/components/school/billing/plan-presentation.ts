// What the sidebar plan card says for a given plan snapshot — pure function
// so every edge case (cap reached, canceled Pro, past_due, trial…) is unit
// tested without rendering. « Or = plan payant » : an upsell (Starter) is a
// gold gradient card, a paid plan is a pale-gold status strip.
import { PLAN_STUDENT_SOFT_LIMIT, TRIAL_DAYS, type PlanSnapshot } from '@/lib/billing-plans';
import { planLabel, type PlanLabelT } from '@/lib/billing-plan-i18n';
import { fmtDateShort } from './billing-format';

export const PLAN_PAGE_HREF = '/abonnement';
/** Upsell CTAs deep-link to the page with the Pro card pre-selected (scrolls to the grid). */
export const PLAN_PAGE_PRO_HREF = '/abonnement?plan=PRO';

export interface PlanPresentation {
  /** `upsell` = Starter (nudge to Pro) · `paid` = Pro / Enterprise status. */
  kind: 'upsell' | 'paid';
  title: string;
  subtitle: string;
  /** `alert` = needs attention (cap reached, payment failed, suspended). */
  tone: 'gold' | 'alert';
  /** Short label for the collapsed-sidebar tooltip. */
  shortLabel: string;
  /** Upsell button label — null on the paid strip (the whole strip is the link). */
  cta: string | null;
  href: string;
}

const NEAR_CAP_RATIO = 0.8;

// The bivariance-hack shape (extracting a call signature declared with
// method syntax) — not `(key: string, values?: ...) => string` directly —
// so a next-intl `Translator<...>` (whose `key` param is narrowed to
// `NamespacedMessageKeys<...>` via this app's `next-intl.d.ts` AppConfig
// augmentation) remains assignable here under `strictFunctionTypes`. A
// plain arrow-function type alias is checked contravariantly and rejects
// that narrower parameter; this shape restores the same bivariant checking
// TypeScript already gives interface methods (e.g. how `@types/react`
// types DOM event handlers) without changing the call syntax below.
export type PlanCardT = {
  t(key: string, values?: Record<string, string | number>): string;
}['t'];

/**
 * Returns null when there is nothing to show: no snapshot (no school /
 * loading / error) or a Starter school on a deployment without Stripe
 * (nothing to sell — the app stays exactly as before). `t` must be scoped
 * to the `SchoolPlanCard` namespace (`useTranslations('SchoolPlanCard')`
 * in the component; `createTranslator(...)` in tests). `tPlan` must be
 * scoped to the `BillingPlans.label` namespace and `bcp47` is the app
 * locale's `Intl` tag (`useLocale()` + `LOCALE_BCP47`) — both drive the
 * plan name and renewal/trial dates so they stop leaking French into the
 * other two locales.
 */
export function planPresentation(
  s: PlanSnapshot | null,
  t: PlanCardT,
  tPlan: PlanLabelT,
  bcp47: string,
): PlanPresentation | null {
  if (!s) return null;

  if (s.plan === 'STARTER') {
    if (!s.stripeConfigured) return null;
    const limit = s.studentHardLimit;
    const overCap = limit !== null && s.studentCount >= limit;
    const previouslyPaid = s.subscribedPlan !== null && s.subscribedPlan !== 'STARTER';
    const plan = planLabel('PRO', tPlan);

    if (previouslyPaid && s.status === 'SUSPENDED') {
      // Unpaid Pro (Stripe dunning exhausted) → the school is back on Starter
      // rules until the card is fixed; a back-office suspension has no card
      // to fix, so it points at support instead.
      const byStripe = s.managedByStripe;
      return {
        kind: 'upsell',
        title: t('suspendedTitle', { plan }),
        subtitle: byStripe ? t('paymentFailedRegularize') : t('suspendedContactUs'),
        tone: 'alert',
        shortLabel: t('regularizeShortLabel', { plan }),
        cta: byStripe ? t('regularizeCta') : t('contactUsCta'),
        href: PLAN_PAGE_PRO_HREF,
      };
    }

    if (previouslyPaid) {
      // A canceled / expired Pro row: the cap applies again — say so when it bites.
      return {
        kind: 'upsell',
        title: t('reactivateTitle', { plan }),
        subtitle:
          overCap && limit !== null
            ? t('overCapBlocked', { count: s.studentCount, limit })
            : t('dataKept'),
        tone: overCap ? 'alert' : 'gold',
        shortLabel: t('reactivateShortLabel', { plan }),
        cta: t('reactivateCta'),
        href: PLAN_PAGE_PRO_HREF,
      };
    }

    let subtitle: string;
    let tone: PlanPresentation['tone'] = 'gold';
    if (limit !== null && overCap) {
      subtitle = t('capReached', { count: s.studentCount, limit });
      tone = 'alert';
    } else if (limit !== null && s.studentCount >= Math.ceil(limit * NEAR_CAP_RATIO)) {
      const left = limit - s.studentCount;
      subtitle = t(left > 1 ? 'nearCap.other' : 'nearCap.one', {
        count: s.studentCount,
        limit,
        left,
      });
    } else {
      subtitle = t('genericPitch', {
        limit: PLAN_STUDENT_SOFT_LIMIT.PRO ?? 1000,
        trialDays: TRIAL_DAYS,
      });
    }
    return {
      kind: 'upsell',
      title: t('upsellTitle', { plan }),
      subtitle,
      tone,
      shortLabel: t('upsellShortLabel', { plan }),
      cta: t('discoverCta'),
      href: PLAN_PAGE_PRO_HREF,
    };
  }

  // Paid plan (PRO / ENTERPRISE).
  const label = planLabel(s.plan, tPlan);
  let subtitle: string;
  let tone: PlanPresentation['tone'] = 'gold';
  // Sidebar strip is ~150 px wide at 11 px: keep every line ≤ 25 chars —
  // the Abonnement page carries the full sentence.
  if (s.stripeStatus === 'past_due' || s.stripeStatus === 'unpaid') {
    subtitle = t('paymentFailed');
    tone = 'alert';
  } else if (s.status === 'SUSPENDED') {
    subtitle = t('suspendedContactUs');
    tone = 'alert';
  } else if (s.plan === 'ENTERPRISE' && !s.managedByStripe) {
    subtitle = t('enterpriseContract');
  } else if (s.cancelAtPeriodEnd) {
    subtitle = t('activeUntil', { date: fmtDateShort(s.renewsAt, bcp47) });
  } else if (s.status === 'TRIAL' || s.stripeStatus === 'trialing') {
    subtitle = t('trialUntil', { date: fmtDateShort(s.trialEndsAt ?? s.renewsAt, bcp47) });
  } else if (s.renewsAt) {
    subtitle = t('renewalDate', { date: fmtDateShort(s.renewsAt, bcp47) });
  } else {
    subtitle = t('active');
  }
  const shortState =
    tone === 'alert'
      ? t('toRegularize')
      : s.status === 'TRIAL' || s.stripeStatus === 'trialing'
        ? t('trialState')
        : t('active');
  return {
    kind: 'paid',
    title: label,
    subtitle,
    tone,
    shortLabel: t('paidShortLabel', { plan: label, state: shortState }),
    cta: null,
    href: PLAN_PAGE_HREF,
  };
}
