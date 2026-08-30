import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import type { PlanSnapshot } from '@/lib/billing-plans';
import messages from '@/messages/fr/schoolPlanCard.json';
import billingPlansMessages from '@/messages/fr/billingPlans.json';
import { planPresentation } from './plan-presentation';

const t = createTranslator({
  locale: 'fr',
  messages: { SchoolPlanCard: messages },
  namespace: 'SchoolPlanCard',
});

const bcp47 = 'fr-FR';
const tPlan = createTranslator({
  locale: 'fr',
  messages: { BillingPlans: billingPlansMessages },
  namespace: 'BillingPlans.label',
});

function snap(over: Partial<PlanSnapshot> = {}): PlanSnapshot {
  return {
    plan: 'STARTER',
    subscribedPlan: null,
    status: null,
    stripeStatus: null,
    managedByStripe: false,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    renewsAt: null,
    studentCount: 10,
    studentHardLimit: 50,
    stripeConfigured: true,
    ...over,
  };
}

describe('planPresentation — nothing to show', () => {
  it('null snapshot (no school / loading / error) → null', () => {
    expect(planPresentation(null, t, tPlan, bcp47)).toBeNull();
  });
  it('Starter on a deployment without Stripe → null (nothing to sell)', () => {
    expect(planPresentation(snap({ stripeConfigured: false }), t, tPlan, bcp47)).toBeNull();
  });
  it('a paid plan is still shown without Stripe (manual Enterprise contract)', () => {
    const p = planPresentation(
      snap({
        plan: 'ENTERPRISE',
        subscribedPlan: 'ENTERPRISE',
        status: 'ACTIVE',
        stripeConfigured: false,
      }),
      t,
      tPlan,
      bcp47,
    );
    expect(p).toMatchObject({
      kind: 'paid',
      title: 'Enterprise',
      subtitle: 'Contrat Enterprise',
      tone: 'gold',
    });
  });
});

describe('planPresentation — Starter upsell', () => {
  it('well under the cap: generic nudge with the trial', () => {
    expect(planPresentation(snap({ studentCount: 10 }), t, tPlan, bcp47)).toEqual({
      kind: 'upsell',
      title: 'Passez à Établissement Pro',
      subtitle: "Jusqu'à 1000 élèves · essai 30 j offert",
      tone: 'gold',
      shortLabel: 'Passer à Établissement Pro',
      cta: 'Découvrir',
      href: '/abonnement?plan=PRO',
    });
  });
  it('at 80 % of the cap: urgency copy with the remaining seats (plural)', () => {
    expect(planPresentation(snap({ studentCount: 40 }), t, tPlan, bcp47)).toMatchObject({
      subtitle: '40/50 élèves · plus que 10 places',
      tone: 'gold',
    });
    expect(planPresentation(snap({ studentCount: 39 }), t, tPlan, bcp47)?.subtitle).toBe(
      "Jusqu'à 1000 élèves · essai 30 j offert",
    );
  });
  it('one seat left: singular', () => {
    expect(planPresentation(snap({ studentCount: 49 }), t, tPlan, bcp47)?.subtitle).toBe(
      '49/50 élèves · plus que 1 place',
    );
  });
  it('cap reached (or exceeded): alert tone, enrolments blocked', () => {
    expect(planPresentation(snap({ studentCount: 50 }), t, tPlan, bcp47)).toMatchObject({
      subtitle: 'Plafond atteint (50/50) · inscriptions bloquées',
      tone: 'alert',
      cta: 'Découvrir',
    });
    expect(planPresentation(snap({ studentCount: 57 }), t, tPlan, bcp47)?.tone).toBe('alert');
  });
  it('a canceled Pro row: « Réactiver », gold while under the cap…', () => {
    expect(
      planPresentation(
        snap({
          subscribedPlan: 'PRO',
          status: 'CANCELED',
          managedByStripe: true,
          studentCount: 30,
        }),
        t,
        tPlan,
        bcp47,
      ),
    ).toEqual({
      kind: 'upsell',
      title: 'Réactivez Établissement Pro',
      subtitle: 'Vos données sont conservées · reprise en 1 clic',
      tone: 'gold',
      shortLabel: 'Réactiver Établissement Pro',
      cta: 'Réactiver',
      href: '/abonnement?plan=PRO',
    });
  });
  it('…and alert when the school already exceeds 50 students', () => {
    expect(
      planPresentation(
        snap({ subscribedPlan: 'PRO', status: 'EXPIRED', studentCount: 62 }),
        t,
        tPlan,
        bcp47,
      ),
    ).toMatchObject({
      subtitle: '62 élèves pour 50 places · inscriptions bloquées',
      tone: 'alert',
      cta: 'Réactiver',
    });
  });
  it('Pro suspended for non-payment (effective Starter): « régulariser » alert', () => {
    expect(
      planPresentation(
        snap({
          subscribedPlan: 'PRO',
          status: 'SUSPENDED',
          stripeStatus: 'unpaid',
          managedByStripe: true,
        }),
        t,
        tPlan,
        bcp47,
      ),
    ).toEqual({
      kind: 'upsell',
      title: 'Établissement Pro suspendu',
      subtitle: 'Paiement en échec · régulariser',
      tone: 'alert',
      shortLabel: 'Établissement Pro · À régulariser',
      cta: 'Régulariser',
      href: '/abonnement?plan=PRO',
    });
  });
  it('Pro suspended by the back-office (no Stripe row): points at support', () => {
    expect(
      planPresentation(
        snap({ subscribedPlan: 'PRO', status: 'SUSPENDED', managedByStripe: false }),
        t,
        tPlan,
        bcp47,
      ),
    ).toMatchObject({
      subtitle: 'Suspendu · contactez-nous',
      tone: 'alert',
      cta: 'Nous contacter',
    });
  });
});

