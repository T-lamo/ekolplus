// GET /api/school/students/[id]/attendance?termId= — one student's full
// attendance picture for the Student Profile "Présences" tab (and its hero
// stats): term summary (rate/absences/lates via the same helpers the main
// Présences roster uses, so the two never drift) plus the full chronological
// day log for that term. Same terms+resolvedTermId shell convention as
// students/[id]/appreciations.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import { resolveCurrentTerm } from '@/lib/server/grades';
import { absenceCount, attendanceRate, isoDate } from '@/lib/server/attendance';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

async function assertOwnedStudent(id: string, schoolId: string) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student || student.schoolId !== schoolId) return null;
  return student;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

    const { id: studentId } = await params;
    const student = await assertOwnedStudent(studentId, mySchool.schoolId);
    if (!student) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId },
      orderBy: { enrolledAt: 'desc' },
      select: { class: { select: { academicYearId: true } } },
    });
    if (!enrollment) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student has no active enrollment' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const terms = await prisma.term.findMany({
      where: { academicYearId: enrollment.class.academicYearId },
      orderBy: { order: 'asc' },
    });
    const termIdParam = req.nextUrl.searchParams.get('termId');
    const term = termIdParam
      ? (terms.find((t) => t.id === termIdParam) ?? null)
      : resolveCurrentTerm(terms);

    const shell = {
      studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
      resolvedTermId: term?.id ?? null,
    };

    if (!term) {
      return NextResponse.json(
        {
          ...shell,
          summary: { present: 0, absent: 0, late: 0, excused: 0, recorded: 0 },
          ratePercent: null,
          absences: 0,
          days: [],
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rows = await prisma.attendance.findMany({
      where: { studentId, date: { gte: term.startDate, lte: term.endDate } },
      orderBy: { date: 'asc' },
    });

    return NextResponse.json(
      {
        ...shell,
        summary: {
          present: rows.filter((r) => r.status === 'PRESENT').length,
          absent: rows.filter((r) => r.status === 'ABSENT').length,
          late: rows.filter((r) => r.status === 'LATE').length,
          excused: rows.filter((r) => r.status === 'EXCUSED').length,
          recorded: rows.length,
        },
        ratePercent: attendanceRate(rows),
        absences: absenceCount(rows),
        days: rows.map((r) => ({
          date: isoDate(r.date),
          status: r.status,
          justification: r.justification,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
