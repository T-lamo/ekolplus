import { describe, it, expect } from 'vitest';
import type { BillingSummary } from '@/lib/billing-plans';
import { planTransition, salesMailto } from './plan-transition';

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
    const t = planTransition({ selected: 'STARTER', billing: sum(), ...owner });
    expect(t.kind).toBe('current');
    expect(t.label).toBeNull();
    expect(t.hint).toMatch(/plan gratuit Starter — jusqu’à 50 élèves/);
  });
  it('Pro on Pro (active): current with seats + renewal date', () => {
    const t = planTransition({ selected: 'PRO', billing: pro(), ...owner });
    expect(t.kind).toBe('current');
    expect(t.hint).toMatch(/42 sièges facturés, renouvellement le 18 septembre 2026/);
  });
  it('Pro on Pro (trial): first invoice date + estimate on the live cycle', () => {
    const t = planTransition({
      selected: 'PRO',
      billing: pro({
        status: 'TRIAL',
        stripeStatus: 'trialing',
        trialEndsAt: '2026-09-17T00:00:00.000Z',
      }),
      ...owner,
    });
    expect(t.hint).toMatch(/essai jusqu’au 17 septembre 2026/);
    expect(t.hint).toMatch(/≈ 25,20 \$ \/ mois pour 42 élèves/);
  });
  it('Pro on Pro with a scheduled downgrade: resume (gold)', () => {
    const t = planTransition({
      selected: 'PRO',
      billing: pro({ cancelAtPeriodEnd: true }),
      ...owner,
    });
    expect(t).toMatchObject({
      kind: 'resume',
      label: 'Reprendre Établissement Pro',
      tone: 'gold',
      disabledReason: null,
    });
    expect(t.hint).toMatch(/programmée le 18 septembre 2026/);
  });
  it('Starter while the Pro row is suspended: hint points at Pro to regularise', () => {
    const t = planTransition({
      selected: 'STARTER',
      billing: sum({
        subscribedPlan: 'PRO',
        status: 'SUSPENDED',
        stripeStatus: 'unpaid',
        managedByStripe: true,
      }),
      ...owner,
    });
    expect(t.kind).toBe('current');
    expect(t.hint).toMatch(/suspendu pour impayé/);
  });
  it('Enterprise on Enterprise: current, managed by the account manager', () => {
    const t = planTransition({
      selected: 'ENTERPRISE',
      billing: sum({ plan: 'ENTERPRISE', subscribedPlan: 'ENTERPRISE', status: 'ACTIVE' }),
      ...owner,
    });
    expect(t.kind).toBe('current');
  });
});

describe('planTransition — Starter → Pro', () => {
  it('never billed: upgrade with the trial and the estimate', () => {
    const t = planTransition({ selected: 'PRO', billing: sum(), ...owner });
    expect(t).toMatchObject({
      kind: 'upgrade',
      label: 'Passer à Pro — essai 30 j',
      tone: 'gold',
      disabledReason: null,
    });
    expect(t.hint).toMatch(/Essai gratuit 30 jours/);
    expect(t.hint).toMatch(/≈ 25,20 \$ \/ mois pour 42 élèves/);
  });
  it('annual toggle: the estimate switches to « / an »', () => {
    const t = planTransition({
      selected: 'PRO',
      billing: sum(),
      canManage: true,
      interval: 'YEAR',
    });
    expect(t.hint).toMatch(/≈ 272,16 \$ \/ an pour 42 élèves/);
  });
  it('annual toggle without an annual Price: stays monthly', () => {
    const t = planTransition({
      selected: 'PRO',
      billing: sum({
        rates: { monthlyCents: 60, annualCents: 648, trialDays: 30, annualAvailable: false },
      }),
      canManage: true,
      interval: 'YEAR',
    });
    expect(t.hint).toMatch(/\/ mois pour 42 élèves/);
  });
  it('0 students: the estimate is computed on 1 seat (Stripe minimum)', () => {
    const t = planTransition({ selected: 'PRO', billing: sum({ studentCount: 0 }), ...owner });
    expect(t.hint).toMatch(/≈ 0,60 \$ \/ mois pour 1 élève/);
  });
  it('after a canceled Pro: reactivate, no trial', () => {
    const t = planTransition({
      selected: 'PRO',
      billing: sum({
        subscribedPlan: 'PRO',
        status: 'CANCELED',
        stripeStatus: 'canceled',
        managedByStripe: true,
        hasStripeCustomer: true,
      }),
      ...owner,
    });
    expect(t).toMatchObject({
      kind: 'reactivate',
      label: 'Réactiver Établissement Pro',
      tone: 'gold',
    });
    expect(t.hint).toMatch(/sans nouvel essai/);
  });
  it('after an expired Pro: reactivate too', () => {
    const t = planTransition({
      selected: 'PRO',
      billing: sum({ subscribedPlan: 'PRO', status: 'EXPIRED', managedByStripe: true }),
      ...owner,
    });
    expect(t.kind).toBe('reactivate');
  });
  it('suspended for non-payment (Stripe unpaid): regularise via the portal', () => {
    const t = planTransition({
      selected: 'PRO',
      billing: sum({
        subscribedPlan: 'PRO',
        status: 'SUSPENDED',
        stripeStatus: 'unpaid',
        managedByStripe: true,
        hasStripeCustomer: true,
      }),
      ...owner,
    });
    expect(t).toMatchObject({ kind: 'regularize', label: 'Régulariser le paiement', tone: 'gold' });
    expect(t.hint).toMatch(/42 élèves sont conservés/);
  });
  it('suspended by the back-office (no Stripe row): contact', () => {
    const t = planTransition({
      selected: 'PRO',
      billing: sum({ subscribedPlan: 'PRO', status: 'SUSPENDED', managedByStripe: false }),
      ...owner,
    });
    expect(t).toMatchObject({ kind: 'contact', label: 'Nous contacter' });
  });
  it('Stripe not configured: unavailable (disabled CTA with the reason)', () => {
    const t = planTransition({
      selected: 'PRO',
      billing: sum({ stripeConfigured: false }),
      ...owner,
    });
    expect(t).toMatchObject({
      kind: 'unavailable',
      disabledReason: 'Facturation en ligne non activée',
    });
  });
  it('ADMIN (not owner): same transition, CTA disabled with the owner-only reason', () => {
    const t = planTransition({
      selected: 'PRO',
      billing: sum(),
      canManage: false,
      interval: 'MONTH',
    });
    expect(t.kind).toBe('upgrade');
    expect(t.disabledReason).toBe('Réservé au propriétaire de l’établissement');
  });
});

