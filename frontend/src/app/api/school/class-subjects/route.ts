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
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
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

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

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

    const rows = await prisma.classSubject.findMany({
      where: classId ? { classId } : { class: { schoolId: mySchool.schoolId } },
      orderBy: [{ class: { name: 'asc' } }, { subject: { name: 'asc' } }],
      include: INCLUDE,
    });

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
