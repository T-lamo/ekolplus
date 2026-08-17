// GET /api/school/classes/[id] — class detail for the fiche classe
// (add-class.md): profile + subjectIds + lockedSubjectIds (pivots that already
// carry evaluations) + classSubjects detail (teacher / coefficient / weekly
// hours) + studentCount. Any school member can read.
// PATCH /api/school/classes/[id] — update a class (ADMIN).
// DELETE /api/school/classes/[id] — delete, blocked (409) if it still has
// ClassSubject rows. See .planning/banani/classes-config.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const UpdateClassBody = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  level: z.string().trim().min(1).max(40).optional(),
  room: z.string().trim().max(40).nullable().optional(),
  capacity: z.number().int().positive().max(500).nullable().optional(),
  homeroomTeacherId: z.string().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  track: z.string().trim().max(60).nullable().optional(),
});

async function assertOwnedClass(id: string, schoolId: string) {
  const cls = await prisma.class.findUnique({ where: { id } });
  if (!cls || cls.schoolId !== schoolId) return null;
  return cls;
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
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        homeroomTeacher: { select: { id: true, name: true, photoUrl: true } },
        academicYear: { select: { id: true, label: true } },
        classSubjects: {
          select: {
            id: true,
            subjectId: true,
            teacherId: true,
            coefficient: true,
            weeklyHours: true,
            _count: { select: { evaluations: true } },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!cls || cls.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Class not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        class: {
          id: cls.id,
          name: cls.name,
          level: cls.level,
          room: cls.room,
          capacity: cls.capacity,
          color: cls.color,
          track: cls.track,
          homeroomTeacher: cls.homeroomTeacher,
          academicYear: cls.academicYear,
          subjectCount: cls.classSubjects.length,
          studentCount: cls._count.enrollments,
          subjectIds: cls.classSubjects.map((cs) => cs.subjectId),
          // Pivots that already carry grades — deleting them cascades on the
          // evaluations, so the UI locks the checkbox and the DELETE refuses.
          lockedSubjectIds: cls.classSubjects
            .filter((cs) => cs._count.evaluations > 0)
            .map((cs) => cs.subjectId),
          classSubjectIdBySubject: Object.fromEntries(
            cls.classSubjects.map((cs) => [cs.subjectId, cs.id]),
          ),
          // Per-pivot detail for the fiche classe's « Détail des matières »
          // table (enseignant / coefficient / h·sem, édités en ligne).
          classSubjects: cls.classSubjects.map((cs) => ({
            id: cs.id,
            subjectId: cs.subjectId,
            teacherId: cs.teacherId,
            coefficient: cs.coefficient,
            weeklyHours: cs.weeklyHours,
            locked: cs._count.evaluations > 0,
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
    const existing = await assertOwnedClass(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Class not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = UpdateClassBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (parsed.data.homeroomTeacherId) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: parsed.data.homeroomTeacherId },
      });
      if (!teacher || teacher.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid homeroomTeacherId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    const updated = await prisma.class.update({
      where: { id },
      data,
      include: { homeroomTeacher: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ class: updated }, { headers: { 'x-request-id': ctx.requestId } });
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
    const existing = await assertOwnedClass(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Class not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const inUse = await prisma.classSubject.count({ where: { classId: id } });
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: 'CLASS_IN_USE',
          message:
            'Cette classe a encore des matières affectées — retire les affectations avant de la supprimer.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.class.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
