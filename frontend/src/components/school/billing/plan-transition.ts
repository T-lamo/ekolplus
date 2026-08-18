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
  PLAN_LABELS,
  PLAN_STUDENT_HARD_LIMIT,
  formatUsd,
  type BillingIntervalKey,
  type BillingSummary,
  type PlanKey,
} from '@/lib/billing-plans';
import { fmtDateLong } from './billing-format';

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

const OWNER_ONLY = 'Réservé au propriétaire de l’établissement';
const STARTER_CAP = PLAN_STUDENT_HARD_LIMIT.STARTER ?? 50;

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

/** « ≈ 25 $ / mois » or « ≈ 270 $ / an » for the school's headcount on the chosen cycle. */
function estimateSentence(b: BillingSummary, interval: BillingIntervalKey): string {
  const annual = interval === 'YEAR' && b.rates.annualAvailable;
  const n = Math.max(b.studentCount, 1);
  const amount = annual ? b.rates.annualCents * n : b.rates.monthlyCents * n;
  return `≈ ${formatUsd(amount, { decimals: amount % 100 === 0 ? 0 : 2 })} / ${annual ? 'an' : 'mois'} pour ${plural(n, 'élève')}`;
}

/** Applies the OWNER-only rule to a transition that would mutate the subscription. */
function ownerGated(t: PlanTransition, canManage: boolean): PlanTransition {
  if (canManage) return t;
  return { ...t, disabledReason: OWNER_ONLY };
}

export function planTransition({
  selected,
  billing: b,
  canManage,
  interval,
}: PlanTransitionInput): PlanTransition {
  const current = b.plan;
  const proSuspended = b.subscribedPlan === 'PRO' && b.status === 'SUSPENDED';

  // ── Same plan ─────────────────────────────────────────────────────────
  if (selected === current) {
    if (current === 'PRO' && b.cancelAtPeriodEnd) {
      return ownerGated(
        {
          kind: 'resume',
          label: `Reprendre ${PLAN_LABELS.PRO}`,
          hint: `Rétrogradation vers Starter programmée le ${fmtDateLong(b.renewsAt)} — reprenez avant cette date pour conserver ${PLAN_LABELS.PRO} sans interruption ni nouvelle facture.`,
          disabledReason: null,
          tone: 'gold',
        },
        canManage,
      );
    }
    let hint: string;
    if (current === 'STARTER') {
      hint = proSuspended
        ? `Votre école est repassée sur Starter : l’abonnement ${PLAN_LABELS.PRO} est suspendu pour impayé. Sélectionnez ${PLAN_LABELS.PRO} pour régulariser.`
        : `Vous êtes sur le plan gratuit Starter — jusqu’à ${STARTER_CAP} élèves, sans carte bancaire. Sélectionnez un autre plan pour voir ce qui changerait.`;
    } else if (current === 'PRO') {
      hint =
        b.status === 'TRIAL'
          ? `${PLAN_LABELS.PRO} en période d’essai jusqu’au ${fmtDateLong(b.trialEndsAt ?? b.renewsAt)} — première facture à cette date (${estimateSentence(b, b.billingInterval ?? interval)}).`
          : `${PLAN_LABELS.PRO} actif — ${plural(b.billedSeats ?? b.studentCount, 'siège')} facturé${(b.billedSeats ?? b.studentCount) > 1 ? 's' : ''}, ${b.renewsAt ? `renouvellement le ${fmtDateLong(b.renewsAt)}` : 'sans date de renouvellement'}.`;
    } else {
      hint = 'Contrat Enterprise en cours — votre chargé de compte gère les évolutions du plan.';
    }
    return { kind: 'current', label: null, hint, disabledReason: null, tone: 'outline' };
  }

  // ── Enterprise selected: always a quote ───────────────────────────────
  if (selected === 'ENTERPRISE') {
    return {
      kind: 'contact',
      label: 'Demander un devis',
      hint: `Sur devis — tarif dégressif au-delà de 1000 élèves, multi-établissements, onboarding et support dédiés. Décrivez-nous votre réseau (${plural(b.studentCount, 'élève')} aujourd’hui) et nous revenons vers vous sous 48 h.`,
      disabledReason: null,
      tone: 'outline',
    };
  }

  // ── Anything from an Enterprise contract goes through the team ────────
  if (current === 'ENTERPRISE') {
    return {
      kind: 'managed',
      label: 'Géré par votre contrat',
      hint: `Votre école est sous contrat Enterprise : les changements de plan se font avec votre chargé de compte, pas en libre-service.`,
      disabledReason: 'Plan géré par votre contrat Enterprise',
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
            label: 'Régulariser le paiement',
            hint: `Abonnement ${PLAN_LABELS.PRO} suspendu pour impayé — mettez votre carte à jour dans l’espace Stripe : le plan est rétabli dès le paiement (vos ${plural(b.studentCount, 'élève')} sont conservés).`,
            disabledReason: null,
            tone: 'gold',
          },
          canManage,
        );
      }
      return {
        kind: 'contact',
        label: 'Nous contacter',
        hint: `Abonnement ${PLAN_LABELS.PRO} suspendu par l’équipe Schoolgesti — écrivez-nous pour le rétablir.`,
        disabledReason: null,
        tone: 'outline',
      };
    }
    if (!b.stripeConfigured) {
      return {
        kind: 'unavailable',
        label: `Passer à ${PLAN_LABELS.PRO}`,
        hint: 'La facturation en ligne n’est pas encore activée sur cette plateforme — contactez-nous pour passer à Établissement Pro.',
        disabledReason: 'Facturation en ligne non activée',
        tone: 'gold',
      };
    }
    if (b.managedByStripe) {
      // A canceled / expired Stripe row: the trial was already used.
      return ownerGated(
        {
          kind: 'reactivate',
          label: `Réactiver ${PLAN_LABELS.PRO}`,
          hint: `Réactivation immédiate, sans nouvel essai — ${estimateSentence(b, interval)}, facturé dès la validation. Vos données n’ont pas bougé.`,
          disabledReason: null,
          tone: 'gold',
        },
        canManage,
      );
    }
    return ownerGated(
      {
        kind: 'upgrade',
        label: `Passer à Pro — essai ${b.rates.trialDays} j`,
        hint: `Essai gratuit ${b.rates.trialDays} jours, aucune carte débitée avant la fin. Ensuite ${estimateSentence(b, interval)} — sièges = effectifs réels, sans engagement, résiliable à tout moment.`,
        disabledReason: null,
        tone: 'gold',
      },
      canManage,
    );
  }

  // ── Starter selected from Pro: downgrade ──────────────────────────────
  if (!b.managedByStripe) {
    return {
      kind: 'managed',
      label: 'Géré par Schoolgesti',
      hint: `Votre plan ${PLAN_LABELS.PRO} a été activé manuellement par l’équipe Schoolgesti — contactez-nous pour le modifier.`,
      disabledReason: 'Plan géré manuellement — contactez-nous',
      tone: 'outline',
    };
  }
  if (b.cancelAtPeriodEnd) {
    return ownerGated(
      {
        kind: 'downgrade-scheduled',
        label: 'Annuler la rétrogradation',
        hint: `Rétrogradation vers Starter programmée le ${fmtDateLong(b.renewsAt)} — ${PLAN_LABELS.PRO} reste actif jusque-là. Annulez-la pour continuer sans interruption.`,
        disabledReason: null,
        tone: 'primary',
      },
      canManage,
    );
  }
  const over = b.studentCount > STARTER_CAP;
  return ownerGated(
    {
      kind: 'downgrade',
      label: 'Rétrograder vers Starter',
      hint: `Prend effet le ${fmtDateLong(b.renewsAt)}, à la fin de la période déjà payée (aucun remboursement, plus aucune facture ensuite). ${
        over
          ? `Vous avez ${plural(b.studentCount, 'élève')} : ils restent tous accessibles, mais aucune nouvelle inscription tant que vous dépassez ${STARTER_CAP}.`
          : `Le plafond de ${STARTER_CAP} élèves s’appliquera de nouveau (vous en avez ${b.studentCount}).`
      } Données et modules restent accessibles ; reprise possible jusqu’à cette date.`,
      disabledReason: null,
      tone: 'destructive',
    },
    canManage,
  );
}