describe('planTransition — Pro → Starter (downgrade)', () => {
  it('under the cap: downgrade at period end, cap re-applies', () => {
    const t = planTransition({ selected: 'STARTER', billing: pro(), ...owner });
    expect(t).toMatchObject({
      kind: 'downgrade',
      label: 'Rétrograder vers Starter',
      tone: 'destructive',
      disabledReason: null,
    });
    expect(t.hint).toMatch(/Prend effet le 18 septembre 2026/);
    expect(t.hint).toMatch(/aucun remboursement/);
    expect(t.hint).toMatch(/plafond de 50 élèves s’appliquera de nouveau \(vous en avez 42\)/);
    expect(t.hint).toMatch(/reprise possible/);
  });
  it('over the cap: warns that enrolments will be blocked, students kept', () => {
    const t = planTransition({ selected: 'STARTER', billing: pro({ studentCount: 62 }), ...owner });
    expect(t.hint).toMatch(
      /62 élèves : ils restent tous accessibles, mais aucune nouvelle inscription tant que vous dépassez 50/,
    );
  });
  it('already scheduled: the Starter card offers to cancel the downgrade', () => {
    const t = planTransition({
      selected: 'STARTER',
      billing: pro({ cancelAtPeriodEnd: true }),
      ...owner,
    });
    expect(t).toMatchObject({
      kind: 'downgrade-scheduled',
      label: 'Annuler la rétrogradation',
      tone: 'primary',
    });
  });
  it('manual Pro (back-office, no Stripe): managed, disabled', () => {
    const t = planTransition({
      selected: 'STARTER',
      billing: pro({ managedByStripe: false, stripeStatus: null, hasStripeCustomer: false }),
      ...owner,
    });
    expect(t).toMatchObject({
      kind: 'managed',
      disabledReason: 'Plan géré manuellement — contactez-nous',
    });
  });
  it('ADMIN: downgrade shown but disabled (owner-only)', () => {
    const t = planTransition({
      selected: 'STARTER',
      billing: pro(),
      canManage: false,
      interval: 'MONTH',
    });
    expect(t.kind).toBe('downgrade');
    expect(t.disabledReason).toBe('Réservé au propriétaire de l’établissement');
  });
});

describe('planTransition — Enterprise', () => {
  it('Enterprise selected from Starter or Pro: ask for a quote (everyone, incl. ADMIN)', () => {
    for (const billing of [sum(), pro()]) {
      const t = planTransition({
        selected: 'ENTERPRISE',
        billing,
        canManage: false,
        interval: 'MONTH',
      });
      expect(t).toMatchObject({
        kind: 'contact',
        label: 'Demander un devis',
        disabledReason: null,
      });
      expect(t.hint).toMatch(/42 élèves aujourd’hui/);
    }
  });
  it('from an Enterprise contract, Starter and Pro are managed (disabled)', () => {
    const billing = sum({ plan: 'ENTERPRISE', subscribedPlan: 'ENTERPRISE', status: 'ACTIVE' });
    for (const selected of ['STARTER', 'PRO'] as const) {
      const t = planTransition({ selected, billing, ...owner });
      expect(t).toMatchObject({ kind: 'managed', label: 'Géré par votre contrat' });
      expect(t.disabledReason).toBeTruthy();
    }
  });
});

describe('salesMailto', () => {
  it('Enterprise quote: subject + body carry school, plan and headcount', () => {
    const href = salesMailto({
      billing: pro({ studentCount: 1200 }),
      schoolName: 'Lycée Test',
      topic: 'enterprise',
    });
    expect(href.startsWith('mailto:contact@schoolgesti.com?subject=')).toBe(true);
    const url = new URL(href);
    expect(url.searchParams.get('subject')).toBe('Demande de devis Enterprise — Lycée Test');
    const body = url.searchParams.get('body') ?? '';
    expect(body).toMatch(/Établissement : Lycée Test/);
    expect(body).toMatch(/Plan actuel : Établissement Pro/);
    expect(body).toMatch(/Effectif : 1200 élèves/);
  });
  it('support topic on a suspended Pro: mentions the suspended subscription', () => {
    const href = salesMailto({
      billing: sum({ subscribedPlan: 'PRO', status: 'SUSPENDED' }),
      schoolName: null,
      topic: 'support',
    });
    const url = new URL(href);
    expect(url.searchParams.get('subject')).toBe(
      'Abonnement Établissement Pro — notre établissement',
    );
    expect(url.searchParams.get('body')).toMatch(
      /Plan actuel : Starter \(abonnement Établissement Pro suspended\)/,
    );
  });
});
