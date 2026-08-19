// Admin coupons ↔ Stripe mirror.
//
// A coupon created in /admin/billing/coupons must be redeemable AS-IS on the
// hosted Checkout page (createCheckoutSession sets `allow_promotion_codes`).
// Stripe models that as two objects: a Coupon (the discount terms) and a
// Promotion Code (the customer-facing code + max uses / expiry / customer
// restriction). Both are immutable apart from the Promotion Code's `active`
// flag, so editing a coupon's terms REPLACES the pair (old code deactivated
// first — Stripe refuses two active codes with the same text — then the old
// Coupon deleted, which also stops any remaining redemption of it; already
// applied discounts are untouched by Stripe's rules).
//
// Only the Pro plan is billed through Stripe (Starter is free, Enterprise is
// invoiced by hand): a coupon restricted to another plan is kept back-office
// only (no Stripe pair), so the code cannot be typed on the Pro checkout.
//
// Nothing here writes the Coupon row — callers persist the returned ids in
// their own transaction (route: DB write after a successful Stripe round
// trip; script: backfill). The only side effect on the DB is the school's
// Stripe Customer, created lazily for a school-restricted code.
import 'server-only';
import type Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import { createLogger } from '@/lib/server/logger';
import { getStripe, isStripeConfigured } from './stripe-client';
import { getOrCreateCustomer, type Db } from './stripe';

const log = createLogger();

/** `SubscriptionPlan.key` of the only plan sold through Stripe Checkout. */
const STRIPE_BILLED_PLAN_KEY = 'PRO';

/** Columns the Stripe mirror needs — pass to `prisma.coupon.find*({ select })`. */
export const COUPON_STRIPE_SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  durationMonths: true,
  maxUses: true,
  expiresAt: true,
  active: true,
  plan: { select: { key: true } },
  school: { select: { id: true, name: true, stripeCustomerId: true, officialEmail: true } },
  stripeCouponId: true,
  stripePromotionCodeId: true,
} as const satisfies Prisma.CouponSelect;

export type CouponStripeView = Prisma.CouponGetPayload<{ select: typeof COUPON_STRIPE_SELECT }>;

export type StripeCouponSyncAction =
  | 'created'
  | 'replaced'
  | 'toggled'
  | 'removed'
  | 'unchanged'
  | 'skipped';

export interface StripeCouponSyncResult {
  stripeCouponId: string | null;
  stripePromotionCodeId: string | null;
  action: StripeCouponSyncAction;
}

/** Whether a coupon scoped to `planKey` (null = all plans) can be typed on Checkout. */
export function isStripeRedeemablePlan(planKey: string | null): boolean {
  return planKey === null || planKey === STRIPE_BILLED_PLAN_KEY;
}

/** Discount terms → Stripe Coupon. Amounts are USD cents (schema invariant). */
export function stripeCouponParams(c: CouponStripeView): Stripe.CouponCreateParams {
  const base: Stripe.CouponCreateParams = {
    name: c.code,
    metadata: { couponId: c.id, code: c.code },
  };
  if (c.type === 'FREE_MONTH') {
    // N free months = 100 % off, repeating for N months.
    return { ...base, percent_off: 100, duration: 'repeating', duration_in_months: c.value };
  }
  const duration: Pick<Stripe.CouponCreateParams, 'duration' | 'duration_in_months'> =
    c.durationMonths === null
      ? { duration: 'forever' }
      : { duration: 'repeating', duration_in_months: c.durationMonths };
  if (c.type === 'PERCENT') return { ...base, percent_off: c.value, ...duration };
  return { ...base, amount_off: c.value, currency: 'usd', ...duration };
}

/** Code + limits → Stripe Promotion Code bound to `stripeCouponId`. */
export function stripePromotionCodeParams(
  c: CouponStripeView,
  stripeCouponId: string,
  customerId: string | null,
): Stripe.PromotionCodeCreateParams {
  return {
    promotion: { type: 'coupon', coupon: stripeCouponId },
    code: c.code,
    active: c.active,
    ...(c.maxUses !== null ? { max_redemptions: c.maxUses } : {}),
    ...(c.expiresAt ? { expires_at: Math.floor(c.expiresAt.getTime() / 1000) } : {}),
    ...(customerId ? { customer: customerId } : {}),
    metadata: { couponId: c.id },
  };
}

