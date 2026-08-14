// GET /api/admin/stats/overview — one call hydrates the whole /admin
// dashboard: KPI row, 6-month revenue series, recent users, client schools,
// recent transactions and coupons. ADMIN+ read (same bar as the other
// /api/admin/* reads). See .planning/banani/saas-admin-dashboard.md.
//
// Every figure is computed from the real database — no mockup numbers. A
// fresh install legitimately renders zeros and empty tables.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  bucketByMonth,
  bucketStart,
  couponStatus,
  lastNMonths,
  pctDelta,
} from '@/lib/server/admin/saas-metrics';
import { SCHOOL_INCLUDE, loadSchoolRows } from '@/lib/server/admin/school-overview';

const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const EXPIRING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_MS);
    const expiringBefore = new Date(now.getTime() + EXPIRING_WINDOW_MS);
    const months = lastNMonths(now, 6);
    const seriesStart = bucketStart(months[0]!);

    const [
      totalSchools,
      schoolsThisMonth,
      totalUsers,
      usersThisMonth,
      activeUsers,
      activeSubscriptions,
      expiringSoon,
      revenueRows,
      recentUsersRaw,
      recentSchoolsRaw,
      recentTransactionsRaw,
      recentCouponsRaw,
    ] = await Promise.all([
      prisma.school.count(),
      prisma.school.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: activeSince } } }),
      prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIAL'] } } }),
      prisma.subscription.count({
        where: { status: 'ACTIVE', renewsAt: { lte: expiringBefore, gte: now } },
      }),
      prisma.billingTransaction.findMany({
        where: { paidAt: { gte: seriesStart }, status: { in: ['SUCCEEDED', 'REFUNDED'] } },
        select: { paidAt: true, amountCents: true },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          memberships: {
            take: 1,
            select: {
              role: true,
              organization: { select: { school: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.school.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: SCHOOL_INCLUDE,
      }),
      prisma.billingTransaction.findMany({
        orderBy: { paidAt: 'desc' },
        take: 5,
        select: {
          id: true,
          amountCents: true,
          paidAt: true,
          status: true,
          school: { select: { id: true, name: true } },
          subscription: { select: { plan: { select: { name: true } } } },
        },
      }),
      prisma.coupon.findMany({
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: {
          id: true,
          code: true,
          type: true,
          value: true,
          durationMonths: true,
          usedCount: true,
          maxUses: true,
          expiresAt: true,
          active: true,
        },
      }),
    ]);

    const series = bucketByMonth(revenueRows, months);
    const currentCents = series[series.length - 1]!.cents;
    const previousCents = series[series.length - 2]?.cents ?? 0;
    const totalCents = series.reduce((s, b) => s + b.cents, 0);
    const firstCents = series[0]!.cents;

    const txSchoolIds = [...new Set(recentTransactionsRaw.map((t) => t.school.id))];
    const txStudentCounts =
      txSchoolIds.length > 0
        ? await prisma.student.groupBy({
            by: ['schoolId'],
            where: { schoolId: { in: txSchoolIds } },
            _count: { _all: true },
          })
        : [];
    const txStudents = new Map(txStudentCounts.map((c) => [c.schoolId, c._count._all]));

    return NextResponse.json(
      {
        kpis: {
          totalSchools,
          schoolsDeltaMonth: schoolsThisMonth,
          totalUsers,
          usersDeltaMonth: usersThisMonth,
          activeUsers,
          activeUsersPct: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 1000) / 10 : 0,
          activeSubscriptions,
          expiringSoon,
          monthRevenueCents: currentCents,
          revenueDeltaPct: pctDelta(currentCents, previousCents),
        },
        revenue: {
          series,
          totalCents,
          avgCents: Math.round(totalCents / series.length),
          growthPct: pctDelta(currentCents, firstCents),
        },
        recentUsers: recentUsersRaw.map((u) => ({
          id: u.id,
          name: u.name ?? u.email,
          schoolName: u.memberships[0]?.organization.school?.name ?? null,
          orgRole: u.memberships[0]?.role ?? null,
          status: u.status,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        })),
        schools: await loadSchoolRows(prisma, recentSchoolsRaw, now),
        recentTransactions: recentTransactionsRaw.map((t) => ({
          id: t.id,
          schoolName: t.school.name,
          planName: t.subscription?.plan.name ?? null,
          students: txStudents.get(t.school.id) ?? 0,
          amountCents: t.amountCents,
          paidAt: t.paidAt.toISOString(),
          status: t.status,
        })),
        coupons: recentCouponsRaw.map((c) => ({
          id: c.id,
          code: c.code,
          type: c.type,
          value: c.value,
          durationMonths: c.durationMonths,
          usedCount: c.usedCount,
          maxUses: c.maxUses,
          expiresAt: c.expiresAt?.toISOString() ?? null,
          status: couponStatus(c, now),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
