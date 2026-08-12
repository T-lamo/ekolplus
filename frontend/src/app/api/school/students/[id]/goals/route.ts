// GET /api/school/students/[id]/goals?termId= — list a student's goals for
// one term (subject-specific + the overall one, subjectId null).
// PUT — upsert one goal. `subjectId: null` targets "Moyenne générale".
// subjectId is nullable, so uniqueness for the overall goal is enforced
// here (find-then-update-or-create) rather than relying purely on the DB
// constraint — see .planning/banani/epic-6-data-model.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
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

    const termId = req.nextUrl.searchParams.get('termId');
    if (!termId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'termId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const goals = await prisma.goal.findMany({
      where: { studentId, termId },
      include: { subject: { select: { name: true } } },
    });

    return NextResponse.json({ goals }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

const UpsertGoalBody = z.object({
  termId: z.string().min(1),
  subjectId: z.string().min(1).nullable(),
  targetScore: z.number().min(0).max(20),
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

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) {
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

    const parsed = UpsertGoalBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { termId, subjectId, targetScore } = parsed.data;

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

    const existing = await prisma.goal.findFirst({ where: { studentId, termId, subjectId } });
    const goal = existing
      ? await prisma.goal.update({ where: { id: existing.id }, data: { targetScore } })
      : await prisma.goal.create({ data: { studentId, termId, subjectId, targetScore } });

    return NextResponse.json({ goal }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
