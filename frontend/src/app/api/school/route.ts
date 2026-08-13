// GET /api/school — the caller's own school profile, active academic year
// (with terms), and member list. One call hydrates all of the /settings
// page's tabs. See .planning/banani/school-settings.md.
//
// PUT /api/school — update the Établissement tab's fields. Requires ADMIN+
// within the school (OWNER or ADMIN org role).
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

type TermStatus = 'DONE' | 'CURRENT' | 'UPCOMING';

function termStatus(startDate: Date, endDate: Date): TermStatus {
  const now = new Date();
  if (now > endDate) return 'DONE';
  if (now < startDate) return 'UPCOMING';
  return 'CURRENT';
}

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

    const school = await prisma.school.findUniqueOrThrow({
      where: { id: mySchool.schoolId },
    });

    const activeYear = await prisma.academicYear.findFirst({
      where: { schoolId: mySchool.schoolId, isActive: true },
      orderBy: { startDate: 'desc' },
      include: { terms: { orderBy: { order: 'asc' } } },
    });

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: mySchool.organizationId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return NextResponse.json(
      {
        school,
        academicYear: activeYear
          ? {
              id: activeYear.id,
              label: activeYear.label,
              startDate: activeYear.startDate,
              endDate: activeYear.endDate,
              gradingScale: activeYear.gradingScale,
              terms: activeYear.terms.map((t) => ({
                id: t.id,
                label: t.label,
                order: t.order,
                startDate: t.startDate,
                endDate: t.endDate,
                status: termStatus(t.startDate, t.endDate),
              })),
            }
          : null,
        members: members.map((m) => ({
          userId: m.user.id,
          email: m.user.email,
          name: m.user.name,
          role: m.role,
          joinedAt: m.createdAt,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const UpdateSchoolBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  shortName: z.string().trim().max(10).nullable().optional(),
  country: z.string().trim().min(1).max(80).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  schoolType: z.string().trim().min(1).max(80).optional(),
  primaryLanguage: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  phone: zPhone.nullable().optional(),
  estimatedStudents: z.number().int().positive().max(1_000_000).nullable().optional(),
  officialCode: z.string().trim().max(60).nullable().optional(),
  officialEmail: zEmail.nullable().optional(),
  website: z.string().trim().max(200).nullable().optional(),
  logoUrl: z.string().trim().url().max(500).nullable().optional(),
  directorSignatureUrl: z.string().trim().url().max(500).nullable().optional(),
});

export async function PUT(req: NextRequest): Promise<NextResponse> {
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

    const parsed = UpdateSchoolBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Strip undefined (vs. explicit null) keys — exactOptionalPropertyTypes
    // means Prisma's UpdateInput wants keys either absent or a concrete
    // value, never `undefined` as a present key.
    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));

    const school = await prisma.school.update({
      where: { id: mySchool.schoolId },
      data,
    });

    return NextResponse.json({ school }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
