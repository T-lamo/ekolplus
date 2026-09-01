// GET /api/school/students/[id]/appreciations?termId= — one student's full
// appreciation picture: the "générale" row (subjectId: null) if any, one
// row per subject the student is graded in (existing or not-yet-created),
// per-subject averages (for the "Moy." column and mention suggestions),
// overall average + rank, and prev/next studentId within the same class
// (ordered like every other list — lastName/firstName) for the Saisir
// wizard's navigation.
//
// PUT — upsert ONE row (générale or one subject) by
// { termId, subjectId: string|null, mention?, text?, comportement?,
// investissement?, assiduite?, status? }. Same find-then-branch pattern as
// the Goals route: subjectId is nullable and Postgres doesn't dedupe NULLs
// in a unique index, so a naive upsert() on the compound key would create
// duplicate "générale" rows instead of updating the existing one.
//
// DELETE ?termId=&subjectId= (subjectId omitted = générale).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor,
  weightedAverage,
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

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'appreciations',
      'view',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id: studentId } = await params;
    const student = await assertOwnedStudent(studentId, mySchool.schoolId);
    if (!student) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const enrollment = await prisma.enrollment.findFirst({
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
    });
    if (!enrollment) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student has no active enrollment' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const terms = await prisma.term.findMany({
      where: { academicYearId: enrollment.class.academicYearId },
      orderBy: { order: 'asc' },
    });
    const termIdParam = req.nextUrl.searchParams.get('termId');
    let term: (typeof terms)[number] | null;
    if (termIdParam) {
      term = terms.find((t) => t.id === termIdParam) ?? null;
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
              where: { studentId, termId: { in: termIds } },
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
    const prevStudentId = idx > 0 ? classmates[idx - 1]!.studentId : null;
    const nextStudentId =
      idx >= 0 && idx < classmates.length - 1 ? classmates[idx + 1]!.studentId : null;

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
      studentIndex: idx >= 0 ? idx + 1 : null,
      classSize: classmates.length,
      prevStudentId,
      nextStudentId,
    };

    if (!term) {
      return NextResponse.json(
        {
          ...shell,
          overallAverage: null,
          classAverage: null,
          rank: null,
          rankedCount: 0,
          general: null,
          subjects: [],
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

    const [evaluations, appreciations] = await Promise.all([
      classSubjectIds.length === 0
        ? Promise.resolve([])
        : prisma.evaluation.findMany({
            where: { classSubjectId: { in: classSubjectIds }, termId: term.id },
            include: { grades: true },
          }),
      prisma.appreciation.findMany({
        where: { studentId, termId: term.id },
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
      ? Math.round((classAveragesRaw.reduce((a, b) => a + b, 0) / classAveragesRaw.length) * 10) /
        10
      : null;

    const rankingRaw = classmates
      .map((cm) => ({ studentId: cm.studentId, average: generalAverageFor(cm.studentId) }))
      .filter((r): r is { studentId: string; average: number } => r.average != null)
      .sort((a, b) => b.average - a.average);
    const ranks = competitionRank(rankingRaw, (r) => r.average);
    const rankEntry = rankingRaw.findIndex((r) => r.studentId === studentId);

    return NextResponse.json(
      {
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
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const UpsertAppreciationBody = z.object({
  termId: z.string().min(1),
  subjectId: z.string().min(1).nullable(),
  mention: z
    .enum(['TRES_BIEN', 'BIEN', 'ASSEZ_BIEN', 'PASSABLE', 'INSUFFISANT', 'FAIBLE'])
    .nullable()
    .optional(),
  text: z.string().trim().max(1000).nullable().optional(),
  comportement: z.string().trim().max(60).nullable().optional(),
  investissement: z.string().trim().max(60).nullable().optional(),
  assiduite: z.string().trim().max(60).nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'appreciations',
      'edit',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
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

    const parsed = UpsertAppreciationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { termId, subjectId } = parsed.data;

    const term = await prisma.term.findUnique({
      where: { id: termId },
      include: { academicYear: { select: { schoolId: true } } },
    });
    if (!term || term.academicYear.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid termId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (subjectId) {
      const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (!subject || subject.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid subjectId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const data = {
      mention: parsed.data.mention,
      text: parsed.data.text,
      comportement: parsed.data.comportement,
      investissement: parsed.data.investissement,
      assiduite: parsed.data.assiduite,
      status: parsed.data.status,
      authorId: auth.user.sub,
    };
    const cleanData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

    const existing = await prisma.appreciation.findFirst({
      where: { studentId, termId, subjectId },
    });
    const appreciation = existing
      ? await prisma.appreciation.update({ where: { id: existing.id }, data: cleanData })
      : await prisma.appreciation.create({
          data: { studentId, termId, subjectId, ...cleanData },
        });

    return NextResponse.json({ appreciation }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'appreciations',
      'delete',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
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

    const termId = req.nextUrl.searchParams.get('termId');
    const subjectId = req.nextUrl.searchParams.get('subjectId');
    if (!termId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'termId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.appreciation.findFirst({
      where: { studentId, termId, subjectId: subjectId ?? null },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Appreciation not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.appreciation.delete({ where: { id: existing.id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
