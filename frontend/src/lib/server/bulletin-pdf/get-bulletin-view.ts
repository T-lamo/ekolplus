// Shared bulletin-view data model — the single source of truth for "what
// does this student's bulletin contain", consumed by both the
// authenticated GET /api/school/students/[id]/bulletin route (Viewer page)
// and the token-authorized print page (server-side PDF generation, see
// docs/superpowers/specs/2026-08-13-bulletin-pdf-and-editor-design.md).
// Extracted so both callers share one query path rather than risking drift
// between "what the Viewer shows" and "what the PDF prints".
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import {
  classGeneralAverages,
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor,
} from '@/lib/server/grades';

export interface StudentBulletinView {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  dateOfBirth: Date | null;
  classId: string;
  className: string;
  classSize: number;
  homeroomTeacherName: string | null;
  schoolName: string;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  schoolLogoUrl: string | null;
  directorSignatureUrl: string | null;
  academicYearLabel: string;
  terms: { id: string; label: string; order: number }[];
  resolvedTermId: string | null;
  studentIndex: number | null;
  prevStudentId: string | null;
  nextStudentId: string | null;
  template: { id: string; name: string; config: unknown; isActive: boolean } | null;
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  subjects: {
    subjectName: string;
    teacherName: string | null;
    coefficient: number | null;
    average: number | null;
    classAverage: number | null;
    min: number | null;
    max: number | null;
    appreciation: string | null;
  }[];
  generalAppreciation: string | null;
}

export async function getStudentBulletinView(
  schoolId: string,
  studentId: string,
  termIdParam: string | null,
): Promise<StudentBulletinView | null> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.schoolId !== schoolId) return null;

  const [school, enrollment] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId } }),
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

  const [terms, academicYear] = await Promise.all([
    prisma.term.findMany({
      where: { academicYearId: enrollment.class.academicYearId },
      orderBy: { order: 'asc' },
    }),
    prisma.academicYear.findUnique({ where: { id: enrollment.class.academicYearId } }),
  ]);
  const term = termIdParam
    ? (terms.find((t) => t.id === termIdParam) ?? null)
    : resolveCurrentTerm(terms);

  const classmates = await prisma.enrollment.findMany({
    where: { classId: enrollment.classId, academicYearId: enrollment.class.academicYearId },
    include: { student: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });
  const idx = classmates.findIndex((cm) => cm.studentId === studentId);
  const prevStudentId = idx > 0 ? classmates[idx - 1]!.studentId : null;
  const nextStudentId =
    idx >= 0 && idx < classmates.length - 1 ? classmates[idx + 1]!.studentId : null;

  const [activeTemplate, fallbackTemplate] = await Promise.all([
    prisma.bulletinTemplate.findFirst({ where: { schoolId, isActive: true } }),
    prisma.bulletinTemplate.findFirst({
      where: { schoolId: null },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const template = activeTemplate ?? fallbackTemplate;

  const shell = {
    studentId,
    firstName: student.firstName,
    lastName: student.lastName,
    studentNumber: student.studentNumber,
    dateOfBirth: student.dateOfBirth,
    classId: enrollment.classId,
    className: enrollment.class.name,
    classSize: classmates.length,
    homeroomTeacherName: enrollment.class.homeroomTeacher?.name ?? null,
    schoolName: school?.name ?? '',
    schoolAddress: school?.address ?? null,
    schoolPhone: school?.phone ?? null,
    schoolEmail: school?.officialEmail ?? null,
    schoolLogoUrl: school?.logoUrl ?? null,
    directorSignatureUrl: school?.directorSignatureUrl ?? null,
    academicYearLabel: academicYear?.label ?? '',
    terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
    resolvedTermId: term?.id ?? null,
    studentIndex: idx >= 0 ? idx + 1 : null,
    prevStudentId,
    nextStudentId,
    template: template
      ? {
          id: template.id,
          name: template.name,
          config: template.config,
          isActive: template.isActive,
        }
      : null,
  };

  if (!term) {
    return {
      ...shell,
      overallAverage: null,
      classAverage: null,
      rank: null,
      rankedCount: 0,
      subjects: [],
      generalAppreciation: null,
    };
  }

  const classSubjects = await prisma.classSubject.findMany({
    where: { classId: enrollment.classId },
    include: { subject: true, teacher: { select: { id: true, name: true } } },
    orderBy: [{ subject: { domain: 'asc' } }, { subject: { name: 'asc' } }],
  });
  const classSubjectIds = classSubjects.map((cs) => cs.id);
  const classmateIds = classmates.map((cm) => cm.studentId);

  const [evaluations, appreciations] = await Promise.all([
    classSubjectIds.length === 0
      ? Promise.resolve([])
      : prisma.evaluation.findMany({
          where: { classSubjectId: { in: classSubjectIds }, termId: term.id },
          include: { grades: true },
        }),
    prisma.appreciation.findMany({ where: { studentId, termId: term.id } }),
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

  const subjects = classSubjects.map((cs) => {
    const evals = evalsByClassSubject.get(cs.id) ?? [];
    const classAveragesForSubject = classmateIds
      .map((id) => subjectAverageFor(evals, id))
      .filter((a): a is number => a != null);
    const classAverage = classAveragesForSubject.length
      ? Math.round(
          (classAveragesForSubject.reduce((a, b) => a + b, 0) / classAveragesForSubject.length) *
            10,
        ) / 10
      : null;
    const appr = apprByClassSubject.get(cs.subjectId);
    return {
      subjectName: cs.subject.name,
      teacherName: cs.teacher?.name ?? null,
      coefficient: cs.coefficient,
      average: subjectAverageFor(evals, studentId),
      classAverage,
      min: classAveragesForSubject.length ? Math.min(...classAveragesForSubject) : null,
      max: classAveragesForSubject.length ? Math.max(...classAveragesForSubject) : null,
      appreciation: appr?.text ?? null,
    };
  });

  const averages = classGeneralAverages(classSubjects, evalsByClassSubject, classmateIds);
  const overallAverage = averages.get(studentId) ?? null;
  const classAverageValues = [...averages.values()].filter((a): a is number => a != null);
  const classAverage = classAverageValues.length
    ? Math.round((classAverageValues.reduce((a, b) => a + b, 0) / classAverageValues.length) * 10) /
      10
    : null;
  const ranked = classmateIds
    .map((id) => ({ studentId: id, average: averages.get(id) ?? null }))
    .filter((r): r is { studentId: string; average: number } => r.average != null)
    .sort((a, b) => b.average - a.average);
  const ranks = competitionRank(ranked, (r) => r.average);
  const rankEntry = ranked.findIndex((r) => r.studentId === studentId);

  return {
    ...shell,
    overallAverage,
    classAverage,
    rank: rankEntry >= 0 ? ranks[rankEntry]! : null,
    rankedCount: ranked.length,
    subjects,
    generalAppreciation: generalRow?.text ?? null,
  };
}
