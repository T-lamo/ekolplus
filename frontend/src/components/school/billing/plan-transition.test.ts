import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import type { BillingSummary } from '@/lib/billing-plans';
import abonnementMessages from '@/messages/fr/abonnement.json';
import billingPlansMessages from '@/messages/fr/billingPlans.json';
import { planTransition, salesMailto, type PlanTransitionT } from './plan-transition';
import type { PlanLabelT } from '@/lib/billing-plan-i18n';

const bcp47 = 'fr-FR';
const t = createTranslator({
  locale: 'fr',
  messages: { Abonnement: abonnementMessages },
  namespace: 'Abonnement.planTransition',
}) as unknown as PlanTransitionT;
const tPlan = createTranslator({
  locale: 'fr',
  messages: { BillingPlans: billingPlansMessages },
  namespace: 'BillingPlans.label',
}) as unknown as PlanLabelT;

function sum(over: Partial<BillingSummary> = {}): BillingSummary {
  return {
    plan: 'STARTER',
    subscribedPlan: null,
    status: null,
    stripeStatus: null,
    managedByStripe: false,
    hasStripeCustomer: false,
    billingInterval: null,
    cancelAtPeriodEnd: false,
    renewsAt: null,
    trialEndsAt: null,
    startedAt: null,
    studentCount: 42,
    usage: { students: 42, teachers: 5, classes: 4, admins: 2 },
    billedSeats: null,
    studentHardLimit: 50,
    studentSoftLimit: null,
    rates: { monthlyCents: 60, annualCents: 648, trialDays: 30, annualAvailable: true },
    estimate: { monthlyCents: 2520, annualCents: 27216 },
    stripeConfigured: true,
    transactions: [],
    ...over,
  };
}

const pro = (over: Partial<BillingSummary> = {}) =>
  sum({
    plan: 'PRO',
    subscribedPlan: 'PRO',
    status: 'ACTIVE',
    stripeStatus: 'active',
    managedByStripe: true,
    hasStripeCustomer: true,
    billingInterval: 'MONTH',
    renewsAt: '2026-09-18T00:00:00.000Z',
    startedAt: '2026-08-18T00:00:00.000Z',
    billedSeats: 42,
    studentHardLimit: null,
    studentSoftLimit: 1000,
    ...over,
  });

const owner = { canManage: true, interval: 'MONTH' as const };