/**
 * Everything Stripe cannot change in place. Two coupons with the same
 * fingerprint map to identical Stripe objects; a different fingerprint means
 * the pair must be replaced. `active` and `description` are deliberately
 * left out (toggle / no Stripe effect).
 */
export function stripeCouponFingerprint(c: CouponStripeView): string {
  return JSON.stringify([
    c.code,
    c.type,
    c.value,
    c.durationMonths,
    c.maxUses,
    c.expiresAt ? c.expiresAt.toISOString() : null,
    c.school?.id ?? null,
    c.plan?.key ?? null,
  ]);
}

function isResourceMissing(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'resource_missing'
  );
}

async function createStripePair(
  db: Db,
  c: CouponStripeView,
): Promise<{ stripeCouponId: string; stripePromotionCodeId: string }> {
  const stripe = getStripe();
  // A school-restricted code is bound to that school's Customer — created
  // now if the school never reached checkout (same helper checkout uses, so
  // the id is reused there).
  const customerId = c.school ? await getOrCreateCustomer(db, c.school, null) : null;
  const stripeCoupon = await stripe.coupons.create(stripeCouponParams(c));
  try {
    const promo = await stripe.promotionCodes.create(
      stripePromotionCodeParams(c, stripeCoupon.id, customerId),
    );
    return { stripeCouponId: stripeCoupon.id, stripePromotionCodeId: promo.id };
  } catch (err) {
    // Don't leave a code-less Coupon behind (it would still be applicable
    // by id from the Dashboard and would collide on the next attempt).
    await stripe.coupons.del(stripeCoupon.id).catch(() => undefined);
    throw err;
  }
}

/**
 * Deactivate the Promotion Code and delete the Coupon on Stripe. Missing
 * objects (already deleted from the Dashboard, or the DB was pointed at a
 * different Stripe account) are not an error.
 */
export async function removeStripeCoupon(
  c: Pick<CouponStripeView, 'id' | 'stripeCouponId' | 'stripePromotionCodeId'>,
): Promise<void> {
  const stripe = getStripe();
  if (c.stripePromotionCodeId) {
    try {
      await stripe.promotionCodes.update(c.stripePromotionCodeId, { active: false });
    } catch (err) {
      if (!isResourceMissing(err)) throw err;
    }
  }
  if (c.stripeCouponId) {
    try {
      await stripe.coupons.del(c.stripeCouponId);
    } catch (err) {
      if (!isResourceMissing(err)) throw err;
      log.warn('stripe coupon already gone', { couponId: c.id, stripeCouponId: c.stripeCouponId });
    }
  }
}

/**
 * Bring Stripe in line with the coupon's intended state. `after` is the
 * state to mirror (ids on it = the currently stored Stripe ids); `before` is
 * the previous state (null on creation / backfill). Returns the ids the
 * caller must persist. Throws on Stripe errors — callers decide whether the
 * admin request fails (PATCH/DELETE: yes, nothing written) or degrades
 * (POST: row kept, flagged unsynced).
 */
export async function reconcileStripeCoupon(
  db: Db,
  after: CouponStripeView,
  before: CouponStripeView | null,
): Promise<StripeCouponSyncResult> {
  const ids = {
    stripeCouponId: after.stripeCouponId,
    stripePromotionCodeId: after.stripePromotionCodeId,
  };
  if (!isStripeConfigured()) return { ...ids, action: 'skipped' };

  const synced = Boolean(after.stripeCouponId && after.stripePromotionCodeId);
  if (!isStripeRedeemablePlan(after.plan?.key ?? null)) {
    if (!synced) return { ...ids, action: 'skipped' };
    await removeStripeCoupon(after);
    return { stripeCouponId: null, stripePromotionCodeId: null, action: 'removed' };
  }
  if (!synced) {
    const created = await createStripePair(db, after);
    return { ...created, action: 'created' };
  }
  if (before && stripeCouponFingerprint(before) !== stripeCouponFingerprint(after)) {
    await removeStripeCoupon(after);
    const created = await createStripePair(db, after);
    return { ...created, action: 'replaced' };
  }
  if (before && before.active !== after.active) {
    await getStripe().promotionCodes.update(after.stripePromotionCodeId!, { active: after.active });
    return { ...ids, action: 'toggled' };
  }
  return { ...ids, action: 'unchanged' };
}
