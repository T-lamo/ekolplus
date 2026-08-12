// GET /api/school/students/[id]/bulletin?termId= — Bulletin Viewer's full
// data model: student/class/term shell (+ prev/next studentId for the
// Viewer's navigation, same pattern as students/[id]/appreciations), school
// identity, the resolved template to render (school's active
// BulletinTemplate, falling back to the oldest global one if the school
// never activated any — see .planning/banani/report-cards-viewer.md), and
// every per-subject row INCLUDING class average/min/max — the last two are
// new: nothing else in the app computes a subject's min/max across the
// whole class, only this student's own value.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import {
  classGeneralAverages,
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor,
} from '@/lib/server/grades';
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

    const [school, enrollment] = await Promise.all([
      prisma.school.findUnique({ where: { id: mySchool.schoolId } }),
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
    if (!enrollment) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student has no active enrollment' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [terms, academicYear] = await Promise.all([
      prisma.term.findMany({
        where: { academicYearId: enrollment.class.academicYearId },
        orderBy: { order: 'asc' },
      }),
      prisma.academicYear.findUnique({ where: { id: enrollment.class.academicYearId } }),
    ]);
    const termIdParam = req.nextUrl.searchParams.get('termId');
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
      prisma.bulletinTemplate.findFirst({
        where: { schoolId: mySchool.schoolId, isActive: true },
      }),
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
      return NextResponse.json(
        {
          ...shell,
          overallAverage: null,
          classAverage: null,
          rank: null,
          rankedCount: 0,
          subjects: [],
          generalAppreciation: null,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
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
      ? Math.round(
          (classAverageValues.reduce((a, b) => a + b, 0) / classAverageValues.length) * 10,
        ) / 10
      : null;
    const ranked = classmateIds
      .map((id) => ({ studentId: id, average: averages.get(id) ?? null }))
      .filter((r): r is { studentId: string; average: number } => r.average != null)
      .sort((a, b) => b.average - a.average);
    const ranks = competitionRank(ranked, (r) => r.average);
    const rankEntry = ranked.findIndex((r) => r.studentId === studentId);

    return NextResponse.json(
      {
        ...shell,
        overallAverage,
        classAverage,
        rank: rankEntry >= 0 ? ranks[rankEntry]! : null,
        rankedCount: ranked.length,
        subjects,
        generalAppreciation: generalRow?.text ?? null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
