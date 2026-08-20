// SaaS billing catalogue — single source of truth shared by the server
// (Stripe checkout, plan limits, seed) and the school UI (Abonnement tab,
// checkout récap page). No `server-only` here on purpose: everything below
// is public pricing (it mirrors the landing's pricing-section.tsx) and must
// render client-side.
//
// Plan keys match `SubscriptionPlan.key` in Postgres (STARTER / PRO /
// ENTERPRISE — renamed from STARTER / ESSENTIEL / PREMIUM by migration
// 28_stripe_billing). Amounts are integer USD cents — never decimals.

export type PlanKey = 'STARTER' | 'PRO' | 'ENTERPRISE';
export const PLAN_KEYS: readonly PlanKey[] = ['STARTER', 'PRO', 'ENTERPRISE'];

export type BillingIntervalKey = 'MONTH' | 'YEAR';

/** 0,60 $ / élève / mois — the Pro rate advertised on the landing page. */
export const PRO_RATE_CENTS = 60;

/**
 * Annual billing is a genuinely discounted Stripe Price (not a coupon) —
 * see scripts/stripe-setup-prices.ts. This constant only DISPLAYS the
 * saving; the amount charged always comes from the Stripe Price itself.
 * 0,60 $ × 12 × 0,90 = 6,48 $ / élève / an.
 */
export const ANNUAL_DISCOUNT = 0.1;
export const PRO_ANNUAL_RATE_CENTS = Math.round(PRO_RATE_CENTS * 12 * (1 - ANNUAL_DISCOUNT)); // 648

/** Free trial promised on the landing ("Essai gratuit 30 jours"). */
export const TRIAL_DAYS = 30;

/**
 * Hard cap: adding a student past this is refused (402 PLAN_LIMIT_REACHED).
 * Only the free Starter tier is hard-capped — it is the upgrade lever. A
 * paying school is never blocked ("never cut a paying school").
 */
export const PLAN_STUDENT_HARD_LIMIT: Record<PlanKey, number | null> = {
  STARTER: 50,
  PRO: null,
  ENTERPRISE: null,
};

/**
 * Soft ceiling: no blocking, just a banner steering toward Enterprise. Pro
 * is announced "jusqu'à 1000 élèves" on the landing.
 */
export const PLAN_STUDENT_SOFT_LIMIT: Record<PlanKey, number | null> = {
  STARTER: null,
  PRO: 1000,
  ENTERPRISE: null,
};

export const PLAN_LABELS: Record<PlanKey, string> = {
  STARTER: 'Starter',
  PRO: 'Établissement Pro',
  ENTERPRISE: 'Enterprise',
};

/**
 * Feature bullets of the three plan cards (Abonnement page). Honest by
 * construction (user decision 2026-08-18: NO module locking for now) — the
 * paid tiers differ by the student cap, the billing model and support; every
 * management module is available on every plan, so no bullet shows a ✗ on
 * something the school can actually use.
 */
export const PLAN_FEATURES: Record<PlanKey, { label: string; included: boolean }[]> = {
  STARTER: [
    { label: "Jusqu'à 50 élèves", included: true },
    { label: 'Élèves, classes, notes & bulletins', included: true },
    { label: 'Présences, frais & scolarité', included: true },
    { label: 'Emploi du temps & salles', included: true },
    { label: 'Gratuit, sans carte bancaire', included: true },
    { label: 'Au-delà de 50 élèves', included: false },
    { label: 'Support prioritaire', included: false },
  ],
  PRO: [
    { label: "Jusqu'à 1000 élèves", included: true },
    { label: 'Tout du plan Starter, sans plafond de 50', included: true },
    { label: 'Sièges facturés = effectifs réels', included: true },
    { label: 'Sans engagement, résiliable à tout moment', included: true },
    { label: 'Essai gratuit 30 jours', included: true },
    { label: 'Factures & reçus Stripe', included: true },
    { label: 'Support prioritaire', included: true },
  ],
  ENTERPRISE: [
    { label: 'Élèves illimités, tarif dégressif', included: true },
    { label: 'Tout du plan Pro', included: true },
    { label: 'Multi-établissements', included: true },
    { label: 'API & intégrations', included: true },
    { label: 'Support prioritaire 24/7', included: true },
    { label: 'Onboarding dédié', included: true },
    { label: 'Tableau de bord réseau', included: true },
  ],
};

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value);
}

