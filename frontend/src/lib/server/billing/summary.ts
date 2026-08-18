// School-facing billing summary + plan-limit enforcement. Pure reads over
// Subscription/SubscriptionPlan/Student — no Stripe API call, so the
// Abonnement tab renders instantly and the students route can enforce the
// Starter cap without depending on Stripe being configured.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import {
  PLAN_STUDENT_HARD_LIMIT,
  PLAN_STUDENT_SOFT_LIMIT,
  PRO_ANNUAL_RATE_CENTS,
  PRO_RATE_CENTS,
  TRIAL_DAYS,
  isPlanKey,
  type BillingSummary,
  type PlanKey,
  type PlanSnapshot,
} from '@/lib/billing-plans';

export type { BillingSummary, BillingTransactionRow, PlanSnapshot } from '@/lib/billing-plans';
import { isAnnualPriceConfigured, isStripeConfigured } from './stripe-client';

type Db = Pick<
  PrismaClient,
  'subscription' | 'student' | 'billingTransaction' | 'teacher' | 'class' | 'organizationMember'
>;

/**
 * Statuses that do NOT entitle the school to its subscribed plan: the row is
 * over (CANCELED / EXPIRED) or on hold (SUSPENDED — Stripe `unpaid` after the
 * dunning retries, `paused`, `incomplete`, or a back-office suspension). User
 * decision 2026-08-18: an unpaid Pro school falls back to Starter rules
 * automatically (50-student cap) until it regularises — no data is lost.
 */
const NOT_ENTITLED: ReadonlySet<string> = new Set(['CANCELED', 'EXPIRED', 'SUSPENDED']);

/** Effective plan key of a subscription row (or of a school without one). */
export function effectivePlanKey(
  sub: { status: string; plan: { key: string } } | null | undefined,
): PlanKey {
  if (!sub) return 'STARTER';
  if (NOT_ENTITLED.has(sub.status)) return 'STARTER';
  return isPlanKey(sub.plan.key) ? sub.plan.key : 'STARTER';
}

export async function getBillingSummary(db: Db, schoolId: string): Promise<BillingSummary> {
  const [sub, studentCount, teacherCount, classCount, adminCount, transactions] = await Promise.all(
    [
      db.subscription.findUnique({
        where: { schoolId },
        select: {
          status: true,
          stripeStatus: true,
          stripeSubscriptionId: true,
          billingInterval: true,
          cancelAtPeriodEnd: true,
          renewsAt: true,
          trialEndsAt: true,
          startedAt: true,
          billedSeats: true,
          plan: { select: { key: true } },
          school: { select: { stripeCustomerId: true } },
        },
      }),
      db.student.count({ where: { schoolId } }),
      db.teacher.count({ where: { schoolId } }),
      db.class.count({ where: { schoolId } }),
      db.organizationMember.count({
        where: { organization: { school: { id: schoolId } }, role: { in: ['OWNER', 'ADMIN'] } },
      }),
      db.billingTransaction.findMany({
        where: { schoolId },
        orderBy: { paidAt: 'desc' },
        take: 24,
        select: {
          id: true,
          reference: true,
          amountCents: true,
          method: true,
          status: true,
          paidAt: true,
          periodStart: true,
          stripeInvoiceUrl: true,
        },
      }),
    ],
  );

  const plan = effectivePlanKey(sub);
  const subscribedPlan = sub && isPlanKey(sub.plan.key) ? sub.plan.key : null;
  return {
    plan,
    subscribedPlan,
    status: sub?.status ?? null,
    stripeStatus: sub?.stripeStatus ?? null,
    managedByStripe: Boolean(sub?.stripeSubscriptionId),
    hasStripeCustomer: Boolean(sub?.school.stripeCustomerId),
    billingInterval: sub?.billingInterval ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    renewsAt: sub?.renewsAt.toISOString() ?? null,
    trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
    startedAt: sub?.startedAt.toISOString() ?? null,
    studentCount,
    usage: {
      students: studentCount,
      teachers: teacherCount,
      classes: classCount,
      admins: adminCount,
    },
    billedSeats: sub?.billedSeats ?? null,
    studentHardLimit: PLAN_STUDENT_HARD_LIMIT[plan],
    studentSoftLimit: PLAN_STUDENT_SOFT_LIMIT[plan],
    rates: {
      monthlyCents: PRO_RATE_CENTS,
      annualCents: PRO_ANNUAL_RATE_CENTS,
      trialDays: TRIAL_DAYS,
      annualAvailable: isAnnualPriceConfigured(),
    },
    estimate: {
      monthlyCents: studentCount * PRO_RATE_CENTS,
      annualCents: studentCount * PRO_ANNUAL_RATE_CENTS,
    },
    stripeConfigured: isStripeConfigured(),
    transactions: transactions.map((t) => ({
      id: t.id,
      reference: t.reference,
      amountCents: t.amountCents,
      method: t.method,
      status: t.status,
      paidAt: t.paidAt.toISOString(),
      periodStart: t.periodStart.toISOString(),
      invoiceUrl: t.stripeInvoiceUrl,
    })),
  };
}

/**
 * Lightweight plan snapshot for the school shell (sidebar plan card on every
 * page): the subscription row + the student count, nothing else. Same
 * effective-plan rule as the full summary so both can never disagree.
 */
export async function getPlanSnapshot(
  db: Pick<PrismaClient, 'subscription' | 'student'>,
  schoolId: string,
): Promise<PlanSnapshot> {
  const [sub, studentCount] = await Promise.all([
    db.subscription.findUnique({
      where: { schoolId },
      select: {
        status: true,
        stripeStatus: true,
        stripeSubscriptionId: true,
        cancelAtPeriodEnd: true,
        renewsAt: true,
        trialEndsAt: true,
        plan: { select: { key: true } },
      },
    }),
    db.student.count({ where: { schoolId } }),
  ]);
  const plan = effectivePlanKey(sub);
  return {
    plan,
    subscribedPlan: sub && isPlanKey(sub.plan.key) ? sub.plan.key : null,
    status: sub?.status ?? null,
    stripeStatus: sub?.stripeStatus ?? null,
    managedByStripe: Boolean(sub?.stripeSubscriptionId),
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
    renewsAt: sub?.renewsAt.toISOString() ?? null,
    studentCount,
    studentHardLimit: PLAN_STUDENT_HARD_LIMIT[plan],
    stripeConfigured: isStripeConfigured(),
  };
}

export interface PlanLimitCheck {
  allowed: boolean;
  plan: PlanKey;
  limit: number | null;
  studentCount: number;
}

/**
 * Starter hard cap (50 students, landing promise). Pro/Enterprise are never
 * blocked. Called by POST /api/school/students before the insert; the
 * count is a fresh query so a burst of parallel creates can overshoot by at
 * most the burst size — acceptable for a free-tier nudge, not a ledger.
 */
export async function checkStudentLimit(
  db: Pick<PrismaClient, 'subscription' | 'student'>,
  schoolId: string,
): Promise<PlanLimitCheck> {
  const { plan, studentHardLimit: limit, studentCount } = await getPlanSnapshot(db, schoolId);
  return { allowed: limit === null || studentCount < limit, plan, limit, studentCount };
}
