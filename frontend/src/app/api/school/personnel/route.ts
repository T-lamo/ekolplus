// GET /api/school/personnel — merged list (Teacher + OrganizationMember,
// deduplicated by userId — see lib/server/personnel/view.ts). Filters
// `profile=all|teacher|staff`, `q` (name/email/username substring),
// paginated 20/page (mirrors the fees/overdue list route's shape:
// { items, total, page, pageSize }).
//
// POST /api/school/personnel — unified creation (spec
// 2026-09-04-personnel-module-design.md §6.4): one call creates a Teacher
// profile, a staff (OrganizationMember) profile, or both, plus a login of
// mode none/email/username. The email path reuses `createPortalInvite`
// exactly as the existing teacher/student/staff invite routes do — every
// email-mode account also gets the connective OrganizationMember row
// (role MEMBER, no StaffRole) that lets resolveMySchool() resolve an
// organizationId for it later, same as `teachers/[id]/invite`. The
// username path creates the User active immediately: no VerificationCode,
// no outbox row, password hashed right away and returned once as
// `temporaryPassword`.
//
// Deliberate scope note: `teacherProfile.matiereIds`/`classIds` are
// accepted and validated as cuids per the plan's schema, but this route
// does not create ClassSubject rows from them — a class+subject pair is
// unique (`@@unique([classId, subjectId])`), so a naive cross-product
// would either silently overwrite an existing assignment or require data
// this endpoint doesn't have (weeklyHours/coefficient per pair). Real
// matière/classe assignment continues through the existing, unchanged
// `/api/school/class-subjects` route (Configuration module) and the
// Enseignement tab. Flagged in the Task 3 report as an open question.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { generateInitialPassword } from '@/lib/server/initial-password';
import { zEmail, zPhone, zCuid } from '@/lib/server/zod-helpers';
import { zUsername } from '@/lib/username';
import { getPersonnelList } from '@/lib/server/personnel/view';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PAGE_SIZE = 20;