/** Cents → "1 190,40 $" (locale-aware grouping, 2 decimals, dollar sign after). */
export function formatUsd(cents: number, bcp47: string, opts: { decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 2;
  const value = (cents / 100).toLocaleString(bcp47, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${value} $`;
}

/** Monthly estimate for a headcount, in cents (0 for the free plans). */
export function estimateMonthlyCents(students: number, interval: BillingIntervalKey): number {
  if (interval === 'YEAR') return Math.round((students * PRO_ANNUAL_RATE_CENTS) / 12);
  return students * PRO_RATE_CENTS;
}

/** Yearly estimate for a headcount, in cents. */
export function estimateAnnualCents(students: number, interval: BillingIntervalKey): number {
  if (interval === 'YEAR') return students * PRO_ANNUAL_RATE_CENTS;
  return students * PRO_RATE_CENTS * 12;
}

// ── API shape of GET /api/school/billing (built by lib/server/billing/summary.ts) ──

export interface BillingSummary {
  /** Effective plan — CANCELED/EXPIRED subscriptions fall back to STARTER. */
  plan: PlanKey;
  /** Plan on the Subscription row (null when the school has no row = Starter). */
  subscribedPlan: PlanKey | null;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELED' | null;
  /** Stripe's raw status (past_due, unpaid, paused…) — null for manual subscriptions. */
  stripeStatus: string | null;
  /** True when the row is driven by Stripe (self-service); false = back-office. */
  managedByStripe: boolean;
  /** True when a Customer exists → the Customer Portal can be opened. */
  hasStripeCustomer: boolean;
  billingInterval: BillingIntervalKey | null;
  cancelAtPeriodEnd: boolean;
  renewsAt: string | null;
  trialEndsAt: string | null;
  startedAt: string | null;
  studentCount: number;
  /** Live counts shown in the « Utilisation du plan » card. */
  usage: { students: number; teachers: number; classes: number; admins: number };
  billedSeats: number | null;
  studentHardLimit: number | null;
  studentSoftLimit: number | null;
  rates: {
    monthlyCents: number;
    annualCents: number;
    trialDays: number;
    annualAvailable: boolean;
  };
  /** Rolled-up estimates for the current headcount, in cents. */
  estimate: { monthlyCents: number; annualCents: number };
  stripeConfigured: boolean;
  transactions: BillingTransactionRow[];
}

// ── API shape of GET /api/school/billing/plan (lib/server/billing/summary.ts) ──
// The lightweight subset the school shell needs on every page (sidebar plan
// card): 2 queries instead of the summary's 6. Field semantics = BillingSummary.

export interface PlanSnapshot {
  plan: PlanKey;
  subscribedPlan: PlanKey | null;
  status: BillingSummary['status'];
  stripeStatus: string | null;
  managedByStripe: boolean;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  renewsAt: string | null;
  studentCount: number;
  studentHardLimit: number | null;
  stripeConfigured: boolean;
}

/** The snapshot is a strict subset of the summary — derive it client-side after a summary load/patch. */
export function toPlanSnapshot(b: BillingSummary): PlanSnapshot {
  return {
    plan: b.plan,
    subscribedPlan: b.subscribedPlan,
    status: b.status,
    stripeStatus: b.stripeStatus,
    managedByStripe: b.managedByStripe,
    cancelAtPeriodEnd: b.cancelAtPeriodEnd,
    trialEndsAt: b.trialEndsAt,
    renewsAt: b.renewsAt,
    studentCount: b.studentCount,
    studentHardLimit: b.studentHardLimit,
    stripeConfigured: b.stripeConfigured,
  };
}

export interface BillingTransactionRow {
  id: string;
  reference: string;
  amountCents: number;
  method: 'STRIPE' | 'MANUAL' | 'BANK_TRANSFER';
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'REFUNDED';
  paidAt: string;
  periodStart: string;
  invoiceUrl: string | null;
}
