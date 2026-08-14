// GET /api/school/attendance/stats?classId=&termId= — Présences' "Statistiques"
// tab read model: status distribution + a week-by-week attendance-rate
// trend across the resolved Term for one class. Term-wide by design (same
// scope as the main roster's rate/absences columns), independent of
// whichever week/month the "Vue hebdomadaire"/"Vue mensuelle" tabs happen
// to be showing.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, resolveActiveAcademicYear } from '@/lib/server/school';
import { resolveCurrentTerm } from '@/lib/server/grades';
import { attendanceRate, mondayOf, isoDate } from '@/lib/server/attendance';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const year = await resolveActiveAcademicYear(mySchool.schoolId);
    const classes = year
      ? await prisma.class.findMany({
          where: { schoolId: mySchool.schoolId, academicYearId: year.id },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : [];

    const empty = {
      classes,
      resolvedClassId: null,
      terms: [] as { id: string; label: string; order: number }[],
      resolvedTermId: null,
      distribution: { present: 0, absent: 0, late: 0, excused: 0, recorded: 0 },
      weeklyTrend: [] as { label: string; value: number }[],
      overallRatePercent: null as number | null,
    };

    if (!year || classes.length === 0) {
      return NextResponse.json(empty, { headers: { 'x-request-id': ctx.requestId } });
    }

    const classIdParam = req.nextUrl.searchParams.get('classId');
    const targetClass = classes.find((c) => c.id === classIdParam) ?? classes[0]!;

    const terms = await prisma.term.findMany({
      where: { academicYearId: year.id },
      orderBy: { order: 'asc' },
    });
    const termIdParam = req.nextUrl.searchParams.get('termId');
    const term = termIdParam
      ? (terms.find((t) => t.id === termIdParam) ?? null)
      : resolveCurrentTerm(terms);

    const shell = {
      classes,
      resolvedClassId: targetClass.id,
      terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
      resolvedTermId: term?.id ?? null,
    };

    if (!term) {
      return NextResponse.json(
        {
          ...shell,
          distribution: { present: 0, absent: 0, late: 0, excused: 0, recorded: 0 },
          weeklyTrend: [],
          overallRatePercent: null,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { classId: targetClass.id, academicYearId: year.id },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);

    const rows =
      studentIds.length === 0
        ? []
        : await prisma.attendance.findMany({
            where: {
              studentId: { in: studentIds },
              date: { gte: term.startDate, lte: term.endDate },
            },
            select: { date: true, status: true },
          });

    const distribution = {
      present: rows.filter((r) => r.status === 'PRESENT').length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
      late: rows.filter((r) => r.status === 'LATE').length,
      excused: rows.filter((r) => r.status === 'EXCUSED').length,
      recorded: rows.length,
    };

    // Bucket by the Monday of each row's week, chronological, 1-indexed
    // label within the term ("Sem. 1", "Sem. 2", …) — a school reads a
    // term as a week count, not calendar week numbers.
    const byWeek = new Map<string, { status: string }[]>();
    for (const row of rows) {
      const key = isoDate(mondayOf(row.date));
      const list = byWeek.get(key) ?? [];
      list.push(row);
      byWeek.set(key, list);
    }
    const weeklyTrend = [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, weekRows], i) => ({
        label: `Sem. ${i + 1}`,
        value: attendanceRate(weekRows) ?? 0,
      }));

    return NextResponse.json(
      {
        ...shell,
        distribution,
        weeklyTrend,
        overallRatePercent: attendanceRate(rows),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
