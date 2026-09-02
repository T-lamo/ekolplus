// GET /api/school/class-subjects — the ClassSubject pivot. `?classId=`
// scopes to one class (Coefficients screen); omitted returns every row for
// the school (Affectations screen).
//
// POST /api/school/class-subjects — upsert on (classId, subjectId). Coefficients
// sends a coefficient-only body; Affectations sends the full shape
// (teacherId/weeklyHours/coefficient). See .planning/banani/epic-4-data-model.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveActiveAcademicYear } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const INCLUDE = {
  subject: { select: { id: true, name: true, code: true, domain: true } },
  teacher: { select: { id: true, name: true } },
  class: { select: { id: true, name: true, level: true } },
} as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'view',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const classId = req.nextUrl.searchParams.get('classId');
    if (classId) {
      const cls = await prisma.class.findUnique({ where: { id: classId } });
      if (!cls || cls.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'NOT_FOUND', message: 'Class not found' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // The school-wide list feeds the class/subject pickers of carnet de
    // notes, appréciations, bulletins, affectations, coefficients — scope it
    // to the ACTIVE year, or the archived year's pivots resurface old
    // classes (same names) after a rollover. An explicit `?classId=` keeps
    // working for any class of the school (the id is already specific).
    let where: Prisma.ClassSubjectWhereInput | null = null;
    if (classId) {
      where = { classId };
    } else {
      const activeYear = await resolveActiveAcademicYear(mySchool.schoolId);
      if (activeYear) {
        where = { class: { schoolId: mySchool.schoolId, academicYearId: activeYear.id } };
      }
    }
    const rows = where
      ? await prisma.classSubject.findMany({
          where,
          orderBy: [{ class: { name: 'asc' } }, { subject: { name: 'asc' } }],
          include: INCLUDE,
        })
      : [];

    return NextResponse.json(
      { classSubjects: rows },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const UpsertBody = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().nullable().optional(),
  coefficient: z.number().int().min(1).max(10).nullable().optional(),
  weeklyHours: z.number().positive().max(60).nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'create',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const parsed = UpsertBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { classId, subjectId, ...rest } = parsed.data;

    const [cls, subject] = await Promise.all([
      prisma.class.findUnique({ where: { id: classId } }),
      prisma.subject.findUnique({ where: { id: subjectId } }),
    ]);
    if (
      !cls ||
      cls.schoolId !== mySchool.schoolId ||
      !subject ||
      subject.schoolId !== mySchool.schoolId
    ) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Class or subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (rest.teacherId) {
      const teacher = await prisma.teacher.findUnique({ where: { id: rest.teacherId } });
      if (!teacher || teacher.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid teacherId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    const row = await prisma.classSubject.upsert({
      where: { classId_subjectId: { classId, subjectId } },
      create: { classId, subjectId, ...data },
      update: data,
      include: INCLUDE,
    });

    return NextResponse.json({ classSubject: row }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
