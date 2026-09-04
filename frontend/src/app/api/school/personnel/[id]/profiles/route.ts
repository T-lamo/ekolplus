// POST /api/school/personnel/[id]/profiles — adds the missing Teacher or
// staff (OrganizationMember) profile to an existing person's account (spec
// 2026-09-04-personnel-module-design.md §6.3's "Donner un accès
// enseignement" / "Donner un accès de gestion" header buttons). `id`
// resolves the same way as GET personnel/[id]: Teacher.id if a teaching
// profile already exists, else User.id.
//
// A teacher invited by email (or given username access via
// teachers/[id]/access) already carries a connective OrganizationMember
// row (role MEMBER, no StaffRole — see personnel/view.ts's header
// comment). Adding a staff profile here upgrades that row in place
// (upsert) rather than creating a second membership, which the
// @@unique([organizationId, userId]) constraint would reject anyway.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { zEmail, zPhone, zCuid } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function jsonError(requestId: string, status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: { 'x-request-id': requestId } });
}
function notFound(requestId: string) {
  return jsonError(requestId, 404, 'NOT_FOUND', 'Not found');
}

const bodySchema = z.discriminatedUnion('profile', [
  z.object({
    profile: z.literal('teacher'),
    name: z.string().trim().min(1).max(120).optional(),
    phone: zPhone.nullable().optional(),
    email: zEmail.nullable().optional(),
  }),
  z.object({
    profile: z.literal('staff'),
    role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
    staffRoleIds: z.array(zCuid).max(50).default([]),
  }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

    const { id } = await params;

    // Resolve the target userId the same way GET personnel/[id] does.
    const teacherRow = await prisma.teacher.findUnique({ where: { id } });
    let userId: string | null = null;
    if (teacherRow) {
      if (teacherRow.schoolId !== mySchool.schoolId || !teacherRow.userId)
        return notFound(ctx.requestId);
      userId = teacherRow.userId;
    } else {
      const member = await prisma.organizationMember.findFirst({
        where: { userId: id, organizationId: mySchool.organizationId },
        select: { userId: true },
      });
      if (!member) return notFound(ctx.requestId);
      userId = member.userId;
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(ctx.requestId, 400, 'VALIDATION_FAILED', 'Invalid request body');
    }

    if (parsed.data.profile === 'teacher') {
      const existingTeacher = await prisma.teacher.findFirst({ where: { userId } });
      if (existingTeacher) {
        return jsonError(
          ctx.requestId,
          409,
          'ALREADY_HAS_PROFILE',
          'This person already has a teaching profile.',
        );
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, username: true },
      });
      const name = parsed.data.name ?? user?.name ?? user?.email ?? user?.username ?? 'Personnel';
      const teacher = await prisma.teacher.create({
        data: {
          schoolId: mySchool.schoolId,
          name,
          phone: parsed.data.phone ?? null,
          email: parsed.data.email ?? null,
          userId,
        },
      });
      return NextResponse.json(
        { ok: true, id: teacher.id },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // profile === 'staff'
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return jsonError(
        ctx.requestId,
        403,
        'PERMISSION_DENIED',
        'Only an administrator can grant management access.',
      );
    }
    if (parsed.data.role === 'ADMIN' && mySchool.role !== 'OWNER') {
      return jsonError(
        ctx.requestId,
        403,
        'PERMISSION_DENIED',
        'Only the owner can grant an administrator profile.',
      );
    }

    const existingMember = await prisma.organizationMember.findFirst({
      where: { userId, organizationId: mySchool.organizationId },
      select: { role: true, staffRoles: { select: { id: true } } },
    });
    const alreadyGenuine =
      existingMember && (existingMember.role !== 'MEMBER' || existingMember.staffRoles.length > 0);
    if (alreadyGenuine) {
      return jsonError(
        ctx.requestId,
        409,
        'ALREADY_HAS_PROFILE',
        'This person already has a management profile.',
      );
    }

    const staffRoleIds =
      parsed.data.role === 'MEMBER' ? Array.from(new Set(parsed.data.staffRoleIds)) : [];
    if (staffRoleIds.length > 0) {
      const count = await prisma.staffRole.count({
        where: { id: { in: staffRoleIds }, schoolId: mySchool.schoolId },
      });
      if (count !== staffRoleIds.length) return notFound(ctx.requestId);
    }

    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: mySchool.organizationId, userId } },
      create: {
        organizationId: mySchool.organizationId,
        userId,
        role: parsed.data.role,
        staffRoles: { connect: staffRoleIds.map((rid) => ({ id: rid })) },
      },
      update: {
        role: parsed.data.role,
        staffRoles: { set: staffRoleIds.map((rid) => ({ id: rid })) },
      },
    });

    return NextResponse.json(
      { ok: true, id: userId },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
