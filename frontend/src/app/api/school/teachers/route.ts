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
        select: { id: true, name: true, email: true, phone: true, photoUrl: true },
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
          photoUrl: t.photoUrl,
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

// Profile fields from the Banani Add Teacher form (add-teacher.md) —
// mirrored in the [id] PATCH schema.
const CreateTeacherBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: zEmail.nullable().optional(),
  phone: zPhone.nullable().optional(),
  photoUrl: z.string().trim().url().max(500).nullable().optional(),
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
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'INACTIVE']).optional(),
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

    const { name, status, ...profile } = parsed.data;
    const teacher = await prisma.teacher.create({
      data: {
        schoolId: mySchool.schoolId,
        name,
        ...(status ? { status } : {}),
        // Optional profile columns — absent keys stay at their defaults.
        ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)),
      },
    });

    return NextResponse.json(
      { teacher },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
