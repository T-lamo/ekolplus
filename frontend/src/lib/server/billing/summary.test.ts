import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
  vi.stubEnv('STRIPE_PRICE_ID_PRO_ANNUAL', 'price_year');
});
afterEach(() => vi.unstubAllEnvs());

/** Minimal Pro subscription row as Prisma returns it (Dates, nullable Stripe fields). */
function subRow(over: Record<string, unknown> = {}) {
  return {
    status: 'ACTIVE',
    stripeStatus: null,
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
    renewsAt: new Date('2026-09-01T00:00:00Z'),
    trialEndsAt: null,
    plan: { key: 'PRO' },
    ...over,
  };
}

function makeDb(over: { sub?: unknown; students?: number } = {}) {
  return {
    subscription: { findUnique: vi.fn(async () => over.sub ?? null) },
    student: { count: vi.fn(async () => over.students ?? 0) },
    teacher: { count: vi.fn(async () => 8) },
    class: { count: vi.fn(async () => 6) },
    organizationMember: { count: vi.fn(async () => 2) },
    billingTransaction: { findMany: vi.fn(async () => []) },
  };
}

describe('effectivePlanKey', () => {
  it('no row → STARTER ; CANCELED/EXPIRED → STARTER ; else the plan key', async () => {
    const { effectivePlanKey } = await import('./summary');
    expect(effectivePlanKey(null)).toBe('STARTER');
    expect(effectivePlanKey({ status: 'CANCELED', plan: { key: 'PRO' } })).toBe('STARTER');
    expect(effectivePlanKey({ status: 'EXPIRED', plan: { key: 'PRO' } })).toBe('STARTER');
    // Unpaid / paused / back-office suspension → Starter rules until regularised.
    expect(effectivePlanKey({ status: 'SUSPENDED', plan: { key: 'PRO' } })).toBe('STARTER');
    expect(effectivePlanKey({ status: 'ACTIVE', plan: { key: 'PRO' } })).toBe('PRO');
    expect(effectivePlanKey({ status: 'TRIAL', plan: { key: 'ENTERPRISE' } })).toBe('ENTERPRISE');
    // Legacy/unknown key never crashes the UI.
    expect(effectivePlanKey({ status: 'ACTIVE', plan: { key: 'ESSENTIEL' } })).toBe('STARTER');
  });
});

describe('checkStudentLimit', () => {
  it('blocks the 51st student on Starter, never on Pro', async () => {
    const { checkStudentLimit } = await import('./summary');
    expect(await checkStudentLimit(makeDb({ students: 49 }) as never, 's1')).toMatchObject({
      allowed: true,
      plan: 'STARTER',
      limit: 50,
    });
    expect(await checkStudentLimit(makeDb({ students: 50 }) as never, 's1')).toMatchObject({
      allowed: false,
      plan: 'STARTER',
      limit: 50,
      studentCount: 50,
    });
    const pro = makeDb({ students: 5000, sub: subRow({ status: 'ACTIVE' }) });
    expect(await checkStudentLimit(pro as never, 's1')).toMatchObject({
      allowed: true,
      limit: null,
    });
  });

  it('a canceled Pro subscription is capped like Starter again', async () => {
    const { checkStudentLimit } = await import('./summary');
    const db = makeDb({ students: 80, sub: subRow({ status: 'CANCELED' }) });
    expect(await checkStudentLimit(db as never, 's1')).toMatchObject({
      allowed: false,
      plan: 'STARTER',
    });
  });

  it('a suspended (unpaid) Pro subscription is capped like Starter too', async () => {
    const { checkStudentLimit } = await import('./summary');
    const db = makeDb({
      students: 80,
      sub: subRow({ status: 'SUSPENDED', stripeStatus: 'unpaid', stripeSubscriptionId: 'sub_1' }),
    });
    expect(await checkStudentLimit(db as never, 's1')).toMatchObject({
      allowed: false,
      plan: 'STARTER',
      limit: 50,
    });
  });
});

