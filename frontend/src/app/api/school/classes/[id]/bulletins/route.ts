// GET /api/school/classes/[id]/bulletins?termId= — Report Cards list read
// model: every enrolled student's general average + rank + générale
// appreciation, plus class summary counts. No `Bulletin` row is persisted
// anywhere in this schema — per OVERVIEW.md decision #4 (HTML preview only
// this pass) every bulletin is a live computation over Grade/Evaluation/
// Appreciation, same as every other Epic 6/7 read model. `status` is
// derived, not stored: 'GENERATED' when the student has a computable
// overall average this term, else 'PENDING'.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import { classGeneralAverages, competitionRank, resolveCurrentTerm } from '@/lib/server/grades';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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

    const { id: classId } = await params;
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls || cls.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Class not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const terms = await prisma.term.findMany({
      where: { academicYearId: cls.academicYearId },
      orderBy: { order: 'asc' },
    });
    const termIdParam = req.nextUrl.searchParams.get('termId');
    const term = termIdParam
      ? (terms.find((t) => t.id === termIdParam) ?? null)
      : resolveCurrentTerm(terms);

    const shell = {
      classId,
      className: cls.name,
      terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
      resolvedTermId: term?.id ?? null,
    };

    if (!term) {
      return NextResponse.json(
        {
          ...shell,
          students: [],
          totalCount: 0,
          generatedCount: 0,
          pendingCount: 0,
          classAverage: null,
          strugglingCount: 0,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [classSubjects, enrollments] = await Promise.all([
      prisma.classSubject.findMany({ where: { classId } }),
      prisma.enrollment.findMany({
        where: { classId, academicYearId: cls.academicYearId },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
        },
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      }),
    ]);
    const classSubjectIds = classSubjects.map((cs) => cs.id);
    const studentIds = enrollments.map((en) => en.studentId);

    const [evaluations, generalAppreciations] = await Promise.all([
      classSubjectIds.length === 0
        ? Promise.resolve([])
        : prisma.evaluation.findMany({
            where: { classSubjectId: { in: classSubjectIds }, termId: term.id },
            include: { grades: true },
          }),
      studentIds.length === 0
        ? Promise.resolve([])
        : prisma.appreciation.findMany({
            where: { studentId: { in: studentIds }, termId: term.id, subjectId: null },
          }),
    ]);

    const evalsByClassSubject = new Map<string, typeof evaluations>();
    for (const ev of evaluations) {
      const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
      list.push(ev);
      evalsByClassSubject.set(ev.classSubjectId, list);
    }
    const appreciationByStudent = new Map(generalAppreciations.map((a) => [a.studentId, a]));

    const averages = classGeneralAverages(classSubjects, evalsByClassSubject, studentIds);

    const ranked = studentIds
      .map((id) => ({ studentId: id, average: averages.get(id) ?? null }))
      .filter((r): r is { studentId: string; average: number } => r.average != null)
      .sort((a, b) => b.average - a.average);
    const ranks = competitionRank(ranked, (r) => r.average);
    const rankByStudent = new Map(ranked.map((r, i) => [r.studentId, ranks[i]!]));

    const classAverageValues = [...averages.values()].filter((a): a is number => a != null);
    const classAverage = classAverageValues.length
      ? Math.round(
          (classAverageValues.reduce((a, b) => a + b, 0) / classAverageValues.length) * 10,
        ) / 10
      : null;

    const students = enrollments.map((en) => {
      const average = averages.get(en.studentId) ?? null;
      const appr = appreciationByStudent.get(en.studentId);
      return {
        studentId: en.studentId,
        firstName: en.student.firstName,
        lastName: en.student.lastName,
        studentNumber: en.student.studentNumber,
        average,
        rank: rankByStudent.get(en.studentId) ?? null,
        appreciation: appr?.text ?? null,
        status: average != null ? 'GENERATED' : 'PENDING',
      };
    });

    return NextResponse.json(
      {
        ...shell,
        students,
        totalCount: students.length,
        generatedCount: students.filter((s) => s.status === 'GENERATED').length,
        pendingCount: students.filter((s) => s.status === 'PENDING').length,
        classAverage,
        strugglingCount: students.filter((s) => s.average != null && s.average < 8).length,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
