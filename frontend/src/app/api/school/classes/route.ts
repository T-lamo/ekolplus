// GET /api/school/classes — classes in the school's active academic year,
// with subject-count aggregate. POST — create a class (requires an active
// AcademicYear — 424 if none configured yet, points admin to Settings).
// See .planning/banani/classes-config.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, resolveActiveAcademicYear, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
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

    const [classes, activeYear] = await Promise.all([
      prisma.class.findMany({
        where: { schoolId: mySchool.schoolId },
        orderBy: { name: 'asc' },
        include: {
          homeroomTeacher: { select: { id: true, name: true } },
          _count: { select: { classSubjects: true, enrollments: true } },
        },
      }),
      prisma.academicYear.findFirst({
        where: { schoolId: mySchool.schoolId, isActive: true },
        select: { label: true },
      }),
    ]);

    return NextResponse.json(
      {
        activeYearLabel: activeYear?.label ?? null,
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name,
          level: c.level,
          room: c.room,
          capacity: c.capacity,
          homeroomTeacher: c.homeroomTeacher,
          subjectCount: c._count.classSubjects,
          studentCount: c._count.enrollments,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const CreateClassBody = z.object({
  name: z.string().trim().min(1).max(40),
  level: z.string().trim().min(1).max(40),
  room: z.string().trim().max(40).nullable().optional(),
  capacity: z.number().int().positive().max(500).nullable().optional(),
  homeroomTeacherId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const activeYear = await resolveActiveAcademicYear(mySchool.schoolId);
    if (!activeYear) {
      return NextResponse.json(
        {
          error: 'NO_ACADEMIC_YEAR',
          message:
            "Configure d'abord une année scolaire dans Paramètres avant de créer une classe.",
        },
        { status: 424, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CreateClassBody.safeParse(await req.json().catch(() => null));
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

    const created = await prisma.class.create({
      data: {
        schoolId: mySchool.schoolId,
        academicYearId: activeYear.id,
        name: parsed.data.name,
        level: parsed.data.level,
        room: parsed.data.room ?? null,
        capacity: parsed.data.capacity ?? null,
        homeroomTeacherId: parsed.data.homeroomTeacherId ?? null,
      },
      include: { homeroomTeacher: { select: { id: true, name: true } } },
    });

    return NextResponse.json(
      { class: created },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