describe('getPlanSnapshot', () => {
  it('Starter school without a row: free plan, cap 50, headcount, Stripe flag', async () => {
    const { getPlanSnapshot } = await import('./summary');
    const db = makeDb({ students: 42 });
    expect(await getPlanSnapshot(db as never, 's1')).toEqual({
      plan: 'STARTER',
      subscribedPlan: null,
      status: null,
      stripeStatus: null,
      managedByStripe: false,
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      renewsAt: null,
      studentCount: 42,
      studentHardLimit: 50,
      stripeConfigured: true,
    });
    // Only the two cheap queries — never the summary's counts/transactions.
    expect(db.subscription.findUnique).toHaveBeenCalledTimes(1);
    expect(db.student.count).toHaveBeenCalledTimes(1);
    expect(db.teacher.count).not.toHaveBeenCalled();
    expect(db.billingTransaction.findMany).not.toHaveBeenCalled();
  });

  it('Stripe-managed Pro trial: dates serialised, no hard limit', async () => {
    const { getPlanSnapshot } = await import('./summary');
    const db = makeDb({
      students: 42,
      sub: subRow({
        status: 'TRIAL',
        stripeStatus: 'trialing',
        stripeSubscriptionId: 'sub_1',
        trialEndsAt: new Date('2026-09-17T00:00:00Z'),
        renewsAt: new Date('2026-09-17T00:00:00Z'),
      }),
    });
    expect(await getPlanSnapshot(db as never, 's1')).toMatchObject({
      plan: 'PRO',
      subscribedPlan: 'PRO',
      status: 'TRIAL',
      stripeStatus: 'trialing',
      managedByStripe: true,
      trialEndsAt: '2026-09-17T00:00:00.000Z',
      renewsAt: '2026-09-17T00:00:00.000Z',
      studentHardLimit: null,
    });
  });

  it('a canceled Pro row reads as Starter (cap back to 50) but keeps subscribedPlan=PRO', async () => {
    const { getPlanSnapshot } = await import('./summary');
    const db = makeDb({
      students: 62,
      sub: subRow({ status: 'CANCELED', stripeSubscriptionId: 'sub_1' }),
    });
    expect(await getPlanSnapshot(db as never, 's1')).toMatchObject({
      plan: 'STARTER',
      subscribedPlan: 'PRO',
      status: 'CANCELED',
      studentCount: 62,
      studentHardLimit: 50,
    });
  });

  it('reports stripeConfigured=false when the secret key is absent', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const { getPlanSnapshot } = await import('./summary');
    expect(await getPlanSnapshot(makeDb() as never, 's1')).toMatchObject({
      stripeConfigured: false,
    });
  });
});

describe('getBillingSummary', () => {
  it('Starter school without a row: free plan, hard limit 50, estimates from headcount', async () => {
    const { getBillingSummary } = await import('./summary');
    const s = await getBillingSummary(makeDb({ students: 40 }) as never, 's1');
    expect(s).toMatchObject({
      plan: 'STARTER',
      subscribedPlan: null,
      status: null,
      managedByStripe: false,
      hasStripeCustomer: false,
      studentCount: 40,
      usage: { students: 40, teachers: 8, classes: 6, admins: 2 },
      studentHardLimit: 50,
      studentSoftLimit: null,
      rates: { monthlyCents: 60, annualCents: 648, trialDays: 30, annualAvailable: true },
      estimate: { monthlyCents: 2400, annualCents: 25920 },
      stripeConfigured: true,
      transactions: [],
    });
  });

  it('Stripe-managed Pro school: soft limit 1000, stripe flags, ISO dates', async () => {
    const { getBillingSummary } = await import('./summary');
    const renews = new Date('2026-09-01T00:00:00Z');
    const db = makeDb({
      students: 300,
      sub: {
        status: 'ACTIVE',
        stripeStatus: 'past_due',
        stripeSubscriptionId: 'sub_1',
        billingInterval: 'YEAR',
        cancelAtPeriodEnd: true,
        renewsAt: renews,
        trialEndsAt: null,
        startedAt: new Date('2026-01-01T00:00:00Z'),
        billedSeats: 290,
        plan: { key: 'PRO' },
        school: { stripeCustomerId: 'cus_1' },
      },
    });
    const s = await getBillingSummary(db as never, 's1');
    expect(s).toMatchObject({
      plan: 'PRO',
      subscribedPlan: 'PRO',
      status: 'ACTIVE',
      stripeStatus: 'past_due',
      managedByStripe: true,
      hasStripeCustomer: true,
      billingInterval: 'YEAR',
      cancelAtPeriodEnd: true,
      renewsAt: '2026-09-01T00:00:00.000Z',
      billedSeats: 290,
      studentHardLimit: null,
      studentSoftLimit: 1000,
    });
  });
});
