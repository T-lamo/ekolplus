import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

const findMany = vi.fn();
vi.mock('@/lib/server/prisma', () => ({ prisma: { subscription: { findMany } } }));

const subscriptionsRetrieve = vi.fn();
vi.mock('@/lib/server/billing/stripe-client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/server/billing/stripe-client')>();
  return { ...mod, getStripe: () => ({ subscriptions: { retrieve: subscriptionsRetrieve } }) };
});

const syncSubscriptionFromStripe = vi.fn();
const syncSeatQuantity = vi.fn();
const findOpenSubscription = vi.fn();
const syncCustomerEmail = vi.fn();
vi.mock('@/lib/server/billing/stripe', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/server/billing/stripe')>();
  return {
    ...mod,
    syncSubscriptionFromStripe,
    syncSeatQuantity,
    findOpenSubscription,
    syncCustomerEmail,
  };
});

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
  findMany.mockReset();
  subscriptionsRetrieve.mockReset();
  syncSubscriptionFromStripe.mockReset();
  syncSeatQuantity.mockReset();
  findOpenSubscription.mockReset();
  syncCustomerEmail.mockReset();
  findOpenSubscription.mockResolvedValue(null);
  syncCustomerEmail.mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/stripe-sync', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

function stripeSub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    items: { data: [{ id: 'si_1', quantity: 120 }] },
    ...over,
  };
}

describe('POST /api/cron/stripe-sync', () => {
  it('401 when verifyCronSecret fails', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    expect((await POST(makeReq())).status).toBe(401);
  });

  it('no-ops with skipped:STRIPE_NOT_CONFIGURED when the key is absent', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(await res.json()).toEqual({ ok: true, skipped: 'STRIPE_NOT_CONFIGURED', processed: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('re-syncs every Stripe-linked subscription and aligns seats on billable ones', async () => {
    findMany.mockResolvedValueOnce([
      {
        id: 'row_1',
        schoolId: 's1',
        stripeSubscriptionId: 'sub_1',
        school: { stripeCustomerId: 'cus_1' },
      },
      {
        id: 'row_2',
        schoolId: 's2',
        stripeSubscriptionId: 'sub_2',
        school: { stripeCustomerId: 'cus_2' },
      },
    ]);
    subscriptionsRetrieve
      .mockResolvedValueOnce(stripeSub())
      .mockResolvedValueOnce(stripeSub({ id: 'sub_2', status: 'canceled' }));
    syncSeatQuantity.mockResolvedValueOnce(125);
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(await res.json()).toEqual({ ok: true, processed: 2, seatUpdates: 1, failed: 0 });
    expect(syncSubscriptionFromStripe).toHaveBeenCalledTimes(2);
    // Only the billable (active) one gets its seats aligned; the canceled one is skipped.
    expect(syncSeatQuantity).toHaveBeenCalledTimes(1);
    expect(syncSeatQuantity).toHaveBeenCalledWith(expect.anything(), {
      id: 'row_1',
      schoolId: 's1',
      stripeSubscriptionId: 'sub_1',
      stripeSubscriptionItemId: 'si_1',
      billedSeats: 120,
    });
  });

  it('realigns the Customer email on every school and flags a duplicate open subscription', async () => {
    findMany.mockResolvedValueOnce([
      {
        id: 'row_1',
        schoolId: 's1',
        stripeSubscriptionId: 'sub_1',
        school: { stripeCustomerId: 'cus_1' },
      },
    ]);
    subscriptionsRetrieve.mockResolvedValueOnce(stripeSub());
    findOpenSubscription.mockResolvedValueOnce(stripeSub({ id: 'sub_dup', status: 'active' }));
    syncSeatQuantity.mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(await res.json()).toEqual({ ok: true, processed: 1, seatUpdates: 0, failed: 0 });
    expect(syncCustomerEmail).toHaveBeenCalledWith(expect.anything(), {
      schoolId: 's1',
      customerId: 'cus_1',
    });
    expect(findOpenSubscription).toHaveBeenCalledWith('cus_1');
  });

  it('one broken subscription does not block the others', async () => {
    findMany.mockResolvedValueOnce([
      {
        id: 'row_1',
        schoolId: 's1',
        stripeSubscriptionId: 'sub_1',
        school: { stripeCustomerId: 'cus_1' },
      },
      {
        id: 'row_2',
        schoolId: 's2',
        stripeSubscriptionId: 'sub_2',
        school: { stripeCustomerId: 'cus_2' },
      },
    ]);
    subscriptionsRetrieve
      .mockRejectedValueOnce(new Error('No such subscription'))
      .mockResolvedValueOnce(stripeSub({ id: 'sub_2' }));
    syncSeatQuantity.mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(await res.json()).toEqual({ ok: true, processed: 1, seatUpdates: 0, failed: 1 });
  });
});
