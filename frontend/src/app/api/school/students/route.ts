// GET /api/school/students — list, with each student's current-year class
// (via Enrollment) and guardian count.
// POST /api/school/students — create a student + up to 2 guardians + the
// current-year Enrollment in one transaction. See .planning/banani/students-list.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveActiveAcademicYear, hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { checkStudentLimit } from '@/lib/server/billing/summary';

async function nextStudentNumber(schoolId: string, year: number): Promise<string> {
  const count = await prisma.student.count({ where: { schoolId } });
  return `EL-${year}-${String(count + 1).padStart(3, '0')}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'eleves', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const students = await prisma.student.findMany({
      where: { schoolId: mySchool.schoolId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        enrollments: {
          where: { academicYear: { isActive: true } },
          include: { class: { select: { id: true, name: true } } },
          take: 1,
        },
        _count: { select: { guardians: true } },
      },
    });

    return NextResponse.json(
      {
        students: students.map((s) => ({
          id: s.id,
          studentNumber: s.studentNumber,
          firstName: s.firstName,
          lastName: s.lastName,
          photoUrl: s.photoUrl,
          dateOfBirth: s.dateOfBirth,
          status: s.status,
          class: s.enrollments[0]?.class ?? null,
          guardianCount: s._count.guardians,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const GuardianInput = z.object({
  name: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(1).max(40),
  phone: zPhone.nullable().optional(),
  email: zEmail.nullable().optional(),
  profession: z.string().trim().max(80).nullable().optional(),
  isPrimary: z.boolean().optional(),
});

const CreateStudentBody = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  photoUrl: z.string().trim().url().max(500).nullable().optional(),
  dateOfBirth: z.coerce.date(),
  placeOfBirth: z.string().trim().max(120).nullable().optional(),
  gender: z.string().trim().max(30).nullable().optional(),
  nationality: z.string().trim().max(60).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  classId: z.string().min(1),
  guardians: z.array(GuardianInput).max(2).optional(),
  // Profile fields from the Banani Add Student form (add-student.md).
  motherTongue: z.string().trim().max(60).nullable().optional(),
  phone: zPhone.nullable().optional(),
  email: zEmail.nullable().optional(),
  enrollmentType: z.string().trim().max(40).nullable().optional(),
  enrolledAt: z.coerce.date().optional(),
  previousSchool: z.string().trim().max(120).nullable().optional(),
  transferNumber: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  scholarship: z.boolean().optional(),
  status: z.enum(['ENROLLED', 'REPEATED_ABSENCES', 'SUSPENDED']).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'eleves', 'create', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
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
          message: "Configure d'abord une année scolaire dans Paramètres avant d'ajouter un élève.",
        },
        { status: 424, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CreateStudentBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // SaaS plan cap — the free Starter tier stops at 50 students (landing
    // promise; the upgrade lever). Pro/Enterprise are never blocked here.
    const limit = await checkStudentLimit(prisma, mySchool.schoolId);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'PLAN_LIMIT_REACHED',
          message: `Le plan ${limit.plan === 'STARTER' ? 'Starter' : limit.plan} est limité à ${limit.limit} élèves. Passez au plan Établissement Pro pour en ajouter davantage.`,
          plan: limit.plan,
          limit: limit.limit,
          studentCount: limit.studentCount,
        },
        { status: 402, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const cls = await prisma.class.findUnique({ where: { id: parsed.data.classId } });
    if (!cls || cls.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid classId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const studentNumber = await nextStudentNumber(
      mySchool.schoolId,
      activeYear.startDate.getFullYear(),
    );

    const student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          schoolId: mySchool.schoolId,
          studentNumber,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          photoUrl: parsed.data.photoUrl ?? null,
          dateOfBirth: parsed.data.dateOfBirth,
          placeOfBirth: parsed.data.placeOfBirth ?? null,
          gender: parsed.data.gender ?? null,
          nationality: parsed.data.nationality ?? null,
          address: parsed.data.address ?? null,
          motherTongue: parsed.data.motherTongue ?? null,
          phone: parsed.data.phone ?? null,
          email: parsed.data.email ?? null,
          enrollmentType: parsed.data.enrollmentType ?? null,
          ...(parsed.data.enrolledAt ? { enrolledAt: parsed.data.enrolledAt } : {}),
          previousSchool: parsed.data.previousSchool ?? null,
          transferNumber: parsed.data.transferNumber ?? null,
          notes: parsed.data.notes ?? null,
          scholarship: parsed.data.scholarship ?? false,
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
        },
      });
      await tx.enrollment.create({
        data: {
          studentId: created.id,
          classId: parsed.data.classId,
          academicYearId: activeYear.id,
        },
      });
      if (parsed.data.guardians && parsed.data.guardians.length > 0) {
        await tx.guardian.createMany({
          data: parsed.data.guardians.map((g) => ({
            studentId: created.id,
            name: g.name,
            relationship: g.relationship,
            phone: g.phone ?? null,
            email: g.email ?? null,
            profession: g.profession ?? null,
            isPrimary: g.isPrimary ?? false,
          })),
        });
      }
      return created;
    });

    return NextResponse.json(
      { student: { ...student, class: cls } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
