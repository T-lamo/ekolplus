// Admin coupons ↔ Stripe mirror: the code typed in the back-office must be
// redeemable as-is on the hosted Checkout page. Pure mapping first (terms →
// Stripe Coupon, code/limits → Promotion Code), then the reconcile state
// machine against a mocked Stripe client.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const couponsCreate = vi.fn();
const couponsDel = vi.fn();
const promoCreate = vi.fn();
const promoUpdate = vi.fn();
const customersRetrieve = vi.fn();
const customersCreate = vi.fn();

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    coupons: { create: couponsCreate, del: couponsDel },
    promotionCodes: { create: promoCreate, update: promoUpdate },
    customers: { retrieve: customersRetrieve, create: customersCreate },
  })),
}));

import {
  isStripeRedeemablePlan,
  stripeCouponParams,
  stripePromotionCodeParams,
  stripeCouponFingerprint,
  reconcileStripeCoupon,
  removeStripeCoupon,
  type CouponStripeView,
} from './coupons';

function coupon(over: Partial<CouponStripeView> = {}): CouponStripeView {
  return {
    id: 'cp_1',
    code: 'RENTREE25',
    type: 'PERCENT',
    value: 25,
    durationMonths: null,
    maxUses: null,
    expiresAt: null,
    active: true,
    plan: null,
    school: null,
    stripeCouponId: null,
    stripePromotionCodeId: null,
    ...over,
  };
}

interface LooseMock {
  (...args: unknown[]): Promise<unknown>;
  mockResolvedValueOnce: (v: unknown) => LooseMock;
  mock: { calls: unknown[][] };
}
const fn = (impl?: (...args: never[]) => unknown): LooseMock =>
  vi.fn(impl as (...args: unknown[]) => unknown) as unknown as LooseMock;

function makeDb() {
  return {
    coupon: { update: fn(async (args: { data: unknown }) => args.data) },
    school: { update: fn(async () => ({})) },
  };
}

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
  couponsCreate.mockReset().mockResolvedValue({ id: 'stc_new' });
  couponsDel.mockReset().mockResolvedValue({ id: 'stc_old', deleted: true });
  promoCreate.mockReset().mockResolvedValue({ id: 'promo_new' });
  promoUpdate.mockReset().mockResolvedValue({ id: 'promo_old' });
  customersRetrieve.mockReset();
  customersCreate.mockReset().mockResolvedValue({ id: 'cus_new' });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isStripeRedeemablePlan', () => {
  it('all plans or the Stripe-billed Pro plan → redeemable; Starter/Enterprise → not', () => {
    expect(isStripeRedeemablePlan(null)).toBe(true);
    expect(isStripeRedeemablePlan('PRO')).toBe(true);
    expect(isStripeRedeemablePlan('STARTER')).toBe(false);
    expect(isStripeRedeemablePlan('ENTERPRISE')).toBe(false);
  });
});

describe('stripeCouponParams', () => {
  it('PERCENT without duration → percent_off forever', () => {
    expect(stripeCouponParams(coupon())).toMatchObject({
      name: 'RENTREE25',
      percent_off: 25,
      duration: 'forever',
      metadata: { couponId: 'cp_1', code: 'RENTREE25' },
    });
  });
  it('PERCENT for N months → repeating N', () => {
    expect(stripeCouponParams(coupon({ durationMonths: 3 }))).toMatchObject({
      percent_off: 25,
      duration: 'repeating',
      duration_in_months: 3,
    });
  });
  it('FIXED → amount_off in USD cents', () => {
    expect(
      stripeCouponParams(coupon({ type: 'FIXED', value: 5000, durationMonths: 1 })),
    ).toMatchObject({
      amount_off: 5000,
      currency: 'usd',
      duration: 'repeating',
      duration_in_months: 1,
    });
  });
  it('FREE_MONTH → 100 % for `value` months', () => {
    expect(stripeCouponParams(coupon({ type: 'FREE_MONTH', value: 2 }))).toMatchObject({
      percent_off: 100,
      duration: 'repeating',
      duration_in_months: 2,
    });
  });
});

describe('stripePromotionCodeParams', () => {
  it('carries the code, limits, expiry and customer restriction', () => {
    const expiresAt = new Date('2026-12-31T00:00:00Z');
    expect(
      stripePromotionCodeParams(
        coupon({ maxUses: 10, expiresAt, active: false }),
        'stc_1',
        'cus_9',
      ),
    ).toEqual({
      promotion: { type: 'coupon', coupon: 'stc_1' },
      code: 'RENTREE25',
      active: false,
      max_redemptions: 10,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      customer: 'cus_9',
      metadata: { couponId: 'cp_1' },
    });
  });
  it('omits the optional fields when unset', () => {
    expect(stripePromotionCodeParams(coupon(), 'stc_1', null)).toEqual({
      promotion: { type: 'coupon', coupon: 'stc_1' },
      code: 'RENTREE25',
      active: true,
      metadata: { couponId: 'cp_1' },
    });
  });
});

describe('stripeCouponFingerprint', () => {
  it('changes with any immutable Stripe field, not with description/active', () => {
    const base = stripeCouponFingerprint(coupon());
    expect(stripeCouponFingerprint(coupon({ active: false }))).toBe(base);
    expect(stripeCouponFingerprint(coupon({ value: 30 }))).not.toBe(base);
    expect(stripeCouponFingerprint(coupon({ maxUses: 5 }))).not.toBe(base);
    expect(stripeCouponFingerprint(coupon({ expiresAt: new Date() }))).not.toBe(base);
    expect(
      stripeCouponFingerprint(
        coupon({ school: { id: 's1', name: 'X', stripeCustomerId: 'cus_1', officialEmail: null } }),
      ),
    ).not.toBe(base);
  });
});

