// GET /api/school/students/[id]/bulletins — Student Profile's "Bulletins" tab
// read model: one summary row per Term (label, overallAverage, rank,
// rankedCount, status). Deliberately NOT a loop over getStudentBulletinView
// (the Viewer/PDF's full data model, which also joins template resolution +
// every subject's evaluations/appreciations + full classmate projection) —
// that shape is too expensive to compute once per term just for a summary
// list. This route reuses the same classGeneralAverages/competitionRank
// math but only ever touches evaluations, once per term, in parallel.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import { classGeneralAverages, competitionRank } from '@/lib/server/grades';
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

    const { id: studentId } = await params;
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId },
      orderBy: { enrolledAt: 'desc' },
      select: { classId: true, class: { select: { academicYearId: true } } },
    });
    if (!enrollment) {
      return NextResponse.json({ terms: [] }, { headers: { 'x-request-id': ctx.requestId } });
    }

    const [terms, classSubjects, classmates] = await Promise.all([
      prisma.term.findMany({
        where: { academicYearId: enrollment.class.academicYearId },
        orderBy: { order: 'asc' },
      }),
      prisma.classSubject.findMany({ where: { classId: enrollment.classId } }),
      prisma.enrollment.findMany({
        where: { classId: enrollment.classId, academicYearId: enrollment.class.academicYearId },
        select: { studentId: true },
      }),
    ]);
    const classSubjectIds = classSubjects.map((cs) => cs.id);
    const classmateIds = classmates.map((cm) => cm.studentId);

    const perTermEvaluations =
      classSubjectIds.length === 0
        ? terms.map(() => [])
        : await Promise.all(
            terms.map((t) =>
              prisma.evaluation.findMany({
                where: { classSubjectId: { in: classSubjectIds }, termId: t.id },
                include: { grades: true },
              }),
            ),
          );

    const rows = terms.map((t, i) => {
      const evaluations = perTermEvaluations[i]!;
      const evalsByClassSubject = new Map<string, typeof evaluations>();
      for (const ev of evaluations) {
        const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
        list.push(ev);
        evalsByClassSubject.set(ev.classSubjectId, list);
      }
      const averages = classGeneralAverages(classSubjects, evalsByClassSubject, classmateIds);
      const overallAverage = averages.get(studentId) ?? null;
      const ranked = classmateIds
        .map((id) => ({ studentId: id, average: averages.get(id) ?? null }))
        .filter((r): r is { studentId: string; average: number } => r.average != null)
        .sort((a, b) => b.average - a.average);
      const ranks = competitionRank(ranked, (r) => r.average);
      const rankEntry = ranked.findIndex((r) => r.studentId === studentId);

      return {
        termId: t.id,
        label: t.label,
        order: t.order,
        overallAverage,
        rank: rankEntry >= 0 ? ranks[rankEntry]! : null,
        rankedCount: ranked.length,
      };
    });

    return NextResponse.json({ terms: rows }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
