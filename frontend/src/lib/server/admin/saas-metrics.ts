// Pure SaaS-billing/statistics math shared by the admin stats + billing
// routes (Epic 2 — .planning/banani/epic-2-admin-foundation.md). Everything
// here is deliberately Prisma-free so it unit-tests without a DB; the route
// handlers do the queries and feed plain rows in.
//
// Money is integer USD cents throughout — never floats of dollars.
import 'server-only';

export interface MonthBucket {
  /** 0-based month in local time. */
  month: number;
  year: number;
  /** French short label — "Jan", "Fév", … matches the Banani mockups. */
  label: string;
}

const MONTH_LABELS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
] as const;

/** The N calendar months ending with `now`'s month, oldest first. */
export function lastNMonths(now: Date, n: number): MonthBucket[] {
  const out: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ month: d.getMonth(), year: d.getFullYear(), label: MONTH_LABELS[d.getMonth()]! });
  }
  return out;
}

/** First day of the bucket's month (local time). */
export function bucketStart(b: MonthBucket): Date {
  return new Date(b.year, b.month, 1);
}

/** Sum `amountCents` rows into the given month buckets (zero-filled). */
export function bucketByMonth(
  rows: { paidAt: Date; amountCents: number }[],
  months: MonthBucket[],
): { label: string; cents: number }[] {
  const sums = months.map(() => 0);
  const index = new Map(months.map((m, i) => [`${m.year}-${m.month}`, i]));
  for (const row of rows) {
    const i = index.get(`${row.paidAt.getFullYear()}-${row.paidAt.getMonth()}`);
    if (i !== undefined) sums[i] = sums[i]! + row.amountCents;
  }
  return months.map((m, i) => ({ label: m.label, cents: sums[i]! }));
}

/** Rounded percent change vs a base; null when the base is 0 — the UI shows
 * "—" rather than a fabricated +∞. */
export function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type CouponDerivedStatus = 'ACTIVE' | 'EXPIRING' | 'EXHAUSTED' | 'EXPIRED' | 'INACTIVE';

const EXPIRING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Derived — never stored — so it can't drift from the underlying fields. */
export function couponStatus(
  coupon: {
    active: boolean;
    expiresAt: Date | null;
    maxUses: number | null;
    usedCount: number;
  },
  now: Date,
): CouponDerivedStatus {
  if (!coupon.active) return 'INACTIVE';
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) return 'EXPIRED';
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return 'EXHAUSTED';
  if (coupon.expiresAt && coupon.expiresAt.getTime() - now.getTime() < EXPIRING_WINDOW_MS)
    return 'EXPIRING';
  return 'ACTIVE';
}

/** Whole calendar months elapsed between `start` and `now` (day-of-month aware). */
export function monthsSince(start: Date, now: Date): number {
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

export interface CouponTerms {
  type: 'PERCENT' | 'FIXED' | 'FREE_MONTH';
  /** PERCENT: points. FIXED: cents. FREE_MONTH: number of free months. */
  value: number;
  /** PERCENT/FIXED window in months from subscription start; null = permanent. */
  durationMonths: number | null;
}

/** A school's monthly amount: students × unit price, minus its coupon while
 * that coupon's window is running. */
export function subscriptionMonthlyCents({
  students,
  priceCents,
  coupon,
  monthsSinceStart,
}: {
  students: number;
  priceCents: number;
  coupon: CouponTerms | null;
  monthsSinceStart: number;
}): number {
  const gross = students * priceCents;
  if (!coupon) return gross;
  if (coupon.type === 'FREE_MONTH') {
    return monthsSinceStart < coupon.value ? 0 : gross;
  }
  const windowOver = coupon.durationMonths !== null && monthsSinceStart >= coupon.durationMonths;
  if (windowOver) return gross;
  if (coupon.type === 'PERCENT') return Math.round(gross * (1 - coupon.value / 100));
  return Math.max(0, gross - coupon.value);
}

// ── Statistics screen (admin-statistics.md) ─────────────────────────────

export interface DayBucket {
  /** Local midnight of the day. */
  start: Date;
  /** "12/08" — day/month, the x-axis label for 7j/30j series. */
  label: string;
}

/** The N calendar days ending today, oldest first. */
export function lastNDays(now: Date, n: number): DayBucket[] {
  const out: DayBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push({
      start: d,
      label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }
  return out;
}

/** Sum `amountCents` rows into day buckets (zero-filled). */
export function bucketByDay(
  rows: { paidAt: Date; amountCents: number }[],
  days: DayBucket[],
): { label: string; cents: number }[] {
  const sums = days.map(() => 0);
  const index = new Map(days.map((d, i) => [d.start.toDateString(), i]));
  for (const row of rows) {
    const i = index.get(
      new Date(
        row.paidAt.getFullYear(),
        row.paidAt.getMonth(),
        row.paidAt.getDate(),
      ).toDateString(),
    );
    if (i !== undefined) sums[i] = sums[i]! + row.amountCents;
  }
  return days.map((d, i) => ({ label: d.label, cents: sums[i]! }));
}

export const HEATMAP_ROWS = ['Matin', 'Après-midi', 'Soir'] as const;
export const HEATMAP_COLS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

/** LoginEvents → 3×7 grid (Matin <12h / Après-midi 12–18h / Soir ≥18h ×
 * Lun..Dim, local time). */
export function loginHeatmap(events: { createdAt: Date }[]): number[][] {
  const grid = HEATMAP_ROWS.map(() => HEATMAP_COLS.map(() => 0));
  for (const e of events) {
    const hour = e.createdAt.getHours();
    const row = hour < 12 ? 0 : hour < 18 ? 1 : 2;
    // JS getDay(): 0 = Sunday — shift so Monday is column 0.
    const col = (e.createdAt.getDay() + 6) % 7;
    grid[row]![col] = grid[row]![col]! + 1;
  }
  return grid;
}

/** Monthly churn from the SubscriptionStatusChange log. `activations` /
 * `churns` are this month's transitions into (ACTIVE|TRIAL) / into
 * (EXPIRED|CANCELED); active-at-month-start is reconstructed from the
 * current count. Returns null when there was nothing to churn from. */
export function monthlyChurnPct({
  currentActive,
  activationsThisMonth,
  churnsThisMonth,
}: {
  currentActive: number;
  activationsThisMonth: number;
  churnsThisMonth: number;
}): number | null {
  const activeAtStart = currentActive - activationsThisMonth + churnsThisMonth;
  if (activeAtStart <= 0) return null;
  return Math.round((churnsThisMonth / activeAtStart) * 1000) / 10;
}

/** LTV estimate = ARPU ÷ monthly churn rate. Null until churn is observed —
 * the UI shows "—" instead of a fabricated infinity. */
export function ltvCents(arpuCents: number, churnPct: number | null): number | null {
  if (churnPct === null || churnPct <= 0) return null;
  return Math.round(arpuCents / (churnPct / 100));
}
