// POST /api/school/members/[userId]/invite — resend a pending staff
// invitation (Paramètres › Administrateurs › « Renvoyer l'invitation »).
// ADMIN+ only (404 anti-fuite otherwise). 409 ALREADY_ACTIVE once the
// account has a password or a verified email: there is nothing left to
// accept. Invalidates the previous unused STAFF_INVITE code and issues a
// fresh one through createPortalInvite's resend path (existingUserId, no
// membership change), the same way the teacher invite route resends.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  STAFF_INVITE_ACCEPT_PATH,
  STAFF_INVITE_PORTAL_LABEL,
  STAFF_INVITE_TTL_MS,
} from '../../route';

function notFound(requestId: string) {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

export async function POST(
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
        user: { select: { id: true, email: true, passwordHash: true, emailVerifiedAt: true } },
      },
    });
    if (!target) return notFound(ctx.requestId);
    if (target.user.passwordHash || target.user.emailVerifiedAt) {
      return NextResponse.json(
        { error: 'ALREADY_ACTIVE', message: 'This account has already been activated.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // A pending member (reached this line: no passwordHash, no
    // emailVerifiedAt) is always email-based — a username account gets its
    // password immediately at creation, never goes through this pending
    // state. Defensive guard rather than a cast: a null email here would
    // mean the invariant broke somewhere upstream.
    if (!target.user.email) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'This account has no email invite to resend.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.verificationCode.updateMany({
      where: { userId: target.user.id, type: 'STAFF_INVITE', usedAt: null },
      data: { usedAt: new Date() },
    });
    const result = await createPortalInvite({
      schoolId: mySchool.schoolId,
      organizationId: mySchool.organizationId,
      email: target.user.email,
      inviteType: 'STAFF_INVITE',
      portalLabel: STAFF_INVITE_PORTAL_LABEL,
      acceptPath: STAFF_INVITE_ACCEPT_PATH,
      expiresInMs: STAFF_INVITE_TTL_MS,
      createOrgMembership: false,
      linkExisting: async () => {},
      existingUserId: target.user.id,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: 'This email is already in use.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
