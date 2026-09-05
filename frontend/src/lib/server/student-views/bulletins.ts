// The Student Profile's "Bulletins" tab read model — extracted from GET
// /api/school/students/[id]/bulletins so the Espace Élève's GET
// /api/student/bulletins lists the same rows: one summary per Term (label,
// overallAverage, rank, rankedCount). Deliberately NOT a loop over
// getStudentBulletinView (the Viewer/PDF's full data model) — that shape
// is too expensive to compute once per term just for a summary list. Same
// classGeneralAverages/competitionRank math, evaluations only, once per
// term, in parallel.
//
// `audience: 'student'` asks explicitly for PUBLISHED evaluations. The
// averages already ignore drafts (subjectAverageFor), so this is the
// belt-and-braces expression of the portal rule at the query.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { classGeneralAverages, competitionRank } from '@/lib/server/grades';
import { NUMERIC_SUBJECT_FILTER } from '@/lib/server/qualitative';
import type { ViewAudience } from './audience';

export interface StudentBulletinSummariesInput {
  studentId: string;
  audience: ViewAudience;
}

export interface TermBulletinSummary {
  termId: string;
  label: string;
  order: number;
  overallAverage: number | null;
  rank: number | null;
  rankedCount: number;
}

export async function getStudentBulletinSummaries(
  input: StudentBulletinSummariesInput,
): Promise<{ terms: TermBulletinSummary[] }> {
  const { studentId, audience } = input;
  const publishedOnly = audience === 'student' ? { status: 'PUBLISHED' as const } : {};

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId },
    orderBy: { enrolledAt: 'desc' },
    select: { classId: true, class: { select: { academicYearId: true } } },
  });
  if (!enrollment) return { terms: [] };

  const [terms, classSubjects, classmates] = await Promise.all([
    prisma.term.findMany({
      where: { academicYearId: enrollment.class.academicYearId },
      orderBy: { order: 'asc' },
    }),
    prisma.classSubject.findMany({
      where: { classId: enrollment.classId, ...NUMERIC_SUBJECT_FILTER },
    }),
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
              where: { classSubjectId: { in: classSubjectIds }, termId: t.id, ...publishedOnly },
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

  return { terms: rows };
}