describe('planPresentation — paid plan strip', () => {
  const pro = (over: Partial<PlanSnapshot> = {}) =>
    snap({
      plan: 'PRO',
      subscribedPlan: 'PRO',
      status: 'ACTIVE',
      stripeStatus: 'active',
      managedByStripe: true,
      renewsAt: '2026-09-17T00:00:00.000Z',
      studentHardLimit: null,
      studentCount: 420,
      ...over,
    });

  it('active: renewal date, gold, no CTA, whole strip links to /abonnement', () => {
    expect(planPresentation(pro(), t, tPlan, bcp47)).toEqual({
      kind: 'paid',
      title: 'Établissement Pro',
      subtitle: 'Renouvellement 17/09/2026',
      tone: 'gold',
      shortLabel: 'Établissement Pro · Actif',
      cta: null,
      href: '/abonnement',
    });
  });
  it('trial: end-of-trial date (trialEndsAt wins over renewsAt)', () => {
    expect(
      planPresentation(
        pro({ status: 'TRIAL', stripeStatus: 'trialing', trialEndsAt: '2026-09-10T00:00:00.000Z' }),
        t,
        tPlan,
        bcp47,
      ),
    ).toMatchObject({
      subtitle: "Essai jusqu'au 10/09/2026",
      shortLabel: 'Établissement Pro · Essai',
    });
  });
  it("cancel scheduled: « Actif jusqu'au … » (still gold — the plan is still paid)", () => {
    expect(planPresentation(pro({ cancelAtPeriodEnd: true }), t, tPlan, bcp47)).toMatchObject({
      subtitle: "Actif jusqu'au 17/09/2026",
      tone: 'gold',
    });
  });
  it('past_due / unpaid: alert tone with the fix hint', () => {
    expect(planPresentation(pro({ stripeStatus: 'past_due' }), t, tPlan, bcp47)).toMatchObject({
      subtitle: 'Paiement en échec',
      tone: 'alert',
      shortLabel: 'Établissement Pro · À régulariser',
    });
    expect(planPresentation(pro({ stripeStatus: 'unpaid' }), t, tPlan, bcp47)?.tone).toBe('alert');
  });
  it('defensive: a paid snapshot flagged SUSPENDED still reads as an alert', () => {
    // The server maps SUSPENDED to an effective Starter plan (see the upsell
    // cases above); this branch only guards against a stale/foreign snapshot.
    expect(
      planPresentation(pro({ status: 'SUSPENDED', stripeStatus: null }), t, tPlan, bcp47),
    ).toMatchObject({
      subtitle: 'Suspendu · contactez-nous',
      tone: 'alert',
    });
  });
  it('active without a renewal date (manual row): plain « Actif »', () => {
    expect(
      planPresentation(
        pro({ stripeStatus: null, managedByStripe: false, renewsAt: null }),
        t,
        tPlan,
        bcp47,
      )?.subtitle,
    ).toBe('Actif');
  });
});
