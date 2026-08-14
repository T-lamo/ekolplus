// GET/POST /api/admin/billing/transactions — Transactions screen (Banani
// Csehe4Ndlnml). Plan: .planning/banani/admin-transactions.md. POST is the
// manual payment-record entry (the only data source until Stripe lands —
// confirmed at plan review). References are TXN-YYYYMMDD-NNNN, sequential
// per day, allocated inside the insert tx.
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
import { bucketByMonth, bucketStart, lastNMonths, pctDelta } from '@/lib/server/admin/saas-metrics';

const PAGE_SIZE = 20;

const TX_INCLUDE = {
  school: { select: { id: true, name: true } },
  subscription: { select: { plan: { select: { key: true, name: true } } } },
  refund: { select: { id: true, reference: true } },
  refundOf: { select: { id: true, reference: true } },
} satisfies Prisma.BillingTransactionInclude;

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
    const month = url.searchParams.get('month'); // "YYYY-MM" | null = all
    const status = url.searchParams.get('status');
    const method = url.searchParams.get('method');

    let monthRange: { gte: Date; lt: Date } | null = null;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number) as [number, number];
      monthRange = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }

    const where: Prisma.BillingTransactionWhereInput = {
      ...(q
        ? {
            OR: [
              { reference: { contains: q, mode: 'insensitive' } },
              { school: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(monthRange ? { paidAt: monthRange } : {}),
      ...(status ? { status: status as $Enums.BillingStatus } : {}),
      ...(method ? { method: method as $Enums.BillingMethod } : {}),
    };

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const months = lastNMonths(now, 12);
    const REVENUE = ['SUCCEEDED', 'REFUNDED'] as const;

    const [
      total,
      rows,
      yearAgg,
      prevYearAgg,
      monthAgg,
      prevMonthAgg,
      monthCount,
      pendingRefunds,
      methodGroups,
      succeededCount,
      failedCount,
      refundedAgg,
      seriesRows,
      schoolsWithSub,
    ] = await Promise.all([
      prisma.billingTransaction.count({ where }),
      prisma.billingTransaction.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: TX_INCLUDE,
      }),
      prisma.billingTransaction.aggregate({
        _sum: { amountCents: true },
        where: { paidAt: { gte: yearStart }, status: { in: [...REVENUE] } },
      }),
      prisma.billingTransaction.aggregate({
        _sum: { amountCents: true },
        where: {
          paidAt: { gte: new Date(now.getFullYear() - 1, 0, 1), lt: yearStart },
          status: { in: [...REVENUE] },
        },
      }),
      prisma.billingTransaction.aggregate({
        _sum: { amountCents: true },
        where: { paidAt: { gte: monthStart }, status: { in: [...REVENUE] } },
      }),
      prisma.billingTransaction.aggregate({
        _sum: { amountCents: true },
        where: { paidAt: { gte: prevMonthStart, lt: monthStart }, status: { in: [...REVENUE] } },
      }),
      prisma.billingTransaction.count({ where: { paidAt: { gte: monthStart } } }),
      prisma.billingTransaction.aggregate({
        _sum: { amountCents: true },
        _count: { _all: true },
        where: { status: 'PENDING' },
      }),
      prisma.billingTransaction.groupBy({
        by: ['method'],
        _sum: { amountCents: true },
        where: { status: { in: [...REVENUE] } },
      }),
      prisma.billingTransaction.count({ where: { status: 'SUCCEEDED' } }),
      prisma.billingTransaction.count({ where: { status: 'FAILED' } }),
      prisma.billingTransaction.aggregate({
        _sum: { amountCents: true },
        where: { status: 'REFUNDED' },
      }),
      prisma.billingTransaction.findMany({
        where: { paidAt: { gte: bucketStart(months[0]!) }, status: { in: [...REVENUE] } },
        select: { paidAt: true, amountCents: true },
      }),
      prisma.school.findMany({
        where: { subscription: { isNot: null } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const totalCollected = methodGroups.reduce((s, g) => s + (g._sum.amountCents ?? 0), 0);
    const doneCount = succeededCount + failedCount;
    const yearCents = yearAgg._sum.amountCents ?? 0;
    const monthCents = monthAgg._sum.amountCents ?? 0;
    const series = bucketByMonth(seriesRows, months);
    const peak = series.reduce((best, b) => (b.cents > best.cents ? b : best), series[0]!);

    return NextResponse.json(
      {
        items: rows.map((t) => ({
          id: t.id,
          reference: t.reference,
          school: t.school,
          plan: t.subscription?.plan ?? null,
          amountCents: t.amountCents,
          method: t.method,
          status: t.status,
          paidAt: t.paidAt.toISOString(),
          periodStart: t.periodStart.toISOString(),
          refund: t.refund ? { id: t.refund.id, reference: t.refund.reference } : null,
          refundOf: t.refundOf ? { id: t.refundOf.id, reference: t.refundOf.reference } : null,
        })),
        total,
        page,
        pageSize: PAGE_SIZE,
        stats: {
          yearCents,
          yearDeltaPct: pctDelta(yearCents, prevYearAgg._sum.amountCents ?? 0),
          monthCents,
          monthDeltaPct: pctDelta(monthCents, prevMonthAgg._sum.amountCents ?? 0),
          monthCount,
          pendingRefundCount: pendingRefunds._count._all,
          pendingRefundCents: pendingRefunds._sum.amountCents ?? 0,
          succeededCount,
          failedCount,
          succeededPct: doneCount > 0 ? Math.round((succeededCount / doneCount) * 1000) / 10 : null,
          refundedCents: Math.abs(refundedAgg._sum.amountCents ?? 0),
          avgTicketCents: succeededCount > 0 ? Math.round(totalCollected / succeededCount) : null,
        },
        methods: methodGroups.map((g) => ({
          method: g.method,
          cents: g._sum.amountCents ?? 0,
          pct:
            totalCollected > 0 ? Math.round(((g._sum.amountCents ?? 0) / totalCollected) * 100) : 0,
        })),
        series,
        peak: { label: peak.label, cents: peak.cents },
        schools: schoolsWithSub,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const PostBody = z.object({
  schoolId: z.string().min(1),
  amountCents: z.number().int().positive(),
  method: z.enum(['STRIPE', 'MANUAL', 'BANK_TRANSFER']),
  status: z.enum(['SUCCEEDED', 'PENDING', 'FAILED']).default('SUCCEEDED'),
  /** First day of the covered month, "YYYY-MM". */
  period: z.string().regex(/^\d{4}-\d{2}$/),
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

    const school = await prisma.school.findUnique({
      where: { id: body.schoolId },
      select: { id: true, name: true, subscription: { select: { id: true } } },
    });
    if (!school) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'School not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [y, m] = body.period.split('-').map(Number) as [number, number];
    const periodStart = new Date(y, m - 1, 1);

    const created = await prisma.$transaction(async (tx) => {
      // TXN-YYYYMMDD-NNNN — NNNN = count of today's rows + 1. Safe inside
      // the tx for this admin-driven, low-volume path.
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayCount = await tx.billingTransaction.count({
        where: { createdAt: { gte: dayStart } },
      });
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const reference = `TXN-${ymd}-${String(todayCount + 1).padStart(4, '0')}`;

      const row = await tx.billingTransaction.create({
        data: {
          reference,
          schoolId: school.id,
          subscriptionId: school.subscription?.id ?? null,
          amountCents: body.amountCents,
          method: body.method,
          status: body.status,
          periodStart,
        },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'billing.transaction_create',
        targetType: 'BillingTransaction',
        targetId: row.id,
        metadata: {
          reference,
          schoolName: school.name,
          amountCents: body.amountCents,
          method: body.method,
        },
      });
      return row;
    });

    return NextResponse.json(
      { transaction: created },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
