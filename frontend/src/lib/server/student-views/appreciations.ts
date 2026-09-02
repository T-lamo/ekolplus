// One student's full appreciation picture — extracted from the GET of
// /api/school/students/[id]/appreciations so the Espace Élève's GET
// /api/student/appreciations serves the same read model: the "générale"
// row (subjectId: null) if any, one row per subject the student is graded
// in (existing or not-yet-created), per-subject averages, overall average +
// rank, and (staff only) prev/next studentId within the same class for the
// Saisir wizard's navigation.
//
// `audience: 'student'` applies the portal rules: DRAFT appreciations are
// never read (a teacher's unfinished text stays private until published),
// and `studentIndex`/`prevStudentId`/`nextStudentId` are null — a student
// has no business knowing who sits next to them in the roster order.
// Classmates are still read to compute the class average and the rank,
// but never exposed. Returns null without any enrollment; both routes map
// that to their existing 404.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import {
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor,
  weightedAverage,
} from '@/lib/server/grades';
import type { ViewAudience } from './audience';

export interface StudentAppreciationsInput {
  studentId: string;
  termId: string | null;
  audience: ViewAudience;
}

export interface StudentAppreciationsView {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  homeroomTeacherName: string | null;
  terms: { id: string; label: string; order: number }[];
  resolvedTermId: string | null;
  studentIndex: number | null;
  classSize: number;
  prevStudentId: string | null;
  nextStudentId: string | null;
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  general: {
    mention: string | null;
    text: string | null;
    comportement: string | null;
    investissement: string | null;
    assiduite: string | null;
    status: string;
    authorName: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  subjects: {
    classSubjectId: string;
    subjectId: string;
    subjectName: string;
    coefficient: number | null;
    teacherName: string | null;
    average: number | null;
    mention: string | null;
    text: string | null;
    status: string;
  }[];
}

export async function getStudentAppreciations(
  input: StudentAppreciationsInput,
): Promise<StudentAppreciationsView | null> {
  const { studentId, audience } = input;
  const publishedOnly = audience === 'student' ? { status: 'PUBLISHED' as const } : {};

  const [student, enrollment] = await Promise.all([
    prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { firstName: true, lastName: true, studentNumber: true },
    }),
    prisma.enrollment.findFirst({
      where: { studentId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            academicYearId: true,
            homeroomTeacher: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);
  if (!enrollment) return null;

  const terms = await prisma.term.findMany({
    where: { academicYearId: enrollment.class.academicYearId },
    orderBy: { order: 'asc' },
  });
  let term: (typeof terms)[number] | null;
  if (input.termId) {
    term = terms.find((t) => t.id === input.termId) ?? null;
  } else {
    // No explicit termId: resolveCurrentTerm's date-based default can miss
    // an appreciation that was saved against an earlier term (e.g. the
    // author had switched the term filter before saving). Prefer whichever
    // term actually holds data for this student over the naive "current"
    // one, so a freshly-saved appreciation is never invisible by default.
    const current = resolveCurrentTerm(terms);
    const termIds = terms.map((t) => t.id);
    const existing =
      termIds.length === 0
        ? []
        : await prisma.appreciation.findMany({
            where: { studentId, termId: { in: termIds }, ...publishedOnly },
            select: { termId: true },
          });
    const termIdsWithData = new Set(existing.map((a) => a.termId));
    term =
      current && !termIdsWithData.has(current.id) && termIdsWithData.size > 0
        ? (terms.filter((t) => termIdsWithData.has(t.id)).sort((a, b) => b.order - a.order)[0] ??
          current)
        : current;
  }

  const classmates = await prisma.enrollment.findMany({
    where: { classId: enrollment.classId, academicYearId: enrollment.class.academicYearId },
    include: { student: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });
  const idx = classmates.findIndex((cm) => cm.studentId === studentId);
  const rosterNav =
    audience === 'student'
      ? { studentIndex: null, prevStudentId: null, nextStudentId: null }
      : {
          studentIndex: idx >= 0 ? idx + 1 : null,
          prevStudentId: idx > 0 ? classmates[idx - 1]!.studentId : null,
          nextStudentId:
            idx >= 0 && idx < classmates.length - 1 ? classmates[idx + 1]!.studentId : null,
        };

  const shell = {
    studentId,
    firstName: student.firstName,
    lastName: student.lastName,
    studentNumber: student.studentNumber,
    classId: enrollment.classId,
    className: enrollment.class.name,
    homeroomTeacherName: enrollment.class.homeroomTeacher?.name ?? null,
    terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
    resolvedTermId: term?.id ?? null,
    classSize: classmates.length,
    ...rosterNav,
  };

  if (!term) {
    return {
      ...shell,
      overallAverage: null,
      classAverage: null,
      rank: null,
      rankedCount: 0,
      general: null,
      subjects: [],
    };
  }

  const classSubjects = await prisma.classSubject.findMany({
    where: { classId: enrollment.classId },
    include: { subject: true, teacher: { select: { id: true, name: true } } },
    orderBy: [{ subject: { domain: 'asc' } }, { subject: { name: 'asc' } }],
  });
  const classSubjectIds = classSubjects.map((cs) => cs.id);

  const [evaluations, appreciations] = await Promise.all([
    classSubjectIds.length === 0
      ? Promise.resolve([])
      : prisma.evaluation.findMany({
          where: { classSubjectId: { in: classSubjectIds }, termId: term.id },
          include: { grades: true },
        }),
    prisma.appreciation.findMany({
      where: { studentId, termId: term.id, ...publishedOnly },
      include: { author: { select: { name: true, email: true } } },
    }),
  ]);

  const evalsByClassSubject = new Map<string, typeof evaluations>();
  for (const ev of evaluations) {
    const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
    list.push(ev);
    evalsByClassSubject.set(ev.classSubjectId, list);
  }
  const apprByClassSubject = new Map(
    appreciations.filter((a) => a.subjectId != null).map((a) => [a.subjectId!, a]),
  );
  const generalRow = appreciations.find((a) => a.subjectId == null) ?? null;

  function subjectAverageOf(cs: (typeof classSubjects)[number], studentIdArg: string) {
    return subjectAverageFor(evalsByClassSubject.get(cs.id) ?? [], studentIdArg);
  }

  function generalAverageFor(studentIdArg: string): number | null {
    const rows = classSubjects
      .map((cs) => {
        const avg = subjectAverageOf(cs, studentIdArg);
        return avg != null ? { value: avg, weight: cs.coefficient } : null;
      })
      .filter((r): r is { value: number; weight: number | null } => r != null);
    return weightedAverage(rows);
  }

  const overallAverage = generalAverageFor(studentId);
  const classAveragesRaw = classmates
    .map((cm) => generalAverageFor(cm.studentId))
    .filter((a): a is number => a != null);
  const classAverage = classAveragesRaw.length
    ? Math.round((classAveragesRaw.reduce((a, b) => a + b, 0) / classAveragesRaw.length) * 10) / 10
    : null;

  const rankingRaw = classmates
    .map((cm) => ({ studentId: cm.studentId, average: generalAverageFor(cm.studentId) }))
    .filter((r): r is { studentId: string; average: number } => r.average != null)
    .sort((a, b) => b.average - a.average);
  const ranks = competitionRank(rankingRaw, (r) => r.average);
  const rankEntry = rankingRaw.findIndex((r) => r.studentId === studentId);

  return {
    ...shell,
    overallAverage,
    classAverage,
    rank: rankEntry >= 0 ? ranks[rankEntry]! : null,
    rankedCount: rankingRaw.length,
    general: generalRow
      ? {
          mention: generalRow.mention,
          text: generalRow.text,
          comportement: generalRow.comportement,
          investissement: generalRow.investissement,
          assiduite: generalRow.assiduite,
          status: generalRow.status,
          authorName: generalRow.author?.name ?? generalRow.author?.email ?? null,
          createdAt: generalRow.createdAt,
          updatedAt: generalRow.updatedAt,
        }
      : null,
    subjects: classSubjects.map((cs) => {
      const appr = apprByClassSubject.get(cs.subjectId);
      return {
        classSubjectId: cs.id,
        subjectId: cs.subjectId,
        subjectName: cs.subject.name,
        coefficient: cs.coefficient,
        teacherName: cs.teacher?.name ?? null,
        average: subjectAverageOf(cs, studentId),
        mention: appr?.mention ?? null,
        text: appr?.text ?? null,
        status: appr?.status ?? 'NONE',
      };
    }),
  };
}
