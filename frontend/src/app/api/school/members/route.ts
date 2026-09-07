// POST /api/school/members — invite a staff account by email (Paramètres ›
// Administrateurs, Banani « Admin Settings » 2026-09-04). Same mechanics as
// the teacher and student invitations (createPortalInvite): a pending User
// (no password yet), the org membership, a 7-day STAFF_INVITE code and the
// outbox email pointing at /definir-mot-de-passe?portal=staff, all in one
// transaction. The org role and the staff roles are applied through
// `linkExisting`, inside that same transaction.
//
// ADMIN+ only (404 anti-fuite otherwise, like the sibling [userId] route);
// inviting as ADMIN is reserved to the OWNER (403). 409 ALREADY_MEMBER when
// the email already belongs to an active member of this school, 409
// EMAIL_ALREADY_IN_USE when it belongs to any other activated account.
// Re-inviting a still-pending member is allowed: the previous unused code
// is invalidated first (resend semantics, like the teacher route).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const STAFF_INVITE_ACCEPT_PATH = '/definir-mot-de-passe?portal=staff';
export const STAFF_INVITE_PORTAL_LABEL = 'espace de gestion';

const bodySchema = z.object({
  email: zEmail,
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
  staffRoleIds: z.array(z.string().min(1)).max(50).default([]),
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = verifyCsrf(req);
    if (csrf) return csrf;
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) return notFound(ctx.requestId);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(ctx.requestId, 400, 'VALIDATION_FAILED', 'Invalid request body');
    }
    const { email, role } = parsed.data;
    // An ADMIN has full access, so staff roles are meaningless on it.
    const staffRoleIds = role === 'MEMBER' ? Array.from(new Set(parsed.data.staffRoleIds)) : [];

    if (role === 'ADMIN' && mySchool.role !== 'OWNER') {
      return jsonError(
        ctx.requestId,
        403,
        'PERMISSION_DENIED',
        'Only the owner can invite an administrator.',
      );
    }
    if (staffRoleIds.length > 0) {
      // 404 anti-fuite : un id inconnu ou d'une autre école est indistinguable
      const count = await prisma.staffRole.count({
        where: { id: { in: staffRoleIds }, schoolId: mySchool.schoolId },
      });
      if (count !== staffRoleIds.length) return notFound(ctx.requestId);
    }

    const existingMember = await prisma.organizationMember.findFirst({
      where: { organizationId: mySchool.organizationId, user: { email } },
      select: { user: { select: { id: true, passwordHash: true, emailVerifiedAt: true } } },
    });
    if (existingMember) {
      if (existingMember.user.passwordHash || existingMember.user.emailVerifiedAt) {
        return jsonError(
          ctx.requestId,
          409,
          'ALREADY_MEMBER',
          'This account is already a member of the school.',
        );
      }
      // Still pending: this is a resend — retire the previous unused code.
      await prisma.verificationCode.updateMany({
        where: { userId: existingMember.user.id, type: 'STAFF_INVITE', usedAt: null },
        data: { usedAt: new Date() },
      });
    }

    const organizationId = mySchool.organizationId;
    const result = await createPortalInvite({
      schoolId: mySchool.schoolId,
      organizationId,
      email,
      inviteType: 'STAFF_INVITE',
      portalLabel: STAFF_INVITE_PORTAL_LABEL,
      acceptPath: STAFF_INVITE_ACCEPT_PATH,
      expiresInMs: STAFF_INVITE_TTL_MS,
      createOrgMembership: true,
      linkExisting: async (tx, userId) => {
        await tx.organizationMember.update({
          where: { organizationId_userId: { organizationId, userId } },
          data: { role, staffRoles: { set: staffRoleIds.map((id) => ({ id })) } },
        });
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

    return NextResponse.json(
      { userId: result.userId },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
