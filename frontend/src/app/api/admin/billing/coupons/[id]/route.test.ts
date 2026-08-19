// /api/admin/billing/coupons/[id] — PATCH/DELETE, focused on the Stripe
// ordering contract: Stripe is reconciled BEFORE the DB write, a Stripe
// failure is a 502 that leaves the row untouched, `PATCH {}` is the explicit
// « Synchroniser avec Stripe », DELETE removes the Stripe pair first.
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
vi.mock('@/lib/server/billing/coupons', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/billing/coupons')>(
    '@/lib/server/billing/coupons',
  );
  return { ...actual, reconcileStripeCoupon: vi.fn(), removeStripeCoupon: vi.fn() };
});

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { reconcileStripeCoupon, removeStripeCoupon } from '@/lib/server/billing/coupons';
import { DELETE, PATCH } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockReconcile = vi.mocked(reconcileStripeCoupon);
const mockRemove = vi.mocked(removeStripeCoupon);
const mockAudit = vi.mocked(logAdminAction);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

const existing = {
  id: 'c1',
  code: 'WELCOME20',
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
};

function patch(id: string, body: unknown): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/admin/billing/coupons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id }) },
  ];
}

function del(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/admin/billing/coupons/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) },
  ];
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
  prismaMock.coupon.update.mockResolvedValue({ id: 'c1' } as never);
});

describe('PATCH /api/admin/billing/coupons/[id]', () => {
  it('`PATCH {}` mirrors an unsynced coupon and persists the ids (Synchroniser avec Stripe)', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue(existing as never);
    mockReconcile.mockResolvedValue({
      stripeCouponId: 'cpn_1',
      stripePromotionCodeId: 'promo_1',
      action: 'created',
    });

    const res = await PATCH(...patch('c1', {}));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stripe: { synced: boolean; action: string } };
    expect(body.stripe).toEqual({ synced: true, action: 'created' });
    expect(mockReconcile).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ id: 'c1', code: 'WELCOME20' }),
      existing,
    );
    expect(prismaMock.coupon.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { stripeCouponId: 'cpn_1', stripePromotionCodeId: 'promo_1' },
    });
    expect(mockAudit).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        action: 'billing.coupon_update',
        metadata: expect.objectContaining({ stripe: 'created' }),
      }),
    );
  });

  it('hands Stripe the intended state (new terms + plan) before writing the DB', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue({
      ...existing,
      stripeCouponId: 'cpn_old',
      stripePromotionCodeId: 'promo_old',
    } as never);
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue({ id: 'p_pro', key: 'PRO' } as never);
    mockReconcile.mockResolvedValue({
      stripeCouponId: 'cpn_new',
      stripePromotionCodeId: 'promo_new',
      action: 'replaced',
    });

    const res = await PATCH(...patch('c1', { value: 30, planKey: 'PRO', maxUses: 10 }));
    expect(res.status).toBe(200);
    const after = mockReconcile.mock.calls[0]?.[1];
    expect(after).toMatchObject({ value: 30, maxUses: 10, plan: { key: 'PRO' } });
    expect(prismaMock.coupon.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({
        value: 30,
        maxUses: 10,
        planId: 'p_pro',
        stripeCouponId: 'cpn_new',
        stripePromotionCodeId: 'promo_new',
      }),
    });
  });

  it('returns 502 STRIPE_ERROR and writes nothing when Stripe refuses', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue(existing as never);
    mockReconcile.mockRejectedValue(new Error('rate limited'));

    const res = await PATCH(...patch('c1', { active: false }));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('STRIPE_ERROR');
    expect(body.message).toMatch(/rate limited/);
    expect(prismaMock.coupon.update).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('refuses an unknown school scope before touching Stripe (404 SCHOOL_NOT_FOUND)', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue(existing as never);
    prismaMock.school.findUnique.mockResolvedValue(null as never);

    const res = await PATCH(...patch('c1', { schoolId: 'ghost' }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('SCHOOL_NOT_FOUND');
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('404s on a missing coupon', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue(null as never);
    const res = await PATCH(...patch('nope', {}));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/billing/coupons/[id]', () => {
  it('removes the Stripe pair first, then the row', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue({
      id: 'c1',
      code: 'WELCOME20',
      stripeCouponId: 'cpn_1',
      stripePromotionCodeId: 'promo_1',
      _count: { subscriptions: 0 },
    } as never);
    mockRemove.mockResolvedValue(undefined);
    prismaMock.coupon.delete.mockResolvedValue({} as never);

    const res = await DELETE(...del('c1'));
    expect(res.status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCouponId: 'cpn_1', stripePromotionCodeId: 'promo_1' }),
    );
    expect(prismaMock.coupon.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('keeps the row (502) when the Stripe pair cannot be removed', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue({
      id: 'c1',
      code: 'WELCOME20',
      stripeCouponId: 'cpn_1',
      stripePromotionCodeId: 'promo_1',
      _count: { subscriptions: 0 },
    } as never);
    mockRemove.mockRejectedValue(new Error('boom'));

    const res = await DELETE(...del('c1'));
    expect(res.status).toBe(502);
    expect(prismaMock.coupon.delete).not.toHaveBeenCalled();
  });

  it('never calls Stripe for a coupon that was never mirrored', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue({
      id: 'c1',
      code: 'LOCAL',
      stripeCouponId: null,
      stripePromotionCodeId: null,
      _count: { subscriptions: 0 },
    } as never);
    prismaMock.coupon.delete.mockResolvedValue({} as never);

    const res = await DELETE(...del('c1'));
    expect(res.status).toBe(200);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('refuses to delete a coupon attached to subscriptions (409) without touching Stripe', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue({
      id: 'c1',
      code: 'WELCOME20',
      stripeCouponId: 'cpn_1',
      stripePromotionCodeId: 'promo_1',
      _count: { subscriptions: 2 },
    } as never);

    const res = await DELETE(...del('c1'));
    expect(res.status).toBe(409);
    expect(mockRemove).not.toHaveBeenCalled();
    expect(prismaMock.coupon.delete).not.toHaveBeenCalled();
  });
});
