// /api/admin/billing/coupons — list + create, focused on the Stripe mirror
// wiring (lib/server/billing/coupons.ts is unit-tested on its own):
//   · GET exposes `stripe: { synced, redeemable }` per row + `stripeConfigured`
//   · POST mirrors AFTER the row exists and persists both Stripe ids
//   · POST keeps the row and flags it unsynced when Stripe fails (no 5xx)
//   · POST refuses a code outside the Stripe alphabet (400)
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/billing/stripe-client', () => ({
  isStripeConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/server/billing/coupons', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/billing/coupons')>(
    '@/lib/server/billing/coupons',
  );
  return { ...actual, reconcileStripeCoupon: vi.fn(), removeStripeCoupon: vi.fn() };
});

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { reconcileStripeCoupon } from '@/lib/server/billing/coupons';
import { GET, POST } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockReconcile = vi.mocked(reconcileStripeCoupon);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function listRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    code: 'WELCOME20',
    type: 'PERCENT',
    value: 20,
    durationMonths: null,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    active: true,
    description: null,
    plan: null,
    school: null,
    stripePromotionCodeId: 'promo_1',
    _count: { subscriptions: 0 },
    ...over,
  };
}

function post(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/billing/coupons', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/admin/billing/coupons', () => {
  it('exposes the Stripe state per row and whether Stripe is configured', async () => {
    prismaMock.coupon.count.mockResolvedValue(3);
    prismaMock.coupon.findMany
      // page rows
      .mockResolvedValueOnce([
        listRow(),
        listRow({ id: 'c2', code: 'PENDING', stripePromotionCodeId: null }),
        listRow({
          id: 'c3',
          code: 'STARTER10',
          stripePromotionCodeId: null,
          plan: { key: 'STARTER', name: 'Starter' },
        }),
      ] as never)
      // all coupons (stats)
      .mockResolvedValueOnce([] as never);
    prismaMock.coupon.aggregate.mockResolvedValue({ _sum: { usedCount: 0 } } as never);
    prismaMock.subscription.findMany.mockResolvedValue([] as never);

    const res = await GET(new NextRequest('http://test/api/admin/billing/coupons?page=1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stripeConfigured: boolean;
      items: { code: string; stripe: { synced: boolean; redeemable: boolean } }[];
    };
    expect(body.stripeConfigured).toBe(true);
    expect(body.items.map((i) => [i.code, i.stripe.synced, i.stripe.redeemable])).toEqual([
      ['WELCOME20', true, true],
      ['PENDING', false, true],
      ['STARTER10', false, false],
    ]);
  });
});

describe('POST /api/admin/billing/coupons', () => {
  const created = { id: 'c_new', code: 'NEW-20' };

  function arrangeCreate() {
    prismaMock.coupon.findUnique.mockResolvedValue(null as never);
    prismaMock.coupon.create.mockResolvedValue(created as never);
    prismaMock.coupon.findUniqueOrThrow.mockResolvedValue({
      ...created,
      type: 'PERCENT',
      value: 20,
      durationMonths: null,
      maxUses: null,
      expiresAt: null,
      active: true,
      plan: null,
      school: null,
      stripeCouponId: null,
      stripePromotionCodeId: null,
    } as never);
    prismaMock.coupon.update.mockResolvedValue({} as never);
  }

  it('creates the row, mirrors it on Stripe and persists both ids', async () => {
    arrangeCreate();
    mockReconcile.mockResolvedValue({
      stripeCouponId: 'cpn_1',
      stripePromotionCodeId: 'promo_1',
      action: 'created',
    });

    const res = await POST(post({ code: 'new-20', type: 'PERCENT', value: 20 }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { stripe: { synced: boolean } };
    expect(body.stripe).toEqual({ synced: true });
    // Row first (uppercased code), Stripe second, ids persisted last.
    expect(prismaMock.coupon.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'NEW-20' }) }),
    );
    expect(mockReconcile).toHaveBeenCalledWith(prismaMock, expect.anything(), null);
    expect(prismaMock.coupon.update).toHaveBeenCalledWith({
      where: { id: 'c_new' },
      data: { stripeCouponId: 'cpn_1', stripePromotionCodeId: 'promo_1' },
    });
  });

  it('keeps the row and reports the Stripe error instead of failing the request', async () => {
    arrangeCreate();
    mockReconcile.mockRejectedValue(new Error('Stripe down'));

    const res = await POST(post({ code: 'NEW-20', type: 'PERCENT', value: 20 }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { stripe: { synced: boolean; error?: string } };
    expect(body.stripe.synced).toBe(false);
    expect(body.stripe.error).toMatch(/Stripe down/);
    expect(prismaMock.coupon.update).not.toHaveBeenCalled();
  });

  it('does not push a coupon scoped to a non-Stripe plan (stays unsynced, no error)', async () => {
    arrangeCreate();
    mockReconcile.mockResolvedValue({
      stripeCouponId: null,
      stripePromotionCodeId: null,
      action: 'skipped',
    });

    const res = await POST(post({ code: 'NEW-20', type: 'PERCENT', value: 20 }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { stripe: { synced: boolean; error?: string } };
    expect(body.stripe).toEqual({ synced: false });
    expect(prismaMock.coupon.update).not.toHaveBeenCalled();
  });

  it('refuses a code Stripe could not accept (spaces / too short)', async () => {
    for (const code of ['HELLO WORLD', 'AB', 'ÉTÉ2026']) {
      const res = await POST(post({ code, type: 'PERCENT', value: 20 }));
      expect(res.status).toBe(400);
    }
    expect(prismaMock.coupon.create).not.toHaveBeenCalled();
  });
});