/** Default sales address; override per deployment with NEXT_PUBLIC_SALES_EMAIL. */
export const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL || 'contact@schoolgesti.com';

/**
 * `mailto:` for the Enterprise quote / support contact — subject + body are
 * pre-filled with what the team needs to answer (plan, headcount, school).
 */
export function salesMailto(input: {
  billing: BillingSummary;
  schoolName?: string | null;
  topic: 'enterprise' | 'support';
}): string {
  const { billing: b, schoolName, topic } = input;
  const subject =
    topic === 'enterprise'
      ? `Demande de devis Enterprise — ${schoolName ?? 'notre établissement'}`
      : `Abonnement ${PLAN_LABELS[b.subscribedPlan ?? b.plan]} — ${schoolName ?? 'notre établissement'}`;
  const lines = [
    'Bonjour,',
    '',
    topic === 'enterprise'
      ? 'Nous souhaitons un devis pour le plan Enterprise.'
      : 'Nous avons besoin d’aide concernant notre abonnement.',
    '',
    `Établissement : ${schoolName ?? '—'}`,
    `Plan actuel : ${PLAN_LABELS[b.plan]}${b.subscribedPlan && b.subscribedPlan !== b.plan ? ` (abonnement ${PLAN_LABELS[b.subscribedPlan]} ${b.status?.toLowerCase() ?? ''})` : ''}`,
    `Effectif : ${plural(b.studentCount, 'élève')}`,
    '',
    'Merci,',
  ];
  return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