describe('reconcileStripeCoupon', () => {
  it('creates the Coupon + Promotion Code pair for a new redeemable coupon and returns both ids', async () => {
    const db = makeDb();
    const res = await reconcileStripeCoupon(
      db as unknown as Parameters<typeof reconcileStripeCoupon>[0],
      coupon(),
      null,
    );
    expect(res).toEqual({
      stripeCouponId: 'stc_new',
      stripePromotionCodeId: 'promo_new',
      action: 'created',
    });
    expect(couponsCreate).toHaveBeenCalledTimes(1);
    expect(promoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'RENTREE25',
        promotion: { type: 'coupon', coupon: 'stc_new' },
      }),
    );
    // No customer restriction → no Customer created, no DB write (the caller persists the ids).
    expect(customersCreate).not.toHaveBeenCalled();
    expect(db.coupon.update).not.toHaveBeenCalled();
  });

  it('cleans up the Coupon when the Promotion Code creation fails', async () => {
    promoCreate.mockRejectedValueOnce(new Error('code taken'));
    const db = makeDb();
    await expect(
      reconcileStripeCoupon(
        db as unknown as Parameters<typeof reconcileStripeCoupon>[0],
        coupon(),
        null,
      ),
    ).rejects.toThrow('code taken');
    expect(couponsDel).toHaveBeenCalledWith('stc_new');
  });

  it('does nothing when the Stripe key is absent (dev without keys)', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const db = makeDb();
    const res = await reconcileStripeCoupon(
      db as unknown as Parameters<typeof reconcileStripeCoupon>[0],
      coupon(),
      null,
    );
    expect(res).toEqual({ stripeCouponId: null, stripePromotionCodeId: null, action: 'skipped' });
    expect(couponsCreate).not.toHaveBeenCalled();
  });

  it('leaves an already-synced, unchanged coupon alone', async () => {
    const db = makeDb();
    const before = coupon({ stripeCouponId: 'stc_1', stripePromotionCodeId: 'promo_1' });
    const res = await reconcileStripeCoupon(
      db as unknown as Parameters<typeof reconcileStripeCoupon>[0],
      before,
      before,
    );
    expect(res.action).toBe('unchanged');
    expect(couponsCreate).not.toHaveBeenCalled();
    expect(promoUpdate).not.toHaveBeenCalled();
  });

  it('only toggles the Promotion Code when just `active` changed', async () => {
    const db = makeDb();
    const before = coupon({
      stripeCouponId: 'stc_1',
      stripePromotionCodeId: 'promo_1',
      active: true,
    });
    const after = { ...before, active: false };
    const res = await reconcileStripeCoupon(
      db as unknown as Parameters<typeof reconcileStripeCoupon>[0],
      after,
      before,
    );
    expect(res.action).toBe('toggled');
    expect(promoUpdate).toHaveBeenCalledWith('promo_1', { active: false });
    expect(couponsCreate).not.toHaveBeenCalled();
  });

  it('replaces the pair when a Stripe-immutable field changed (old code deactivated, old coupon deleted)', async () => {
    const db = makeDb();
    const before = coupon({ stripeCouponId: 'stc_1', stripePromotionCodeId: 'promo_1', value: 25 });
    const after = { ...before, value: 40 };
    const res = await reconcileStripeCoupon(
      db as unknown as Parameters<typeof reconcileStripeCoupon>[0],
      after,
      before,
    );
    expect(res).toEqual({
      stripeCouponId: 'stc_new',
      stripePromotionCodeId: 'promo_new',
      action: 'replaced',
    });
    // Old code released first (Stripe refuses two ACTIVE codes with the same text).
    expect(promoUpdate).toHaveBeenCalledWith('promo_1', { active: false });
    expect(couponsDel).toHaveBeenCalledWith('stc_1');
    expect(couponsCreate).toHaveBeenCalledWith(expect.objectContaining({ percent_off: 40 }));
  });

  it('restricts the Promotion Code to the school Customer, creating the Customer if needed', async () => {
    const db = makeDb();
    const school = {
      id: 'sch_1',
      name: 'École X',
      stripeCustomerId: null,
      officialEmail: 'x@ecole.ht',
    };
    await reconcileStripeCoupon(
      db as unknown as Parameters<typeof reconcileStripeCoupon>[0],
      coupon({ school }),
      null,
    );
    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { schoolId: 'sch_1' } }),
    );
    expect(promoCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_new' }));
  });

  it('removes the Stripe pair when the plan is no longer Stripe-billed', async () => {
    const db = makeDb();
    const before = coupon({ stripeCouponId: 'stc_1', stripePromotionCodeId: 'promo_1' });
    const after = { ...before, plan: { key: 'ENTERPRISE' } };
    const res = await reconcileStripeCoupon(
      db as unknown as Parameters<typeof reconcileStripeCoupon>[0],
      after,
      before,
    );
    expect(res).toEqual({ stripeCouponId: null, stripePromotionCodeId: null, action: 'removed' });
    expect(couponsDel).toHaveBeenCalledWith('stc_1');
  });
});

describe('removeStripeCoupon', () => {
  it('tolerates an already-deleted Stripe coupon (resource_missing)', async () => {
    couponsDel.mockRejectedValueOnce(
      Object.assign(new Error('gone'), { code: 'resource_missing' }),
    );
    await expect(
      removeStripeCoupon(coupon({ stripeCouponId: 'stc_1', stripePromotionCodeId: 'promo_1' })),
    ).resolves.toBeUndefined();
  });
  it('rethrows other Stripe errors', async () => {
    couponsDel.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'api_error' }));
    await expect(
      removeStripeCoupon(coupon({ stripeCouponId: 'stc_1', stripePromotionCodeId: 'promo_1' })),
    ).rejects.toThrow('boom');
  });
});
