// GET /api/teacher/students/[id]?termId= — the lightweight student profile
// for the teacher portal: identity + class, then ONLY what this teacher
// owns pedagogically for the selected term (their subjects' evaluations
// with this student's grades and the matching averages, their subjects'
// appreciations, plus the general appreciation when they homeroom the
// student's class). Deliberately NO contacts, guardians, finances or full
// record: that surface belongs to the school back-office. 404 anti-leak
// everywhere, including a termId from another year. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { resolveCurrentTerm, subjectAverageFor } from '@/lib/server/grades';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    if (!mySchool) return notFound(ctx.requestId);
    const myTeacher = await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId);
    if (!myTeacher) return notFound(ctx.requestId);

    const { id } = await params;

    const myClassSubjects =
      myTeacher.classSubjectIds.length > 0
        ? await prisma.classSubject.findMany({
            where: { id: { in: myTeacher.classSubjectIds } },
            select: {
              id: true,
              classId: true,
              subjectId: true,
              subject: { select: { name: true } },
            },
          })
        : [];
    const myClassIds = [
      ...new Set([...myTeacher.homeroomClassIds, ...myClassSubjects.map((cs) => cs.classId)]),
    ];

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: id, academicYear: { isActive: true }, classId: { in: myClassIds } },
      select: {
        classId: true,
        academicYearId: true,
        class: { select: { id: true, name: true, level: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
            photoUrl: true,
            status: true,
            schoolId: true,
          },
        },
      },
    });
    if (!enrollment || enrollment.student.schoolId !== mySchool.schoolId) {
      return notFound(ctx.requestId);
    }

    const terms = await prisma.term.findMany({
      where: { academicYearId: enrollment.academicYearId },
      orderBy: { order: 'asc' },
      select: { id: true, label: true, order: true, startDate: true, endDate: true },
    });
    const requestedTermId = req.nextUrl.searchParams.get('termId');
    const term = requestedTermId
      ? (terms.find((t) => t.id === requestedTermId) ?? null)
      : resolveCurrentTerm(terms);
    if (requestedTermId && !term) return notFound(ctx.requestId);

    const inThisClass = myClassSubjects.filter((cs) => cs.classId === enrollment.classId);
    const isMyHomeroom = myTeacher.homeroomClassIds.includes(enrollment.classId);

    const evaluations =
      term && inThisClass.length > 0
        ? await prisma.evaluation.findMany({
            where: { classSubjectId: { in: inThisClass.map((cs) => cs.id) }, termId: term.id },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              classSubjectId: true,
              label: true,
              type: true,
              date: true,
              maxScore: true,
              coefficient: true,
              status: true,
              countsTowardAverage: true,
              grades: {
                where: { studentId: id },
                select: { studentId: true, score: true, absent: true, comment: true },
              },
            },
          })
        : [];

    const subjects = inThisClass.map((cs) => {
      const evals = evaluations.filter((e) => e.classSubjectId === cs.id);
      return {
        classSubjectId: cs.id,
        subjectId: cs.subjectId,
        subjectName: cs.subject.name,
        evaluations: evals.map((e) => {
          const g = e.grades[0];
          return {
            id: e.id,
            label: e.label,
            type: e.type,
            date: e.date ? e.date.toISOString() : null,
            maxScore: e.maxScore,
            coefficient: e.coefficient,
            status: e.status,
            score: g?.score ?? null,
            absent: g?.absent ?? false,
            comment: g?.comment ?? null,
          };
        }),
        average: subjectAverageFor(evals, id),
      };
    });

    const appreciations = term
      ? await prisma.appreciation.findMany({
          where: {
            studentId: id,
            termId: term.id,
            OR: [
              { subjectId: { in: inThisClass.map((cs) => cs.subjectId) } },
              ...(isMyHomeroom ? [{ subjectId: null }] : []),
            ],
          },
          select: {
            subjectId: true,
            mention: true,
            text: true,
            comportement: true,
            investissement: true,
            assiduite: true,
            status: true,
          },
        })
      : [];

    return NextResponse.json(
      {
        student: {
          id: enrollment.student.id,
          firstName: enrollment.student.firstName,
          lastName: enrollment.student.lastName,
          studentNumber: enrollment.student.studentNumber,
          photoUrl: enrollment.student.photoUrl,
          status: enrollment.student.status,
        },
        class: enrollment.class,
        isMyHomeroom,
        term: term ? { id: term.id, label: term.label } : null,
        subjects,
        appreciations,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
