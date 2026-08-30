// GET /api/school/teachers/[id] — full profile for the Add/Edit Teacher
// page (add-teacher.md), incl. real subjects/classes/hours aggregates
// derived from ClassSubject assignments.
// PATCH /api/school/teachers/[id] — update profile/status/isActive.
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
  photoUrl: z.string().trim().url().max(500).nullable().optional(),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'INACTIVE']).optional(),
  isActive: z.boolean().optional(),
  // Profile fields from the Banani Add Teacher form (add-teacher.md).
  civility: z.string().trim().max(10).nullable().optional(),
  firstName: z.string().trim().max(60).nullable().optional(),
  lastName: z.string().trim().max(60).nullable().optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  gender: z.string().trim().max(30).nullable().optional(),
  nationality: z.string().trim().max(60).nullable().optional(),
  idNumber: z.string().trim().max(60).nullable().optional(),
  secondaryPhone: zPhone.nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  contractType: z.string().trim().max(40).nullable().optional(),
  hiredAt: z.coerce.date().nullable().optional(),
  weeklyHoursTarget: z.number().int().min(0).max(80).nullable().optional(),
});

async function assertOwnedTeacher(id: string, schoolId: string) {
  const teacher = await prisma.teacher.findUnique({ where: { id } });
  if (!teacher || teacher.schoolId !== schoolId) return null;
  return teacher;
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

    const { id } = await params;
    const teacher = await prisma.teacher.findUnique({
      where: { id },
      include: {
        classSubjects: {
          include: {
            subject: { select: { id: true, name: true } },
            class: { select: { id: true, name: true } },
          },
        },
        // Linked portal account (Espace Enseignant invite) — `userId` is
        // already a scalar Teacher column and flows through via `...fields`
        // below; `emailVerifiedAt` lives on User so it needs this include.
        // The teacher fiche's invite/resend/active UI branches on both.
        user: { select: { emailVerifiedAt: true } },
      },
    });
    if (!teacher || teacher.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { classSubjects, user, ...fields } = teacher;
    return NextResponse.json(
      {
        teacher: {
          ...fields,
          emailVerifiedAt: user?.emailVerifiedAt ?? null,
          subjects: [...new Map(classSubjects.map((cs) => [cs.subject.id, cs.subject])).values()],
          classes: [...new Map(classSubjects.map((cs) => [cs.class.id, cs.class])).values()],
          weeklyHours: classSubjects.reduce((sum, cs) => sum + (cs.weeklyHours ?? 0), 0),
          // Row-level assignments for the teacher profile's Matières & Classes tab.
          assignments: classSubjects.map((cs) => ({
            id: cs.id,
            subject: cs.subject,
            class: cs.class,
            weeklyHours: cs.weeklyHours,
            coefficient: cs.coefficient,
          })),
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
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
