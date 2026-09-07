// Published qualitative grids of ONE student for one term: the read model
// of GET /api/student/criteria-assessments and of the bulletin view's
// `qualitativeSubjects`. Only PUBLISHED sheets, only the student's own
// ticks (never a classmate's), subjects in class-subject creation order,
// criteria in `order`. Spec 2026-09-05 §7, §10.2.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { resolveCurrentTerm } from '@/lib/server/grades';

export interface StudentQualitativeGrid {
  classSubjectId: string;
  subjectName: string;
  ratingScale: string[];
  criteria: { id: string; label: string; level: number | null }[];
}

export async function loadPublishedGrids(args: {
  classId: string;
  studentId: string;
  termId: string;
}): Promise<StudentQualitativeGrid[]> {
  const sheets = await prisma.criteriaAssessment.findMany({
    where: {
      termId: args.termId,
      status: 'PUBLISHED',
      classSubject: { classId: args.classId, subject: { evaluationMode: 'QUALITATIVE' } },
    },
    orderBy: { classSubject: { createdAt: 'asc' } },
    select: {
      classSubjectId: true,
      classSubject: {
        select: {
          subject: {
            select: {
              name: true,
              ratingScale: true,
              criteria: { orderBy: { order: 'asc' }, select: { id: true, label: true } },
            },
          },
        },
      },
      ratings: { where: { studentId: args.studentId }, select: { criterionId: true, level: true } },
    },
  });
  return sheets.map((s) => {
    const levels = new Map(s.ratings.map((r) => [r.criterionId, r.level] as const));
    return {
      classSubjectId: s.classSubjectId,
      subjectName: s.classSubject.subject.name,
      ratingScale: s.classSubject.subject.ratingScale,
      criteria: s.classSubject.subject.criteria.map((c) => ({
        id: c.id,
        label: c.label,
        level: levels.get(c.id) ?? null,
      })),
    };
  });
}

export interface StudentQualitativeView {
  terms: { id: string; label: string }[];
  term: { id: string; label: string } | null;
  grids: StudentQualitativeGrid[];
}

/** `termId` null = the current term by date (same rule as results.ts). */
export async function getStudentQualitativeGrids(args: {
  academicYearId: string;
  classId: string;
  studentId: string;
  termId: string | null;
}): Promise<StudentQualitativeView> {
  const terms = await prisma.term.findMany({
    where: { academicYearId: args.academicYearId },
    orderBy: { order: 'asc' },
  });
  const term = args.termId
    ? (terms.find((t) => t.id === args.termId) ?? null)
    : resolveCurrentTerm(terms);
  const grids = term
    ? await loadPublishedGrids({
        classId: args.classId,
        studentId: args.studentId,
        termId: term.id,
      })
    : [];
  return {
    terms: terms.map((t) => ({ id: t.id, label: t.label })),
    term: term ? { id: term.id, label: term.label } : null,
    grids,
  };
}