describe('planTransition — same plan selected', () => {
  it('Starter on Starter: current, no CTA, explains the free tier', () => {
    const tr = planTransition({ selected: 'STARTER', billing: sum(), ...owner }, t, tPlan, bcp47);
    expect(tr.kind).toBe('current');
    expect(tr.label).toBeNull();
    expect(tr.hint).toMatch(/plan gratuit Starter : jusqu’à 50 élèves/);
  });
  it('Pro on Pro (active): current with seats + renewal date', () => {
    const tr = planTransition({ selected: 'PRO', billing: pro(), ...owner }, t, tPlan, bcp47);
    expect(tr.kind).toBe('current');
    expect(tr.hint).toMatch(/42 sièges facturés, renouvellement le 18 septembre 2026/);
  });
  it('Pro on Pro (trial): first invoice date + estimate on the live cycle', () => {
    const tr = planTransition(
      {
        selected: 'PRO',
        billing: pro({
          status: 'TRIAL',
          stripeStatus: 'trialing',
          trialEndsAt: '2026-09-17T00:00:00.000Z',
        }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr.hint).toMatch(/essai jusqu’au 17 septembre 2026/);
    expect(tr.hint).toMatch(/≈ 25,20 \$ \/ mois pour 42 élèves/);
  });
  it('Pro on Pro with a scheduled downgrade: resume (gold)', () => {
    const tr = planTransition(
      {
        selected: 'PRO',
        billing: pro({ cancelAtPeriodEnd: true }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr).toMatchObject({
      kind: 'resume',
      label: 'Reprendre Établissement Pro',
      tone: 'gold',
      disabledReason: null,
    });
    expect(tr.hint).toMatch(/programmée le 18 septembre 2026/);
  });
  it('Starter while the Pro row is suspended: hint points at Pro to regularise', () => {
    const tr = planTransition(
      {
        selected: 'STARTER',
        billing: sum({
          subscribedPlan: 'PRO',
          status: 'SUSPENDED',
          stripeStatus: 'unpaid',
          managedByStripe: true,
        }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr.kind).toBe('current');
    expect(tr.hint).toMatch(/suspendu pour impayé/);
  });
  it('Enterprise on Enterprise: current, managed by the account manager', () => {
    const tr = planTransition(
      {
        selected: 'ENTERPRISE',
        billing: sum({ plan: 'ENTERPRISE', subscribedPlan: 'ENTERPRISE', status: 'ACTIVE' }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr.kind).toBe('current');
  });
});

describe('planTransition — Starter → Pro', () => {
  it('never billed: upgrade with the trial and the estimate', () => {
    const tr = planTransition({ selected: 'PRO', billing: sum(), ...owner }, t, tPlan, bcp47);
    expect(tr).toMatchObject({
      kind: 'upgrade',
      label: 'Passer à Pro · essai 30 j',
      tone: 'gold',
      disabledReason: null,
    });
    expect(tr.hint).toMatch(/Essai gratuit 30 jours/);
    expect(tr.hint).toMatch(/≈ 25,20 \$ \/ mois pour 42 élèves/);
  });
  it('annual toggle: the estimate switches to « / an »', () => {
    const tr = planTransition(
      {
        selected: 'PRO',
        billing: sum(),
        canManage: true,
        interval: 'YEAR',
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr.hint).toMatch(/≈ 272,16 \$ \/ an pour 42 élèves/);
  });
  it('annual toggle without an annual Price: stays monthly', () => {
    const tr = planTransition(
      {
        selected: 'PRO',
        billing: sum({
          rates: { monthlyCents: 60, annualCents: 648, trialDays: 30, annualAvailable: false },
        }),
        canManage: true,
        interval: 'YEAR',
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr.hint).toMatch(/\/ mois pour 42 élèves/);
  });
  it('0 students: the estimate is computed on 1 seat (Stripe minimum)', () => {
    const tr = planTransition(
      { selected: 'PRO', billing: sum({ studentCount: 0 }), ...owner },
      t,
      tPlan,
      bcp47,
    );
    expect(tr.hint).toMatch(/≈ 0,60 \$ \/ mois pour 1 élève/);
  });
  it('after a canceled Pro: reactivate, no trial', () => {
    const tr = planTransition(
      {
        selected: 'PRO',
        billing: sum({
          subscribedPlan: 'PRO',
          status: 'CANCELED',
          stripeStatus: 'canceled',
          managedByStripe: true,
          hasStripeCustomer: true,
        }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr).toMatchObject({
      kind: 'reactivate',
      label: 'Réactiver Établissement Pro',
      tone: 'gold',
    });
    expect(tr.hint).toMatch(/sans nouvel essai/);
  });
  it('after an expired Pro: reactivate too', () => {
    const tr = planTransition(
      {
        selected: 'PRO',
        billing: sum({ subscribedPlan: 'PRO', status: 'EXPIRED', managedByStripe: true }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr.kind).toBe('reactivate');
  });
  it('suspended for non-payment (Stripe unpaid): regularise via the portal', () => {
    const tr = planTransition(
      {
        selected: 'PRO',
        billing: sum({
          subscribedPlan: 'PRO',
          status: 'SUSPENDED',
          stripeStatus: 'unpaid',
          managedByStripe: true,
          hasStripeCustomer: true,
        }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr).toMatchObject({
      kind: 'regularize',
      label: 'Régulariser le paiement',
      tone: 'gold',
    });
    expect(tr.hint).toMatch(/42 élèves sont conservés/);
  });
  it('suspended by the back-office (no Stripe row): contact', () => {
    const tr = planTransition(
      {
        selected: 'PRO',
        billing: sum({ subscribedPlan: 'PRO', status: 'SUSPENDED', managedByStripe: false }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr).toMatchObject({ kind: 'contact', label: 'Nous contacter' });
  });
  it('Stripe not configured: unavailable (disabled CTA with the reason)', () => {
    const tr = planTransition(
      {
        selected: 'PRO',
        billing: sum({ stripeConfigured: false }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr).toMatchObject({
      kind: 'unavailable',
      disabledReason: 'Facturation en ligne non activée',
    });
  });
  it('ADMIN (not owner): same transition, CTA disabled with the owner-only reason', () => {
    const tr = planTransition(
      {
        selected: 'PRO',
        billing: sum(),
        canManage: false,
        interval: 'MONTH',
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr.kind).toBe('upgrade');
    expect(tr.disabledReason).toBe('Réservé au propriétaire de l’établissement');
  });
});

describe('planTransition — Pro → Starter (downgrade)', () => {
  it('under the cap: downgrade at period end, cap re-applies', () => {
    const tr = planTransition({ selected: 'STARTER', billing: pro(), ...owner }, t, tPlan, bcp47);
    expect(tr).toMatchObject({
      kind: 'downgrade',
      label: 'Rétrograder vers Starter',
      tone: 'destructive',
      disabledReason: null,
    });
    expect(tr.hint).toMatch(/Prend effet le 18 septembre 2026/);
    expect(tr.hint).toMatch(/aucun remboursement/);
    expect(tr.hint).toMatch(/plafond de 50 élèves s’appliquera de nouveau \(vous en avez 42\)/);
    expect(tr.hint).toMatch(/reprise possible/);
  });
  it('over the cap: warns that enrolments will be blocked, students kept', () => {
    const tr = planTransition(
      { selected: 'STARTER', billing: pro({ studentCount: 62 }), ...owner },
      t,
      tPlan,
      bcp47,
    );
    expect(tr.hint).toMatch(
      /62 élèves : ils restent tous accessibles, mais aucune nouvelle inscription tant que vous dépassez 50/,
    );
  });
  it('already scheduled: the Starter card offers to cancel the downgrade', () => {
    const tr = planTransition(
      {
        selected: 'STARTER',
        billing: pro({ cancelAtPeriodEnd: true }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr).toMatchObject({
      kind: 'downgrade-scheduled',
      label: 'Annuler la rétrogradation',
      tone: 'primary',
    });
  });
  it('manual Pro (back-office, no Stripe): managed, disabled', () => {
    const tr = planTransition(
      {
        selected: 'STARTER',
        billing: pro({ managedByStripe: false, stripeStatus: null, hasStripeCustomer: false }),
        ...owner,
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr).toMatchObject({
      kind: 'managed',
      disabledReason: 'Plan géré manuellement : contactez-nous',
    });
  });
  it('ADMIN: downgrade shown but disabled (owner-only)', () => {
    const tr = planTransition(
      {
        selected: 'STARTER',
        billing: pro(),
        canManage: false,
        interval: 'MONTH',
      },
      t,
      tPlan,
      bcp47,
    );
    expect(tr.kind).toBe('downgrade');
    expect(tr.disabledReason).toBe('Réservé au propriétaire de l’établissement');
  });
});

describe('planTransition — Enterprise', () => {
  it('Enterprise selected from Starter or Pro: ask for a quote (everyone, incl. ADMIN)', () => {
    for (const billing of [sum(), pro()]) {
      const tr = planTransition(
        {
          selected: 'ENTERPRISE',
          billing,
          canManage: false,
          interval: 'MONTH',
        },
        t,
        tPlan,
        bcp47,
      );
      expect(tr).toMatchObject({
        kind: 'contact',
        label: 'Demander un devis',
        disabledReason: null,
      });
      expect(tr.hint).toMatch(/42 élèves aujourd’hui/);
    }
  });
  it('from an Enterprise contract, Starter and Pro are managed (disabled)', () => {
    const billing = sum({ plan: 'ENTERPRISE', subscribedPlan: 'ENTERPRISE', status: 'ACTIVE' });
    for (const selected of ['STARTER', 'PRO'] as const) {
      const tr = planTransition({ selected, billing, ...owner }, t, tPlan, bcp47);
      expect(tr).toMatchObject({ kind: 'managed', label: 'Géré par votre contrat' });
      expect(tr.disabledReason).toBeTruthy();
    }
  });
});

describe('salesMailto', () => {
  it('Enterprise quote: subject + body carry school, plan and headcount', () => {
    const href = salesMailto(
      {
        billing: pro({ studentCount: 1200 }),
        schoolName: 'Lycée Test',
        topic: 'enterprise',
      },
      t,
      tPlan,
    );
    expect(href.startsWith('mailto:contact@schoolgesti.com?subject=')).toBe(true);
    const url = new URL(href);
    expect(url.searchParams.get('subject')).toBe('Demande de devis Enterprise · Lycée Test');
    const body = url.searchParams.get('body') ?? '';
    expect(body).toMatch(/Établissement : Lycée Test/);
    expect(body).toMatch(/Plan actuel : Établissement Pro/);
    expect(body).toMatch(/Effectif : 1200 élèves/);
  });
  it('support topic on a suspended Pro: mentions the suspended subscription', () => {
    const href = salesMailto(
      {
        billing: sum({ subscribedPlan: 'PRO', status: 'SUSPENDED' }),
        schoolName: null,
        topic: 'support',
      },
      t,
      tPlan,
    );
    const url = new URL(href);
    expect(url.searchParams.get('subject')).toBe(
      'Abonnement Établissement Pro · notre établissement',
    );
    expect(url.searchParams.get('body')).toMatch(
      /Plan actuel : Starter \(abonnement Établissement Pro suspended\)/,
    );
  });
});
