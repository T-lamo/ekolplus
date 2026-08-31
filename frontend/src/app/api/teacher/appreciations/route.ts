// GET /api/teacher/appreciations?termId= — the Appréciations list screen's
// aggregate: one card per class I teach in or homeroom (active year only),
// with my per-subject PUBLISHED saisie counts, the general-row count when I
// am the homeroom teacher, and the first student to enter the per-student
// wizard on. Mirrors the school classes/[id]/appreciations read model,
// collapsed to one call and scoped to my affectations. 404 anti-leak.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { resolveCurrentTerm } from '@/lib/server/grades';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    if (!mySchool) return notFound(ctx.requestId);
    const myTeacher = await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId);
    if (!myTeacher) return notFound(ctx.requestId);

    const activeYear = await prisma.academicYear.findFirst({
      where: { schoolId: mySchool.schoolId, isActive: true },
      select: { id: true },
    });
    if (!activeYear) {
      return NextResponse.json(
        { terms: [], resolvedTermId: null, classes: [] },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const terms = await prisma.term.findMany({
      where: { academicYearId: activeYear.id },
      orderBy: { order: 'asc' },
      select: { id: true, label: true, order: true, startDate: true, endDate: true },
    });
    const requestedTermId = req.nextUrl.searchParams.get('termId');
    const term = requestedTermId
      ? (terms.find((t) => t.id === requestedTermId) ?? null)
      : resolveCurrentTerm(terms);
    if (requestedTermId && !term) return notFound(ctx.requestId);

    const myClassSubjects =
      myTeacher.classSubjectIds.length > 0
        ? await prisma.classSubject.findMany({
            where: { id: { in: myTeacher.classSubjectIds } },
            select: {
              id: true,
              classId: true,
              subjectId: true,
              subject: { select: { name: true } },
              class: { select: { id: true, name: true, level: true, academicYearId: true } },
            },
          })
        : [];
    const homeroomClasses =
      myTeacher.homeroomClassIds.length > 0
        ? await prisma.class.findMany({
            where: { id: { in: myTeacher.homeroomClassIds } },
            select: { id: true, name: true, level: true, academicYearId: true },
          })
        : [];

    // Active-year classes only: a stale ClassSubject from a previous year
    // must not resurface here (same active-year scoping as Mes élèves).
    const classById = new Map<string, { id: string; name: string; level: string | null }>();
    for (const cs of myClassSubjects) {
      if (cs.class.academicYearId === activeYear.id) classById.set(cs.class.id, cs.class);
    }
    for (const c of homeroomClasses) {
      if (c.academicYearId === activeYear.id) classById.set(c.id, c);
    }
    const classIds = [...classById.keys()];

    const enrollments =
      classIds.length > 0
        ? await prisma.enrollment.findMany({
            where: { classId: { in: classIds }, academicYearId: activeYear.id },
            include: { student: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
          })
        : [];
    const enrollmentsByClass = new Map<string, typeof enrollments>();
    for (const en of enrollments) {
      const list = enrollmentsByClass.get(en.classId) ?? [];
      list.push(en);
      enrollmentsByClass.set(en.classId, list);
    }

    const mySubjectIdsByClass = new Map<string, { subjectId: string; subjectName: string }[]>();
    for (const cs of myClassSubjects) {
      if (!classById.has(cs.classId)) continue;
      const list = mySubjectIdsByClass.get(cs.classId) ?? [];
      list.push({ subjectId: cs.subjectId, subjectName: cs.subject.name });
      mySubjectIdsByClass.set(cs.classId, list);
    }

    const allStudentIds = enrollments.map((en) => en.studentId);
    const allMySubjectIds = [...new Set(myClassSubjects.map((cs) => cs.subjectId))];
    const scopeOr = [
      ...(allMySubjectIds.length > 0 ? [{ subjectId: { in: allMySubjectIds } }] : []),
      ...(myTeacher.homeroomClassIds.length > 0 ? [{ subjectId: null }] : []),
    ];
    const appreciations =
      term && allStudentIds.length > 0 && scopeOr.length > 0
        ? await prisma.appreciation.findMany({
            where: { studentId: { in: allStudentIds }, termId: term.id, OR: scopeOr },
            select: { studentId: true, subjectId: true, status: true },
          })
        : [];
    const studentClass = new Map(enrollments.map((en) => [en.studentId, en.classId]));

    const classes = [...classById.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => {
        const classEnrollments = enrollmentsByClass.get(c.id) ?? [];
        const isMyHomeroom = myTeacher.homeroomClassIds.includes(c.id);
        const mySubjects = mySubjectIdsByClass.get(c.id) ?? [];
        const classAppr = appreciations.filter((a) => studentClass.get(a.studentId) === c.id);
        return {
          classId: c.id,
          className: c.name,
          level: c.level,
          studentCount: classEnrollments.length,
          isMyHomeroom,
          firstStudentId: classEnrollments[0]?.studentId ?? null,
          generalSaisieCount: isMyHomeroom
            ? classAppr.filter((a) => a.subjectId === null && a.status === 'PUBLISHED').length
            : null,
          subjects: mySubjects.map((s) => ({
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            saisieCount: classAppr.filter(
              (a) => a.subjectId === s.subjectId && a.status === 'PUBLISHED',
            ).length,
          })),
        };
      });

    return NextResponse.json(
      {
        terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
        resolvedTermId: term?.id ?? null,
        classes,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
