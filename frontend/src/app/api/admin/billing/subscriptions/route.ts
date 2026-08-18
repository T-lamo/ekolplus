// GET/POST /api/admin/billing/subscriptions — Abonnements screen (Banani
// M0FRcZpAIEZQ). Plan: .planning/banani/admin-subscriptions.md. Q1 decision:
// real Prisma models managed manually by the platform admin; Stripe attaches
// later. One GET hydrates the whole page (KPIs, donut, 6-month MRR series,
// expiring-soon alert, paginated list, schools available for creation).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { $Enums, Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  bucketByMonth,
  bucketStart,
  couponStatus,
  lastNMonths,
  monthsSince,
  pctDelta,
  subscriptionMonthlyCents,
} from '@/lib/server/admin/saas-metrics';

const PAGE_SIZE = 20;
const EXPIRING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const SUB_INCLUDE = {
  plan: { select: { key: true, name: true, pricePerStudentCents: true } },
  coupon: { select: { id: true, code: true, type: true, value: true, durationMonths: true } },
  school: { select: { id: true, name: true, city: true, country: true } },
} satisfies Prisma.SubscriptionInclude;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const q = (url.searchParams.get('q') ?? '').slice(0, 200).trim();
    const plan = url.searchParams.get('plan');
    const status = url.searchParams.get('status');

    const where: Prisma.SubscriptionWhereInput = {
      ...(q ? { school: { name: { contains: q, mode: 'insensitive' } } } : {}),
      ...(plan ? { plan: { key: plan } } : {}),
      ...(status ? { status: status as $Enums.SubscriptionStatus } : {}),
    };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const expiringBefore = new Date(now.getTime() + EXPIRING_WINDOW_MS);
    const months = lastNMonths(now, 6);

    const [
      total,
      rows,
      allActive,
      expiredCount,
      renewalsThisMonth,
      nextRenewal,
      expiringList,
      revenueRows,
      freeSchools,
    ] = await Promise.all([
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: SUB_INCLUDE,
      }),
      prisma.subscription.findMany({
        where: { status: { in: ['ACTIVE', 'TRIAL'] } },
        include: SUB_INCLUDE,
      }),
      prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      prisma.subscription.count({
        where: { status: 'ACTIVE', renewsAt: { gte: monthStart, lt: monthEnd } },
      }),
      prisma.subscription.findFirst({
        where: { status: 'ACTIVE', renewsAt: { gte: now } },
        orderBy: { renewsAt: 'asc' },
        select: { renewsAt: true },
      }),
      prisma.subscription.findMany({
        where: { status: 'ACTIVE', renewsAt: { gte: now, lte: expiringBefore } },
        orderBy: { renewsAt: 'asc' },
        select: { school: { select: { name: true } } },
      }),
      prisma.billingTransaction.findMany({
        where: {
          paidAt: { gte: bucketStart(months[0]!) },
          status: { in: ['SUCCEEDED', 'REFUNDED'] },
        },
        select: { paidAt: true, amountCents: true },
      }),
      prisma.school.findMany({
        where: { subscription: { is: null } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Student counts for every school involved (list rows + all active for MRR).
    const schoolIds = [...new Set([...rows, ...allActive].map((s) => s.school.id))];
    const studentCounts =
      schoolIds.length > 0
        ? await prisma.student.groupBy({
            by: ['schoolId'],
            where: { schoolId: { in: schoolIds } },
            _count: { _all: true },
          })
        : [];
    const studentsBySchool = new Map(studentCounts.map((c) => [c.schoolId, c._count._all]));

    function monthly(sub: (typeof allActive)[number]): number {
      return subscriptionMonthlyCents({
        students: studentsBySchool.get(sub.school.id) ?? 0,
        priceCents: sub.plan.pricePerStudentCents,
        coupon: sub.coupon,
        monthsSinceStart: monthsSince(sub.startedAt, now),
      });
    }

    let mrrCents = 0;
    const planBreakdown = new Map<string, { name: string; count: number }>();
    for (const sub of allActive) {
      mrrCents += monthly(sub);
      const p = planBreakdown.get(sub.plan.key) ?? { name: sub.plan.name, count: 0 };
      p.count += 1;
      planBreakdown.set(sub.plan.key, p);
    }

    const mrrSeries = bucketByMonth(revenueRows, months);
    const prevMonthCents = mrrSeries[mrrSeries.length - 2]?.cents ?? 0;
    const activeCount = allActive.length;

    return NextResponse.json(
      {
        items: rows.map((sub) => ({
          id: sub.id,
          school: sub.school,
          plan: {
            key: sub.plan.key,
            name: sub.plan.name,
            priceCents: sub.plan.pricePerStudentCents,
          },
          students: studentsBySchool.get(sub.school.id) ?? 0,
          monthlyCents: monthly(sub),
          status: sub.status,
          startedAt: sub.startedAt.toISOString(),
          renewsAt: sub.renewsAt.toISOString(),
          trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
          expiringSoon:
            sub.status === 'ACTIVE' && sub.renewsAt.getTime() - now.getTime() < EXPIRING_WINDOW_MS,
          coupon: sub.coupon ? { id: sub.coupon.id, code: sub.coupon.code } : null,
          // Stripe linkage for supervision — null for manual/back-office
          // subscriptions (Enterprise deals, bank transfers).
          stripe: sub.stripeSubscriptionId
            ? {
                subscriptionId: sub.stripeSubscriptionId,
                status: sub.stripeStatus,
                interval: sub.billingInterval,
                cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                billedSeats: sub.billedSeats,
              }
            : null,
        })),
        total,
        page,
        pageSize: PAGE_SIZE,
        stats: {
          activeCount,
          mrrCents,
          mrrDeltaPct: pctDelta(mrrSeries[mrrSeries.length - 1]?.cents ?? 0, prevMonthCents),
          renewalsThisMonth,
          nextRenewalAt: nextRenewal?.renewsAt.toISOString() ?? null,
          expiredCount,
        },
        planBreakdown: {
          total: activeCount,
          expired: expiredCount,
          items: [...planBreakdown.entries()].map(([key, p]) => ({
            key,
            name: p.name,
            count: p.count,
            pct: activeCount > 0 ? Math.round((p.count / activeCount) * 100) : 0,
          })),
        },
        mrrSeries,
        expiring: {
          count: expiringList.length,
          names: expiringList.slice(0, 2).map((s) => s.school.name),
        },
        freeSchools,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const PostBody = z.object({
  schoolId: z.string().min(1),
  planKey: z.string().min(1),
  status: z.enum(['TRIAL', 'ACTIVE']),
  renewsAt: z.coerce.date(),
  trialEndsAt: z.coerce.date().optional(),
  couponCode: z.string().trim().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = PostBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const body = parsed.data;

    const [school, plan] = await Promise.all([
      prisma.school.findUnique({
        where: { id: body.schoolId },
        select: { id: true, name: true, subscription: { select: { id: true } } },
      }),
      prisma.subscriptionPlan.findUnique({ where: { key: body.planKey } }),
    ]);
    if (!school) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'School not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (school.subscription) {
      return NextResponse.json(
        { error: 'SUBSCRIPTION_EXISTS', message: 'Cette école a déjà un abonnement.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!plan || !plan.active) {
      return NextResponse.json(
        { error: 'PLAN_NOT_FOUND', message: 'Unknown plan' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let couponId: string | null = null;
    if (body.couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: body.couponCode } });
      const now = new Date();
      if (
        !coupon ||
        (couponStatus(coupon, now) !== 'ACTIVE' && couponStatus(coupon, now) !== 'EXPIRING')
      ) {
        return NextResponse.json(
          { error: 'COUPON_INVALID', message: 'Coupon invalide, expiré ou épuisé.' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (coupon.planId && coupon.planId !== plan.id) {
        return NextResponse.json(
          { error: 'COUPON_PLAN_MISMATCH', message: "Ce coupon ne s'applique pas à ce plan." },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (coupon.schoolId && coupon.schoolId !== school.id) {
        return NextResponse.json(
          { error: 'COUPON_SCHOOL_MISMATCH', message: 'Ce coupon est réservé à une autre école.' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      couponId = coupon.id;
    }

    const created = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          schoolId: school.id,
          planId: plan.id,
          status: body.status,
          renewsAt: body.renewsAt,
          trialEndsAt: body.trialEndsAt ?? null,
          couponId,
        },
      });
      await tx.subscriptionStatusChange.create({
        data: { subscriptionId: sub.id, fromStatus: null, toStatus: body.status },
      });
      if (couponId) {
        await tx.coupon.update({
          where: { id: couponId },
          data: { usedCount: { increment: 1 } },
        });
      }
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'billing.subscription_create',
        targetType: 'Subscription',
        targetId: sub.id,
        metadata: {
          schoolId: school.id,
          schoolName: school.name,
          plan: plan.key,
          status: body.status,
        },
      });
      return sub;
    });

    return NextResponse.json(
      { subscription: created },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
