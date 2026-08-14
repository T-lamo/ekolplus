import { describe, expect, it } from 'vitest';
import {
  lastNMonths,
  bucketByMonth,
  pctDelta,
  couponStatus,
  subscriptionMonthlyCents,
  monthsSince,
} from './saas-metrics';

const NOW = new Date('2026-08-14T12:00:00Z');

describe('lastNMonths', () => {
  it('returns N months ending with the current one, oldest first', () => {
    const months = lastNMonths(NOW, 6);
    expect(months).toHaveLength(6);
    expect(months[0]!.label).toBe('Mar');
    expect(months[5]!.label).toBe('Août');
    expect(months[5]!.year).toBe(2026);
  });

  it('crosses year boundaries', () => {
    const months = lastNMonths(new Date('2026-02-10T00:00:00Z'), 4);
    expect(months.map((m) => m.label)).toEqual(['Nov', 'Déc', 'Jan', 'Fév']);
    expect(months[0]!.year).toBe(2025);
    expect(months[3]!.year).toBe(2026);
  });
});

describe('bucketByMonth', () => {
  it('sums amounts into their month buckets and zero-fills the rest', () => {
    const months = lastNMonths(NOW, 3); // Juin, Juil, Août 2026
    const rows = [
      { paidAt: new Date('2026-06-05'), amountCents: 1000 },
      { paidAt: new Date('2026-06-20'), amountCents: 500 },
      { paidAt: new Date('2026-08-01'), amountCents: 200 },
      // refund lands negative in its month
      { paidAt: new Date('2026-08-02'), amountCents: -50 },
      // outside the window — ignored
      { paidAt: new Date('2026-01-01'), amountCents: 9999 },
    ];
    expect(bucketByMonth(rows, months).map((b) => b.cents)).toEqual([1500, 0, 150]);
  });
});

describe('pctDelta', () => {
  it('computes a rounded percent delta', () => {
    expect(pctDelta(118, 100)).toBe(18);
    expect(pctDelta(90, 100)).toBe(-10);
  });
  it('is null when the base is 0 (no fabricated +∞)', () => {
    expect(pctDelta(50, 0)).toBeNull();
  });
});

describe('couponStatus', () => {
  const base = {
    active: true,
    expiresAt: null as Date | null,
    maxUses: null as number | null,
    usedCount: 0,
  };
  it('EXPIRED when past expiry', () => {
    expect(couponStatus({ ...base, expiresAt: new Date('2026-01-01') }, NOW)).toBe('EXPIRED');
  });
  it('EXHAUSTED when uses are consumed', () => {
    expect(couponStatus({ ...base, maxUses: 10, usedCount: 10 }, NOW)).toBe('EXHAUSTED');
  });
  it('EXPIRING within 30 days of expiry', () => {
    expect(couponStatus({ ...base, expiresAt: new Date('2026-08-30') }, NOW)).toBe('EXPIRING');
  });
  it('ACTIVE otherwise, INACTIVE when disabled', () => {
    expect(couponStatus(base, NOW)).toBe('ACTIVE');
    expect(couponStatus({ ...base, active: false }, NOW)).toBe('INACTIVE');
  });
});

describe('monthsSince', () => {
  it('counts whole calendar months elapsed', () => {
    expect(monthsSince(new Date('2026-06-14'), NOW)).toBe(2);
    expect(monthsSince(new Date('2026-08-01'), NOW)).toBe(0);
  });
});

describe('subscriptionMonthlyCents', () => {
  it('multiplies students by the plan unit price', () => {
    expect(
      subscriptionMonthlyCents({
        students: 487,
        priceCents: 80,
        coupon: null,
        monthsSinceStart: 0,
      }),
    ).toBe(38960);
  });
  it('applies a PERCENT coupon during its duration window', () => {
    const coupon = { type: 'PERCENT' as const, value: 25, durationMonths: 3 };
    expect(
      subscriptionMonthlyCents({ students: 100, priceCents: 50, coupon, monthsSinceStart: 2 }),
    ).toBe(3750);
    // window over → full price
    expect(
      subscriptionMonthlyCents({ students: 100, priceCents: 50, coupon, monthsSinceStart: 3 }),
    ).toBe(5000);
  });
  it('applies a permanent coupon regardless of elapsed months', () => {
    const coupon = { type: 'PERCENT' as const, value: 10, durationMonths: null };
    expect(
      subscriptionMonthlyCents({ students: 100, priceCents: 50, coupon, monthsSinceStart: 48 }),
    ).toBe(4500);
  });
  it('FIXED subtracts cents, floored at 0', () => {
    const coupon = { type: 'FIXED' as const, value: 10000, durationMonths: 1 };
    expect(
      subscriptionMonthlyCents({ students: 100, priceCents: 50, coupon, monthsSinceStart: 0 }),
    ).toBe(0);
  });
  it('FREE_MONTH zeroes the amount during the free window', () => {
    const coupon = { type: 'FREE_MONTH' as const, value: 1, durationMonths: null };
    expect(
      subscriptionMonthlyCents({ students: 100, priceCents: 50, coupon, monthsSinceStart: 0 }),
    ).toBe(0);
    expect(
      subscriptionMonthlyCents({ students: 100, priceCents: 50, coupon, monthsSinceStart: 1 }),
    ).toBe(5000);
  });
});
