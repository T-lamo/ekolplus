// GET /api/admin/stats/detailed?period=7d|30d|6m|12m — the /admin/statistics
// screen (Banani nSYPhOOZgccA). Everything is computed from real data,
// including the Q2-decision analytics: retention (lastLoginAt), monthly
// churn + LTV (SubscriptionStatusChange log) and the login heatmap
// (LoginEvent). Metrics whose inputs don't exist yet return null and the UI
// renders "—" — never a fabricated number.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  HEATMAP_COLS,
  HEATMAP_ROWS,
  bucketByDay,
  bucketByMonth,
  bucketStart,
  lastNDays,
  lastNMonths,
  loginHeatmap,
  ltvCents,
  monthlyChurnPct,
  monthsSince,
  pctDelta,
  subscriptionMonthlyCents,
} from '@/lib/server/admin/saas-metrics';

const PERIODS = { '7d': 7, '30d': 30, '6m': 6, '12m': 12 } as const;
type Period = keyof typeof PERIODS;

const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const raw = req.nextUrl.searchParams.get('period') ?? '12m';
    const period: Period = raw in PERIODS ? (raw as Period) : '12m';

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_MS);
    const isDaily = period === '7d' || period === '30d';
    const months = isDaily ? lastNMonths(now, 12) : lastNMonths(now, PERIODS[period]);
    const days = isDaily ? lastNDays(now, PERIODS[period]) : [];
    const seriesStart = isDaily ? days[0]!.start : bucketStart(months[0]!);
    const yearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    const [
      totalSchools,
      schoolsThisMonth,
      totalStudents,
      studentsThisMonth,
      eligibleUsers,
      retainedUsers,
      revenueRows,
      prevYearRevenue,
      subs,
      activeCount,
      statusChangesThisMonth,
      gradesThisMonth,
      appreciationsThisMonth,
      loginEvents,
      expiredCount,
    ] = await Promise.all([
      prisma.school.count(),
      prisma.school.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.student.count(),
      prisma.student.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.user.count({ where: { createdAt: { lt: activeSince } } }),
      prisma.user.count({
        where: { createdAt: { lt: activeSince }, lastLoginAt: { gte: activeSince } },
      }),
      prisma.billingTransaction.findMany({
        where: { paidAt: { gte: seriesStart }, status: { in: ['SUCCEEDED', 'REFUNDED'] } },
        select: { paidAt: true, amountCents: true },
      }),
      prisma.billingTransaction.aggregate({
        _sum: { amountCents: true },
        where: {
          paidAt: { gte: yearStart, lt: new Date(now.getFullYear(), now.getMonth(), 1) },
          status: { in: ['SUCCEEDED', 'REFUNDED'] },
        },
      }),
      prisma.subscription.findMany({
        where: { status: { in: ['ACTIVE', 'TRIAL'] } },
        select: {
          startedAt: true,
          plan: { select: { key: true, name: true, pricePerStudentCents: true, sortOrder: true } },
          coupon: { select: { type: true, value: true, durationMonths: true } },
          school: { select: { id: true, country: true } },
        },
      }),
      prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIAL'] } } }),
      prisma.subscriptionStatusChange.findMany({
        where: { createdAt: { gte: monthStart } },
        select: { toStatus: true },
      }),
      prisma.grade.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.appreciation.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.loginEvent.findMany({
        where: { createdAt: { gte: activeSince } },
        select: { createdAt: true },
      }),
      prisma.subscription.count({ where: { status: 'EXPIRED' } }),
    ]);

    // Per-school monthly amounts need student counts — one groupBy for all.
    const subSchoolIds = subs.map((s) => s.school.id);
    const studentCounts =
      subSchoolIds.length > 0
        ? await prisma.student.groupBy({
            by: ['schoolId'],
            where: { schoolId: { in: subSchoolIds } },
            _count: { _all: true },
          })
        : [];
    const studentsBySchool = new Map(studentCounts.map((c) => [c.schoolId, c._count._all]));

    let mrrCents = 0;
    let billedStudents = 0;
    const planCounts = new Map<string, { name: string; sortOrder: number; count: number }>();
    const countryAgg = new Map<string, { schools: number; cents: number }>();
    for (const sub of subs) {
      const students = studentsBySchool.get(sub.school.id) ?? 0;
      const cents = subscriptionMonthlyCents({
        students,
        priceCents: sub.plan.pricePerStudentCents,
        coupon: sub.coupon,
        monthsSinceStart: monthsSince(sub.startedAt, now),
      });
      mrrCents += cents;
      billedStudents += students;
      const plan = planCounts.get(sub.plan.key) ?? {
        name: sub.plan.name,
        sortOrder: sub.plan.sortOrder,
        count: 0,
      };
      plan.count += 1;
      planCounts.set(sub.plan.key, plan);
      const country = countryAgg.get(sub.school.country) ?? { schools: 0, cents: 0 };
      country.schools += 1;
      country.cents += cents;
      countryAgg.set(sub.school.country, country);
    }

    // Country panel counts every school; revenue comes from subscribed ones.
    const allCountries = await prisma.school.groupBy({ by: ['country'], _count: { _all: true } });
    const geo = allCountries
      .map((c) => ({
        country: c.country,
        schools: c._count._all,
        cents: countryAgg.get(c.country)?.cents ?? 0,
      }))
      .sort((a, b) => b.schools - a.schools);

    const activations = statusChangesThisMonth.filter(
      (c) => c.toStatus === 'ACTIVE' || c.toStatus === 'TRIAL',
    ).length;
    const churns = statusChangesThisMonth.filter(
      (c) => c.toStatus === 'EXPIRED' || c.toStatus === 'CANCELED',
    ).length;
    const churnPct = monthlyChurnPct({
      currentActive: activeCount,
      activationsThisMonth: activations,
      churnsThisMonth: churns,
    });
    const arpuCents = activeCount > 0 ? Math.round(mrrCents / activeCount) : 0;

    const series = isDaily ? bucketByDay(revenueRows, days) : bucketByMonth(revenueRows, months);
    const totalCents = series.reduce((s, b) => s + b.cents, 0);
    const peakCents = series.reduce((m, b) => Math.max(m, b.cents), 0);
    const yoyPct = pctDelta(totalCents, prevYearRevenue._sum.amountCents ?? 0);

    return NextResponse.json(
      {
        period,
        kpis: {
          totalSchools,
          schoolsDeltaMonth: schoolsThisMonth,
          totalStudents,
          studentsDeltaMonth: studentsThisMonth,
          retentionPct:
            eligibleUsers > 0 ? Math.round((retainedUsers / eligibleUsers) * 1000) / 10 : null,
          arrCents: mrrCents * 12,
          revPerStudentCents: billedStudents > 0 ? Math.round(mrrCents / billedStudents) : null,
        },
        revenue: {
          series,
          totalCents,
          avgCents: series.length > 0 ? Math.round(totalCents / series.length) : 0,
          peakCents,
          yoyPct,
        },
        plans: {
          total: activeCount,
          expired: expiredCount,
          items: [...planCounts.entries()]
            .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
            .map(([key, p]) => ({
              key,
              name: p.name,
              count: p.count,
              pct: activeCount > 0 ? Math.round((p.count / activeCount) * 1000) / 10 : 0,
            })),
        },
        growth: {
          newSchools: schoolsThisMonth,
          newStudents: studentsThisMonth,
          gradesThisMonth,
          appreciationsThisMonth,
          churnPct,
          ltvCents: ltvCents(arpuCents, churnPct),
        },
        geo,
        heatmap: {
          rows: [...HEATMAP_ROWS],
          cols: [...HEATMAP_COLS],
          values: loginHeatmap(loginEvents),
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
