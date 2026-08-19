// scripts/stripe-sync-coupons — backfill of admin coupons as Stripe
// Promotion Codes. Drives `main(args, deps)` with a Prisma stub and a fake
// reconcile (no network); the CLI guard keeps the auto-run inert under vitest.
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { main, type Deps } from './stripe-sync-coupons';
import type { CouponStripeView } from '../src/lib/server/billing/coupons';

function row(over: Partial<CouponStripeView> & { id: string; code: string }): CouponStripeView {
  return {
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
    ...over,
  } as CouponStripeView;
}

function deps(rows: CouponStripeView[], over: Partial<Deps> = {}) {
  const update = vi.fn(async () => ({}));
  const prisma = {
    coupon: { findMany: vi.fn(async () => rows), update },
    $disconnect: vi.fn(async () => undefined),
  } as unknown as Pick<PrismaClient, 'coupon' | '$disconnect'>;
  const reconcile = vi.fn(async (_db: unknown, after: CouponStripeView) => ({
    stripeCouponId: `cpn_${after.code}`,
    stripePromotionCodeId: `promo_${after.code}`,
    action: 'created' as const,
  }));
  const lines: string[] = [];
  return {
    update,
    reconcile,
    lines,
    deps: {
      prisma,
      reconcile,
      stripeConfigured: () => true,
      log: (l: string) => lines.push(l),
      ...over,
    } satisfies Deps,
  };
}

describe('stripe-sync-coupons', () => {
  it('refuses to run without Stripe credentials', async () => {
    const d = deps([], { stripeConfigured: () => false });
    await expect(main([], d.deps)).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });

  it('mirrors unsynced coupons and persists both ids', async () => {
    const d = deps([row({ id: 'c1', code: 'WELCOME20' }), row({ id: 'c2', code: 'PRO-ONLY' })]);
    const summary = await main([], d.deps);
    expect(summary.synced).toBe(2);
    expect(summary.failed).toBe(0);
    expect(d.reconcile).toHaveBeenCalledTimes(2);
    expect(d.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { stripeCouponId: 'cpn_WELCOME20', stripePromotionCodeId: 'promo_WELCOME20' },
    });
  });

  it('leaves coupons scoped to a non-Stripe plan alone', async () => {
    const d = deps([row({ id: 'c1', code: 'STARTER10', plan: { key: 'STARTER' } })]);
    const summary = await main([], d.deps);
    expect(summary.outcomes[0]?.result).toBe('not-redeemable');
    expect(d.reconcile).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it('--dry-run prints without touching Stripe or the DB', async () => {
    const d = deps([row({ id: 'c1', code: 'DRY' })]);
    const summary = await main(['--dry-run'], d.deps);
    expect(summary.outcomes[0]?.result).toBe('dry-run');
    expect(d.reconcile).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it('keeps going after a Stripe failure and reports it in the exit status', async () => {
    const d = deps([row({ id: 'c1', code: 'BAD' }), row({ id: 'c2', code: 'GOOD' })]);
    d.reconcile.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    const summary = await main([], d.deps);
    expect(summary.failed).toBe(1);
    expect(summary.synced).toBe(1);
    expect(summary.outcomes.map((o) => o.result)).toEqual(['failed', 'synced']);
    expect(d.lines.some((l) => l.includes('BAD') && l.includes('boom'))).toBe(true);
  });
});
