// What the sidebar plan card says for a given plan snapshot — pure function
// so every edge case (cap reached, canceled Pro, past_due, trial…) is unit
// tested without rendering. « Or = plan payant » : an upsell (Starter) is a
// gold gradient card, a paid plan is a pale-gold status strip.
import {
  PLAN_LABELS,
  PLAN_STUDENT_SOFT_LIMIT,
  TRIAL_DAYS,
  type PlanSnapshot,
} from '@/lib/billing-plans';
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

/**
 * Returns null when there is nothing to show: no snapshot (no school /
 * loading / error) or a Starter school on a deployment without Stripe
 * (nothing to sell — the app stays exactly as before).
 */
export function planPresentation(s: PlanSnapshot | null): PlanPresentation | null {
  if (!s) return null;

  if (s.plan === 'STARTER') {
    if (!s.stripeConfigured) return null;
    const limit = s.studentHardLimit;
    const overCap = limit !== null && s.studentCount >= limit;
    const previouslyPaid = s.subscribedPlan !== null && s.subscribedPlan !== 'STARTER';

    if (previouslyPaid && s.status === 'SUSPENDED') {
      // Unpaid Pro (Stripe dunning exhausted) → the school is back on Starter
      // rules until the card is fixed; a back-office suspension has no card
      // to fix, so it points at support instead.
      const byStripe = s.managedByStripe;
      return {
        kind: 'upsell',
        title: `${PLAN_LABELS.PRO} suspendu`,
        subtitle: byStripe ? 'Paiement en échec — régulariser' : 'Suspendu · contactez-nous',
        tone: 'alert',
        shortLabel: `${PLAN_LABELS.PRO} · À régulariser`,
        cta: byStripe ? 'Régulariser' : 'Nous contacter',
        href: PLAN_PAGE_PRO_HREF,
      };
    }

    if (previouslyPaid) {
      // A canceled / expired Pro row: the cap applies again — say so when it bites.
      return {
        kind: 'upsell',
        title: `Réactivez ${PLAN_LABELS.PRO}`,
        subtitle:
          overCap && limit !== null
            ? `${s.studentCount} élèves pour ${limit} places — inscriptions bloquées`
            : 'Vos données sont conservées · reprise en 1 clic',
        tone: overCap ? 'alert' : 'gold',
        shortLabel: `Réactiver ${PLAN_LABELS.PRO}`,
        cta: 'Réactiver',
        href: PLAN_PAGE_PRO_HREF,
      };
    }

    let subtitle: string;
    let tone: PlanPresentation['tone'] = 'gold';
    if (limit !== null && overCap) {
      subtitle = `Plafond atteint (${s.studentCount}/${limit}) — inscriptions bloquées`;
      tone = 'alert';
    } else if (limit !== null && s.studentCount >= Math.ceil(limit * NEAR_CAP_RATIO)) {
      const left = limit - s.studentCount;
      subtitle = `${s.studentCount}/${limit} élèves — plus que ${left} place${left > 1 ? 's' : ''}`;
    } else {
      subtitle = `Jusqu'à ${PLAN_STUDENT_SOFT_LIMIT.PRO ?? 1000} élèves · essai ${TRIAL_DAYS} j offert`;
    }
    return {
      kind: 'upsell',
      title: `Passez à ${PLAN_LABELS.PRO}`,
      subtitle,
      tone,
      shortLabel: `Passer à ${PLAN_LABELS.PRO}`,
      cta: 'Découvrir',
      href: PLAN_PAGE_PRO_HREF,
    };
  }

  // Paid plan (PRO / ENTERPRISE).
  const label = PLAN_LABELS[s.plan];
  let subtitle: string;
  let tone: PlanPresentation['tone'] = 'gold';
  // Sidebar strip is ~150 px wide at 11 px: keep every line ≤ 25 chars —
  // the Abonnement page carries the full sentence.
  if (s.stripeStatus === 'past_due' || s.stripeStatus === 'unpaid') {
    subtitle = 'Paiement en échec';
    tone = 'alert';
  } else if (s.status === 'SUSPENDED') {
    subtitle = 'Suspendu · contactez-nous';
    tone = 'alert';
  } else if (s.plan === 'ENTERPRISE' && !s.managedByStripe) {
    subtitle = 'Contrat Enterprise';
  } else if (s.cancelAtPeriodEnd) {
    subtitle = `Actif jusqu'au ${fmtDateShort(s.renewsAt)}`;
  } else if (s.status === 'TRIAL' || s.stripeStatus === 'trialing') {
    subtitle = `Essai jusqu'au ${fmtDateShort(s.trialEndsAt ?? s.renewsAt)}`;
  } else if (s.renewsAt) {
    subtitle = `Renouvellement ${fmtDateShort(s.renewsAt)}`;
  } else {
    subtitle = 'Actif';
  }
  const shortState =
    tone === 'alert'
      ? 'À régulariser'
      : s.status === 'TRIAL' || s.stripeStatus === 'trialing'
        ? 'Essai'
        : 'Actif';
  return {
    kind: 'paid',
    title: label,
    subtitle,
    tone,
    shortLabel: `${label} · ${shortState}`,
    cta: null,
    href: PLAN_PAGE_HREF,
  };
}