function jsonError(requestId: string, status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: { 'x-request-id': requestId } });
}
function notFound(requestId: string) {
  return jsonError(requestId, 404, 'NOT_FOUND', 'Not found');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'enseignants', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const profileParam = req.nextUrl.searchParams.get('profile');
    const profile = profileParam === 'teacher' || profileParam === 'staff' ? profileParam : 'all';
    const q = req.nextUrl.searchParams.get('q')?.trim() || undefined;
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1') || 1);

    const all = await getPersonnelList(mySchool.schoolId, mySchool.organizationId, {
      profile,
      ...(q ? { q } : {}),
    });
    const total = all.length;
    const items = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return NextResponse.json(
      { items, total, page, pageSize: PAGE_SIZE },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const bodySchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: zPhone.optional(),
  teacherProfile: z.object({ matiereIds: z.array(zCuid), classIds: z.array(zCuid) }).optional(),
  staffProfile: z
    .object({
      role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
      staffRoleIds: z.array(zCuid).max(50).default([]),
    })
    .optional(),
  login: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }),
    z.object({ mode: z.literal('email'), email: zEmail }),
    z.object({ mode: z.literal('username'), username: zUsername }),
  ]),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = verifyCsrf(req);
    if (csrf) return csrf;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'enseignants',
      'create',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(ctx.requestId, 400, 'VALIDATION_FAILED', 'Invalid request body');
    }
    const { firstName, lastName, phone, teacherProfile, staffProfile, login } = parsed.data;

    if (!teacherProfile && !staffProfile) {
      return jsonError(
        ctx.requestId,
        400,
        'VALIDATION_FAILED',
        'Choose at least one profile (teacher or staff).',
      );
    }
    if (login.mode === 'none' && (staffProfile || !teacherProfile)) {
      return jsonError(
        ctx.requestId,
        400,
        'VALIDATION_FAILED',
        '"No account yet" is only available for a teacher-only profile.',
      );
    }
    if (staffProfile) {
      if (!hasMinRole(mySchool.role, 'ADMIN')) {
        return jsonError(
          ctx.requestId,
          403,
          'PERMISSION_DENIED',
          'Only an administrator can grant management access.',
        );
      }
      if (staffProfile.role === 'ADMIN' && mySchool.role !== 'OWNER') {
        return jsonError(
          ctx.requestId,
          403,
          'PERMISSION_DENIED',
          'Only the owner can grant an administrator profile.',
        );
      }
    }
    const staffRoleIds =
      staffProfile && staffProfile.role === 'MEMBER'
        ? Array.from(new Set(staffProfile.staffRoleIds))
        : [];
    if (staffRoleIds.length > 0) {
      // 404 anti-fuite : un id inconnu ou d'une autre école est indistinguable
      const count = await prisma.staffRole.count({
        where: { id: { in: staffRoleIds }, schoolId: mySchool.schoolId },
      });
      if (count !== staffRoleIds.length) return notFound(ctx.requestId);
    }

    const name = `${firstName} ${lastName}`.trim();

    if (login.mode === 'none') {
      const teacher = await prisma.teacher.create({
        data: { schoolId: mySchool.schoolId, name, phone: phone ?? null },
      });
      return NextResponse.json(
        { ok: true, id: teacher.id, userId: null },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (login.mode === 'email') {
      const result = await createPortalInvite({
        schoolId: mySchool.schoolId,
        organizationId: mySchool.organizationId,
        email: login.email,
        inviteType: 'STAFF_INVITE',
        portalLabel: 'espace de gestion',
        acceptPath: '/definir-mot-de-passe?portal=staff',
        expiresInMs: 7 * 24 * 60 * 60 * 1000,
        // Every email-mode account gets the connective membership row, same
        // as teachers/[id]/invite — it's how resolveMySchool() finds an
        // organizationId for a teacher-only account later.
        createOrgMembership: true,
        linkExisting: async (tx, userId) => {
          if (teacherProfile) {
            await tx.teacher.create({
              data: {
                schoolId: mySchool.schoolId,
                name,
                phone: phone ?? null,
                email: login.email,
                userId,
              },
            });
          }
          if (staffProfile) {
            await tx.organizationMember.update({
              where: {
                organizationId_userId: { organizationId: mySchool.organizationId, userId },
              },
              data: {
                role: staffProfile.role,
                staffRoles: { set: staffRoleIds.map((id) => ({ id })) },
              },
            });
          }
        },
      });
      if (!result.ok) {
        return jsonError(
          ctx.requestId,
          409,
          result.error,
          'This email is already in use by another account.',
        );
      }
      const teacher = teacherProfile
        ? await prisma.teacher.findFirst({
            where: { userId: result.userId, schoolId: mySchool.schoolId },
            select: { id: true },
          })
        : null;
      return NextResponse.json(
        { ok: true, id: teacher?.id ?? result.userId, userId: result.userId },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // login.mode === 'username'
    const existingUsername = await prisma.user.findUnique({ where: { username: login.username } });
    if (existingUsername) {
      return jsonError(ctx.requestId, 409, 'USERNAME_TAKEN', 'This username is already taken.');
    }
    const temporaryPassword = generateInitialPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    try {
      const { id, userId } = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { username: login.username, name, phone: phone ?? null, passwordHash },
        });
        await tx.organizationMember.create({
          data: { organizationId: mySchool.organizationId, userId: user.id, role: 'MEMBER' },
        });
        if (staffProfile) {
          await tx.organizationMember.update({
            where: {
              organizationId_userId: { organizationId: mySchool.organizationId, userId: user.id },
            },
            data: {
              role: staffProfile.role,
              staffRoles: { set: staffRoleIds.map((rid) => ({ id: rid })) },
            },
          });
        }
        if (teacherProfile) {
          const teacher = await tx.teacher.create({
            data: { schoolId: mySchool.schoolId, name, phone: phone ?? null, userId: user.id },
          });
          return { id: teacher.id, userId: user.id };
        }
        return { id: user.id, userId: user.id };
      });
      return NextResponse.json(
        { ok: true, id, userId, temporaryPassword },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return jsonError(ctx.requestId, 409, 'USERNAME_TAKEN', 'This username is already taken.');
      }
      throw err;
    }
  });
}
