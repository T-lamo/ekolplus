// PATCH /api/school/teachers/[id] — update name/email/phone/status/isActive.
// DELETE /api/school/teachers/[id] — blocked (409) if still referenced by a
// ClassSubject row or as a Class homeroom teacher. See .planning/banani/teachers-list.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const UpdateTeacherBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: zEmail.nullable().optional(),
  phone: zPhone.nullable().optional(),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'INACTIVE']).optional(),
  isActive: z.boolean().optional(),
});

async function assertOwnedTeacher(id: string, schoolId: string) {
  const teacher = await prisma.teacher.findUnique({ where: { id } });
  if (!teacher || teacher.schoolId !== schoolId) return null;
  return teacher;
}

export async function PATCH(
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

    const { id } = await params;
    const existing = await assertOwnedTeacher(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = UpdateTeacherBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));

    const teacher = await prisma.teacher.update({ where: { id }, data });
    return NextResponse.json({ teacher }, { headers: { 'x-request-id': ctx.requestId } });
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

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const existing = await assertOwnedTeacher(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [assignments, homerooms] = await Promise.all([
      prisma.classSubject.count({ where: { teacherId: id } }),
      prisma.class.count({ where: { homeroomTeacherId: id } }),
    ]);
    if (assignments > 0 || homerooms > 0) {
      return NextResponse.json(
        {
          error: 'TEACHER_IN_USE',
          message:
            'Cet enseignant est encore affecté à des matières ou classes — retire les affectations avant de le supprimer.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.teacher.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
