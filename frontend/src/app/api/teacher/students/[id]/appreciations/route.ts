// GET /api/teacher/students/[id]/appreciations?termId= — the teacher-scoped
// mirror of the school appreciations wizard read model: prev/next within
// the class, classmates roster with my saisie progress, one row per MY
// subject in the student's class, and the general row plus overall
// average/rank ONLY when I homeroom the class (bulletin-level data belongs
// to the titulaire). 404 anti-leak everywhere. PUT upserts one row
// (find-then-branch: NULL subjectId does not dedupe in the unique index),
// DELETE removes one row; both re-check ownership in DB. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import {
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor,
  weightedAverage,
} from '@/lib/server/grades';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

// Shared by GET/PUT/DELETE: the caller's teacher profile, their
// classSubjects, and the student's active-year enrollment restricted to the
// caller's classes. Returns null for any scoping failure (one 404 shape).
async function resolveScope(userSub: string, studentId: string) {
  const mySchool = await resolveMySchoolIncludingTeacher(userSub);
  if (!mySchool) return null;
  const myTeacher = await resolveMyTeacherProfile(userSub, mySchool.schoolId);
  if (!myTeacher) return null;

  const myClassSubjects =
    myTeacher.classSubjectIds.length > 0
      ? await prisma.classSubject.findMany({
          where: { id: { in: myTeacher.classSubjectIds } },
          select: {
            id: true,
            classId: true,
            subjectId: true,
            coefficient: true,
            subject: { select: { name: true } },
          },
        })
      : [];
  const myClassIds = [
    ...new Set([...myTeacher.homeroomClassIds, ...myClassSubjects.map((cs) => cs.classId)]),
  ];
  if (myClassIds.length === 0) return null;

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, academicYear: { isActive: true }, classId: { in: myClassIds } },
    select: {
      classId: true,
      academicYearId: true,
      class: { select: { id: true, name: true, academicYearId: true } },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          studentNumber: true,
          schoolId: true,
        },
      },
    },
  });
  if (
    !enrollment ||
    enrollment.student.schoolId !== mySchool.schoolId ||
    enrollment.class.academicYearId !== enrollment.academicYearId
  ) {
    return null;
  }

  const inThisClass = myClassSubjects.filter((cs) => cs.classId === enrollment.classId);
  const isMyHomeroom = myTeacher.homeroomClassIds.includes(enrollment.classId);
  return { mySchool, myTeacher, enrollment, inThisClass, isMyHomeroom };
}

