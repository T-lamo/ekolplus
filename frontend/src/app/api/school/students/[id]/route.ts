// GET /api/school/students/[id] — full profile: identity, guardians,
// current-year enrollment (class + homeroom teacher).
// PATCH — update identity fields, replace guardians, and/or move class
// (updates or creates the current-year Enrollment).
// DELETE — cascades guardians + enrollments.
// See .planning/banani/student-profile.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, resolveActiveAcademicYear, hasMinRole } from '@/lib/server/school';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
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

    const { id } = await params;
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        guardians: { orderBy: { isPrimary: 'desc' } },
        enrollments: {
          where: { academicYear: { isActive: true } },
          include: {
            class: { include: { homeroomTeacher: { select: { id: true, name: true } } } },
            academicYear: { select: { label: true } },
          },
          take: 1,
        },
      },
    });
    if (!student || student.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const enrollment = student.enrollments[0] ?? null;
    return NextResponse.json(
      {
        student: {
          id: student.id,
          studentNumber: student.studentNumber,
          firstName: student.firstName,
          lastName: student.lastName,
          dateOfBirth: student.dateOfBirth,
          placeOfBirth: student.placeOfBirth,
          gender: student.gender,
          nationality: student.nationality,
          address: student.address,
          enrolledAt: student.enrolledAt,
          status: student.status,
          guardians: student.guardians,
          class: enrollment ? { id: enrollment.class.id, name: enrollment.class.name } : null,
          homeroomTeacher: enrollment?.class.homeroomTeacher ?? null,
        },
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

const UpdateStudentBody = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  dateOfBirth: z.coerce.date().optional(),
  placeOfBirth: z.string().trim().max(120).nullable().optional(),
  gender: z.string().trim().max(30).nullable().optional(),
  nationality: z.string().trim().max(60).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  status: z.enum(['ENROLLED', 'REPEATED_ABSENCES', 'SUSPENDED']).optional(),
  classId: z.string().min(1).optional(),
  guardians: z.array(GuardianInput).max(2).optional(),
});

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
    const existing = await assertOwnedStudent(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = UpdateStudentBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { classId, guardians, ...rest } = parsed.data;
    const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));

    if (classId) {
      const cls = await prisma.class.findUnique({ where: { id: classId } });
      if (!cls || cls.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid classId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.student.update({ where: { id }, data });
      }
      if (classId) {
        const activeYear = await resolveActiveAcademicYear(mySchool.schoolId);
        if (activeYear) {
          await tx.enrollment.upsert({
            where: { studentId_academicYearId: { studentId: id, academicYearId: activeYear.id } },
            create: { studentId: id, classId, academicYearId: activeYear.id },
            update: { classId },
          });
        }
      }
      if (guardians) {
        await tx.guardian.deleteMany({ where: { studentId: id } });
        if (guardians.length > 0) {
          await tx.guardian.createMany({
            data: guardians.map((g) => ({
              studentId: id,
              name: g.name,
              relationship: g.relationship,
              phone: g.phone ?? null,
              email: g.email ?? null,
              profession: g.profession ?? null,
              isPrimary: g.isPrimary ?? false,
            })),
          });
        }
      }
    });

    const updated = await prisma.student.findUnique({
      where: { id },
      include: { guardians: { orderBy: { isPrimary: 'desc' } } },
    });
    return NextResponse.json({ student: updated }, { headers: { 'x-request-id': ctx.requestId } });
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
    const existing = await assertOwnedStudent(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.student.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
