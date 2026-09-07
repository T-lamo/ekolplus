// GET /api/school/students/[id]/appreciations?termId= — one student's full
// appreciation picture: the "générale" row (subjectId: null) if any, one
// row per subject the student is graded in (existing or not-yet-created),
// per-subject averages (for the "Moy." column and mention suggestions),
// overall average + rank, and prev/next studentId within the same class
// (ordered like every other list — lastName/firstName) for the Saisir
// wizard's navigation. The query lives in
// lib/server/student-views/appreciations.ts (getStudentAppreciations),
// shared with the Espace Élève's GET /api/student/appreciations; the GET
// here is the staff authorization layer around it (`staff` audience keeps
// drafts and the roster navigation).
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
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { getStudentAppreciations } from '@/lib/server/student-views/appreciations';
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

    const view = await getStudentAppreciations({
      studentId,
      termId: req.nextUrl.searchParams.get('termId'),
      audience: 'staff',
    });
    if (!view) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student has no active enrollment' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
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
