// GET /api/school/teachers — teacher list. Defaults to `isActive: true`
// only (the shape Epic 4's TeacherPicker dropdown wants); `?scope=all`
// returns every teacher regardless of isActive, with Matière(s)/Classes/
// Heures-per-week aggregates derived from ClassSubject for the Teachers
// List screen. See .planning/banani/teachers-list.md.
// POST /api/school/teachers — minimal inline create (name + optional
// email/phone). Full profile/CRUD is Epic 5's teachers-list screen — see
// .planning/banani/epic-4-data-model.md.
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

    const scopeAll = req.nextUrl.searchParams.get('scope') === 'all';

    if (!scopeAll) {
      const teachers = await prisma.teacher.findMany({
        where: { schoolId: mySchool.schoolId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, phone: true },
      });
      return NextResponse.json({ teachers }, { headers: { 'x-request-id': ctx.requestId } });
    }

    const teachers = await prisma.teacher.findMany({
      where: { schoolId: mySchool.schoolId },
      orderBy: { name: 'asc' },
      include: {
        classSubjects: {
          include: {
            subject: { select: { id: true, name: true } },
            class: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json(
      {
        teachers: teachers.map((t) => ({
          id: t.id,
          name: t.name,
          email: t.email,
          phone: t.phone,
          status: t.status,
          isActive: t.isActive,
          subjects: [...new Map(t.classSubjects.map((cs) => [cs.subject.id, cs.subject])).values()],
          classes: [...new Map(t.classSubjects.map((cs) => [cs.class.id, cs.class])).values()],
          weeklyHours: t.classSubjects.reduce((sum, cs) => sum + (cs.weeklyHours ?? 0), 0),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const CreateTeacherBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: zEmail.nullable().optional(),
  phone: zPhone.nullable().optional(),
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

    const parsed = CreateTeacherBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const teacher = await prisma.teacher.create({
      data: {
        schoolId: mySchool.schoolId,
        name: parsed.data.name,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
      },
    });

    return NextResponse.json(
      { teacher },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
