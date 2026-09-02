// GET /api/school — the caller's own school profile, active academic year
// (with terms), and member list. One call hydrates all of the /settings
// page's tabs. See .planning/banani/school-settings.md.
//
// PUT /api/school — update the Établissement tab's fields. Requires ADMIN+
// within the school (OWNER or ADMIN org role).
//
// DELETE /api/school — Zone dangereuse: permanently deletes the
// Organization (cascades School → every school-scoped model, per
// schema.prisma's onDelete: Cascade chain — the exact mechanism used to
// clean up test accounts during this session's own security audit).
// Organization.ownerId is onDelete: Restrict, so this deletes the org, NOT
// the owner's User row — the caller keeps their account, just loses school
// access. OWNER-only, type-to-confirm (server re-checked), rate-limited,
// audited, clears the caller's session cookies since there's nothing left
// to manage. See .planning/banani/school-settings-v2.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf, clearAuthCookies, clearCsrfCookie } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { confirmNameMatches, enforceDangerZoneRateLimit } from '@/lib/server/school-danger-zone';
import { logAdminAction } from '@/lib/server/admin/audit';
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
        staffRoles: { select: { id: true } },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            // Badge « Enseignant » de l'onglet Administrateurs : signale à
            // l'admin qu'assigner un rôle ici crée un double profil.
            teacherProfile: { select: { schoolId: true } },
          },
        },
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
                type: t.type,
                gradeEntryEnabled: t.gradeEntryEnabled,
              })),
            }
          : null,
        members: members.map((m) => ({
          userId: m.user.id,
          email: m.user.email,
          name: m.user.name,
          role: m.role,
          staffRoleIds: m.staffRoles.map((r) => r.id),
          isTeacher: m.user.teacherProfile?.schoolId === mySchool.schoolId,
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
  statute: z.string().trim().max(80).nullable().optional(),
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

    const perm = await requireSchoolPermission(auth.user.sub, 'parametres', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

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

const DeleteSchoolBody = z.object({ confirmName: z.string().trim().min(1) });

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceDangerZoneRateLimit(auth.user.sub, 'delete-school');
    if (limited) return limited;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'OWNER')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = DeleteSchoolBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const school = await prisma.school.findUniqueOrThrow({ where: { id: mySchool.schoolId } });
    if (!confirmNameMatches(school.name, parsed.data.confirmName)) {
      return NextResponse.json(
        { error: 'CONFIRM_NAME_MISMATCH', message: "Le nom saisi ne correspond pas à l'école." },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(async (tx) => {
      // Log BEFORE deleting — nothing left to reference targetId against
      // afterward, and AdminAction.actorId is unaffected (we delete the
      // Organization, never the User).
      await logAdminAction(tx, {
        actorId: auth.user.sub,
        action: 'school.delete',
        targetType: 'Organization',
        targetId: mySchool.organizationId,
        metadata: { schoolId: mySchool.schoolId, schoolName: school.name },
      });
      await tx.organization.delete({ where: { id: mySchool.organizationId } });
    });

    await clearAuthCookies();
    await clearCsrfCookie();

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