type SaisieStatus = 'PUBLISHED' | 'DRAFT' | 'NONE';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id: studentId } = await params;
    const scope = await resolveScope(auth.user.sub, studentId);
    if (!scope) return notFound(ctx.requestId);
    const { enrollment, inThisClass, isMyHomeroom } = scope;

    const terms = await prisma.term.findMany({
      where: { academicYearId: enrollment.academicYearId },
      orderBy: { order: 'asc' },
      select: { id: true, label: true, order: true, startDate: true, endDate: true },
    });
    const requestedTermId = req.nextUrl.searchParams.get('termId');
    let term = requestedTermId ? (terms.find((t) => t.id === requestedTermId) ?? null) : null;
    if (requestedTermId && !term) return notFound(ctx.requestId);
    const mySubjectIds = inThisClass.map((cs) => cs.subjectId);
    const myScopeOr = [
      ...(mySubjectIds.length > 0 ? [{ subjectId: { in: mySubjectIds } }] : []),
      ...(isMyHomeroom ? [{ subjectId: null }] : []),
    ];
    if (!requestedTermId) {
      // Same default as the school wizard: prefer a term that actually holds
      // data (in MY scope) over the naive current term, so a freshly saved
      // appreciation is never invisible by default.
      const current = resolveCurrentTerm(terms);
      const termIds = terms.map((t) => t.id);
      const existing =
        termIds.length === 0 || myScopeOr.length === 0
          ? []
          : await prisma.appreciation.findMany({
              where: { studentId, termId: { in: termIds }, OR: myScopeOr },
              select: { termId: true },
            });
      const withData = new Set(existing.map((a) => a.termId));
      term =
        current && !withData.has(current.id) && withData.size > 0
          ? (terms.filter((t) => withData.has(t.id)).sort((a, b) => b.order - a.order)[0] ??
            current)
          : current;
    }

    const classmates = await prisma.enrollment.findMany({
      where: { classId: enrollment.classId, academicYearId: enrollment.academicYearId },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    const idx = classmates.findIndex((cm) => cm.studentId === studentId);
    const prevStudentId = idx > 0 ? classmates[idx - 1]!.studentId : null;
    const nextStudentId =
      idx >= 0 && idx < classmates.length - 1 ? classmates[idx + 1]!.studentId : null;

    const shell = {
      studentId,
      firstName: enrollment.student.firstName,
      lastName: enrollment.student.lastName,
      studentNumber: enrollment.student.studentNumber,
      classId: enrollment.classId,
      className: enrollment.class.name,
      isMyHomeroom,
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
          classmates: classmates.map((cm) => ({
            studentId: cm.studentId,
            firstName: cm.student.firstName,
            lastName: cm.student.lastName,
            saisieStatus: 'NONE' as SaisieStatus,
          })),
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

    // My subjects: this student's averages only (grades filtered per student).
    const myEvaluations =
      inThisClass.length > 0
        ? await prisma.evaluation.findMany({
            where: { classSubjectId: { in: inThisClass.map((cs) => cs.id) }, termId: term.id },
            include: { grades: { where: { studentId } } },
          })
        : [];

    // Appreciations in my scope, for the whole class in one query: this
    // student's rows feed the form, the classmates' rows feed the roster's
    // saisie progress.
    const classStudentIds = classmates.map((cm) => cm.studentId);
    const scopedAppreciations =
      myScopeOr.length === 0 || classStudentIds.length === 0
        ? []
        : await prisma.appreciation.findMany({
            where: { studentId: { in: classStudentIds }, termId: term.id, OR: myScopeOr },
            include: { author: { select: { name: true, email: true } } },
          });
    const mine = scopedAppreciations.filter((a) => a.studentId === studentId);
    const generalRow = isMyHomeroom ? (mine.find((a) => a.subjectId == null) ?? null) : null;
    const mineBySubject = new Map(
      mine.filter((a) => a.subjectId != null).map((a) => [a.subjectId!, a]),
    );

    function saisieStatusFor(cmId: string): SaisieStatus {
      const rows = scopedAppreciations.filter((a) => a.studentId === cmId);
      if (isMyHomeroom) {
        const general = rows.find((a) => a.subjectId == null);
        return (general?.status as SaisieStatus | undefined) ?? 'NONE';
      }
      const subjectRows = rows.filter((a) => a.subjectId != null);
      if (subjectRows.length === 0) return 'NONE';
      const allPublished =
        subjectRows.length >= mySubjectIds.length &&
        subjectRows.every((a) => a.status === 'PUBLISHED');
      return allPublished ? 'PUBLISHED' : 'DRAFT';
    }

    // Bulletin-level numbers (overall average, class average, rank) span ALL
    // the class's subjects, so they are computed, and disclosed, only for
    // the homeroom teacher.
    let overallAverage: number | null = null;
    let classAverage: number | null = null;
    let rank: number | null = null;
    let rankedCount = 0;
    if (isMyHomeroom) {
      const allClassSubjects = await prisma.classSubject.findMany({
        where: { classId: enrollment.classId },
        select: { id: true, coefficient: true },
      });
      const allEvaluations =
        allClassSubjects.length > 0
          ? await prisma.evaluation.findMany({
              where: {
                classSubjectId: { in: allClassSubjects.map((cs) => cs.id) },
                termId: term.id,
              },
              include: { grades: true },
            })
          : [];
      const evalsByClassSubject = new Map<string, typeof allEvaluations>();
      for (const ev of allEvaluations) {
        const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
        list.push(ev);
        evalsByClassSubject.set(ev.classSubjectId, list);
      }
      const generalAverageFor = (sid: string): number | null => {
        const rows = allClassSubjects
          .map((cs) => {
            const avg = subjectAverageFor(evalsByClassSubject.get(cs.id) ?? [], sid);
            return avg != null ? { value: avg, weight: cs.coefficient } : null;
          })
          .filter((r): r is { value: number; weight: number | null } => r != null);
        return weightedAverage(rows);
      };
      overallAverage = generalAverageFor(studentId);
      const averages = classmates
        .map((cm) => ({ studentId: cm.studentId, average: generalAverageFor(cm.studentId) }))
        .filter((r): r is { studentId: string; average: number } => r.average != null)
        .sort((a, b) => b.average - a.average);
      classAverage = averages.length
        ? Math.round((averages.reduce((acc, r) => acc + r.average, 0) / averages.length) * 10) / 10
        : null;
      const ranks = competitionRank(averages, (r) => r.average);
      const entry = averages.findIndex((r) => r.studentId === studentId);
      rank = entry >= 0 ? (ranks[entry] ?? null) : null;
      rankedCount = averages.length;
    }

    return NextResponse.json(
      {
        ...shell,
        classmates: classmates.map((cm) => ({
          studentId: cm.studentId,
          firstName: cm.student.firstName,
          lastName: cm.student.lastName,
          saisieStatus: saisieStatusFor(cm.studentId),
        })),
        overallAverage,
        classAverage,
        rank,
        rankedCount,
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
        subjects: inThisClass.map((cs) => {
          const appr = mineBySubject.get(cs.subjectId);
          const evals = myEvaluations.filter((e) => e.classSubjectId === cs.id);
          return {
            classSubjectId: cs.id,
            subjectId: cs.subjectId,
            subjectName: cs.subject.name,
            coefficient: cs.coefficient,
            average: subjectAverageFor(evals, studentId),
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

// One scoping rule for both mutations: a non-null subjectId must be one of
// MY subjects in the student's class; the general row (null) requires the
// homeroom. Returns false on any violation (caller answers 404).
function canTouchRow(
  scope: NonNullable<Awaited<ReturnType<typeof resolveScope>>>,
  subjectId: string | null,
): boolean {
  if (subjectId === null) return scope.isMyHomeroom;
  return scope.inThisClass.some((cs) => cs.subjectId === subjectId);
}

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

    const { id: studentId } = await params;
    const scope = await resolveScope(auth.user.sub, studentId);
    if (!scope) return notFound(ctx.requestId);

    const parsed = UpsertAppreciationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { termId, subjectId } = parsed.data;
    if (!canTouchRow(scope, subjectId)) return notFound(ctx.requestId);

    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term || term.academicYearId !== scope.enrollment.academicYearId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid termId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
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
      : await prisma.appreciation.create({ data: { studentId, termId, subjectId, ...cleanData } });

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

    const { id: studentId } = await params;
    const scope = await resolveScope(auth.user.sub, studentId);
    if (!scope) return notFound(ctx.requestId);

    const termId = req.nextUrl.searchParams.get('termId');
    if (!termId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'termId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const subjectId = req.nextUrl.searchParams.get('subjectId');
    if (!canTouchRow(scope, subjectId)) return notFound(ctx.requestId);

    const existing = await prisma.appreciation.findFirst({
      where: { studentId, termId, subjectId },
    });
    if (!existing) return notFound(ctx.requestId);

    await prisma.appreciation.delete({ where: { id: existing.id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
