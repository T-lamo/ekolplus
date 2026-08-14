// GET /api/school/classes/[id]/appreciations?termId= — Appréciations list
// read model: every enrolled student's general average + rank (same
// formulas as classes/[id]/notebook's generalAverage), their "générale"
// (subjectId: null) appreciation if one exists, and class-wide summary
// counts. `termId` omitted = resolve the current term.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import {
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor,
  weightedAverage,
} from '@/lib/server/grades';
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
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: { homeroomTeacher: { select: { id: true, name: true } } },
    });
    if (!cls || cls.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Class not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const terms = await prisma.term.findMany({
      where: { academicYear: { id: cls.academicYearId } },
      orderBy: { order: 'asc' },
    });
    const termIdParam = req.nextUrl.searchParams.get('termId');
    const term = termIdParam
      ? (terms.find((t) => t.id === termIdParam) ?? null)
      : resolveCurrentTerm(terms);

    const shell = {
      classId,
      className: cls.name,
      homeroomTeacherName: cls.homeroomTeacher?.name ?? null,
      terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
      resolvedTermId: term?.id ?? null,
    };

    if (!term) {
      return NextResponse.json(
        {
          ...shell,
          students: [],
          subjects: [],
          totalCount: 0,
          saisieCount: 0,
          positiveCount: 0,
          alertCount: 0,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [classSubjects, enrollments] = await Promise.all([
      prisma.classSubject.findMany({
        where: { classId },
        include: { subject: true, teacher: { select: { id: true, name: true } } },
      }),
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

    const [evaluations, appreciations] = await Promise.all([
      classSubjectIds.length === 0
        ? Promise.resolve([])
        : prisma.evaluation.findMany({
            where: { classSubjectId: { in: classSubjectIds }, termId: term.id },
            include: { grades: true },
          }),
      studentIds.length === 0
        ? Promise.resolve([])
        : prisma.appreciation.findMany({
            where: { studentId: { in: studentIds }, termId: term.id },
            include: { author: { select: { name: true, email: true } } },
          }),
    ]);

    const evalsByClassSubject = new Map<string, typeof evaluations>();
    for (const ev of evaluations) {
      const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
      list.push(ev);
      evalsByClassSubject.set(ev.classSubjectId, list);
    }
    const generalAppreciations = appreciations.filter((a) => a.subjectId == null);
    const subjectAppreciations = appreciations.filter((a) => a.subjectId != null);
    const appreciationByStudent = new Map(generalAppreciations.map((a) => [a.studentId, a]));
    const subjectApprBySubjectId = new Map<string, typeof subjectAppreciations>();
    for (const a of subjectAppreciations) {
      const list = subjectApprBySubjectId.get(a.subjectId!) ?? [];
      list.push(a);
      subjectApprBySubjectId.set(a.subjectId!, list);
    }

    function generalAverageFor(studentId: string): number | null {
      const rows = classSubjects
        .map((cs) => {
          const avg = subjectAverageFor(evalsByClassSubject.get(cs.id) ?? [], studentId);
          return avg != null ? { value: avg, weight: cs.coefficient } : null;
        })
        .filter((r): r is { value: number; weight: number | null } => r != null);
      return weightedAverage(rows);
    }

    const withAverage = enrollments.map((en) => ({
      studentId: en.studentId,
      firstName: en.student.firstName,
      lastName: en.student.lastName,
      studentNumber: en.student.studentNumber,
      average: generalAverageFor(en.studentId),
    }));
    const ranked = [...withAverage]
      .filter((s) => s.average != null)
      .sort((a, b) => b.average! - a.average!);
    const ranks = competitionRank(ranked, (s) => s.average!);
    const rankByStudent = new Map(ranked.map((s, i) => [s.studentId, ranks[i]!]));

    const students = withAverage.map((s) => {
      const appr = appreciationByStudent.get(s.studentId);
      return {
        studentId: s.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        studentNumber: s.studentNumber,
        average: s.average,
        rank: rankByStudent.get(s.studentId) ?? null,
        mention: appr?.mention ?? null,
        text: appr?.text ?? null,
        status: appr?.status ?? 'NONE',
        authorName: appr?.author?.name ?? appr?.author?.email ?? null,
      };
    });

    const saisieCount = students.filter((s) => s.status === 'PUBLISHED').length;
    const positiveCount = students.filter(
      (s) => s.mention === 'TRES_BIEN' || s.mention === 'BIEN',
    ).length;
    const alertCount = students.filter((s) => s.mention === 'INSUFFISANT').length;

    const subjects = classSubjects.map((cs) => {
      const apprList = subjectApprBySubjectId.get(cs.subjectId) ?? [];
      const classAverages = enrollments
        .map((en) => subjectAverageFor(evalsByClassSubject.get(cs.id) ?? [], en.studentId))
        .filter((a): a is number => a != null);
      return {
        classSubjectId: cs.id,
        subjectId: cs.subjectId,
        subjectName: cs.subject.name,
        teacherName: cs.teacher?.name ?? null,
        coefficient: cs.coefficient,
        classAverage: classAverages.length
          ? Math.round((classAverages.reduce((a, b) => a + b, 0) / classAverages.length) * 10) / 10
          : null,
        saisieCount: apprList.filter((a) => a.status === 'PUBLISHED').length,
        totalCount: enrollments.length,
      };
    });

    return NextResponse.json(
      {
        ...shell,
        students,
        subjects,
        totalCount: students.length,
        saisieCount,
        positiveCount,
        alertCount,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
