// frontend/src/app/api/school/members/[userId]/route.ts
// PATCH — staff-role assignment and org-role change on one member of the
// caller's school:
//   - `staffRoleIds` full-replaces the StaffRoles of a MEMBER-role account
//     (multiple roles allowed, `[]` clears every role). OWNER/ADMIN targets
//     never carry a StaffRole (implicit full access), so they 400 as
//     NOT_A_MEMBER — spec 2026-09-01-multi-espaces §8.
//   - `role` (`ADMIN` | `MEMBER`) promotes or demotes — OWNER only (403
//     PERMISSION_DENIED otherwise), never the OWNER row itself (400
//     CANNOT_CHANGE_OWNER). Promoting to ADMIN clears the staff roles since
//     an ADMIN has full access; demoting keeps `staffRoleIds` when given in
//     the same call (Banani « Admin Settings », 2026-09-04).
// DELETE — removes the member's access (org membership) and invalidates a
// pending STAFF_INVITE code: ADMIN+ only, never the OWNER (400
// CANNOT_REMOVE_OWNER), never yourself (400 CANNOT_REMOVE_SELF), an ADMIN
// cannot remove another ADMIN (403), and a teacher-linked account is never
// removed here (409 MEMBER_IS_TEACHER: the membership is what opens the
// teacher portal, see resolveMySpaces — the fiche enseignant owns that
// lifecycle).
// 404 anti-fuite when the caller isn't ADMIN+, when the target isn't part of
// the caller's org, or when a given staffRoleId doesn't belong to the school.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const bodySchema = z
  .object({
    staffRoleIds: z.array(z.string().min(1)).max(50).optional(),
    role: z.enum(['ADMIN', 'MEMBER']).optional(),
  })
  .refine((b) => b.staffRoleIds !== undefined || b.role !== undefined, {
    message: 'Nothing to update',
  });

function notFound(requestId: string) {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}
function jsonError(requestId: string, status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: { 'x-request-id': requestId } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = verifyCsrf(req);
    if (csrf) return csrf;
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) return notFound(ctx.requestId);

    const { userId: targetUserId } = await params;
    const target = await prisma.organizationMember.findFirst({
      where: { organizationId: mySchool.organizationId, userId: targetUserId },
      select: { id: true, role: true },
    });
    if (!target) return notFound(ctx.requestId);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(ctx.requestId, 400, 'VALIDATION_FAILED', 'Invalid request body');
    }
    const { role } = parsed.data;

    if (role !== undefined) {
      if (mySchool.role !== 'OWNER') {
        return jsonError(
          ctx.requestId,
          403,
          'PERMISSION_DENIED',
          'Only the owner can change an org role.',
        );
      }
      if (target.role === 'OWNER') {
        return jsonError(
          ctx.requestId,
          400,
          'CANNOT_CHANGE_OWNER',
          'The owner role cannot be changed here.',
        );
      }
    }

    const effectiveRole = role ?? target.role;
    if (parsed.data.staffRoleIds !== undefined && effectiveRole !== 'MEMBER') {
      return jsonError(
        ctx.requestId,
        400,
        'NOT_A_MEMBER',
        'Staff roles only apply to MEMBER accounts.',
      );
    }

    const staffRoleIds =
      parsed.data.staffRoleIds !== undefined
        ? Array.from(new Set(parsed.data.staffRoleIds))
        : undefined;
    if (staffRoleIds && staffRoleIds.length > 0) {
      // 404 anti-fuite : un id inconnu ou d'une autre école est indistinguable
      const count = await prisma.staffRole.count({
        where: { id: { in: staffRoleIds }, schoolId: mySchool.schoolId },
      });
      if (count !== staffRoleIds.length) return notFound(ctx.requestId);
    }

    const data = {
      ...(role !== undefined ? { role } : {}),
      ...(staffRoleIds !== undefined
        ? { staffRoles: { set: staffRoleIds.map((id) => ({ id })) } }
        : role === 'ADMIN'
          ? { staffRoles: { set: [] } }
          : {}),
    };
    try {
      await prisma.organizationMember.update({ where: { id: target.id }, data });
    } catch (err) {
      // A staffRoleId can be deleted between the count check above and this
      // update (TOCTOU) — Prisma throws P2025 when a `set` connect target no
      // longer exists. Treat it the same as any other anti-fuite miss.
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
        return notFound(ctx.requestId);
      }
      throw err;
    }
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = verifyCsrf(req);
    if (csrf) return csrf;
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) return notFound(ctx.requestId);

    const { userId: targetUserId } = await params;
    const target = await prisma.organizationMember.findFirst({
      where: { organizationId: mySchool.organizationId, userId: targetUserId },
      select: {
        id: true,
        role: true,
        userId: true,
        user: { select: { teacherProfile: { select: { schoolId: true } } } },
      },
    });
    if (!target) return notFound(ctx.requestId);

    if (target.userId === auth.user.sub) {
      return jsonError(
        ctx.requestId,
        400,
        'CANNOT_REMOVE_SELF',
        'You cannot remove your own access.',
      );
    }
    if (target.role === 'OWNER') {
      return jsonError(ctx.requestId, 400, 'CANNOT_REMOVE_OWNER', 'The owner cannot be removed.');
    }
    if (target.role === 'ADMIN' && mySchool.role !== 'OWNER') {
      return jsonError(
        ctx.requestId,
        403,
        'PERMISSION_DENIED',
        'Only the owner can remove an administrator.',
      );
    }
    if (target.user.teacherProfile?.schoolId === mySchool.schoolId) {
      return jsonError(
        ctx.requestId,
        409,
        'MEMBER_IS_TEACHER',
        'This account is linked to a teacher; manage its access from the teacher record.',
      );
    }

    await prisma.$transaction([
      prisma.verificationCode.updateMany({
        where: { userId: target.userId, type: 'STAFF_INVITE', usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.organizationMember.delete({ where: { id: target.id } }),
    ]);

    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
