// POST /api/school/teachers/[id]/invite — admin invites a teacher to log
// in. Idempotent-ish: calling it again on an already-linked teacher
// invalidates the previous unused invite code and issues a fresh one
// (resend), rather than erroring.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — see design spec for why this differs from AUTH_VERIFICATION_TTL_MIN

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const csrfError = verifyCsrf(req);
    if (csrfError) return csrfError;

    const perm = await requireSchoolPermission(auth.user.sub, 'enseignants', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const teacher = await prisma.teacher.findUnique({ where: { id } });
    if (!teacher || teacher.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!teacher.email) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Teacher has no email on file' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Resend path: already linked to a User — invalidate the previous
    // unused invite code and re-send, don't create a second User/link.
    if (teacher.userId) {
      await prisma.verificationCode.updateMany({
        where: { userId: teacher.userId, type: 'TEACHER_INVITE', usedAt: null },
        data: { usedAt: new Date() },
      });
      const result = await createPortalInvite({
        schoolId: mySchool.schoolId,
        organizationId: mySchool.organizationId,
        email: teacher.email,
        inviteType: 'TEACHER_INVITE',
        portalLabel: 'espace enseignant',
        expiresInMs: INVITE_TTL_MS,
        createOrgMembership: false, // already has one from the first invite
        linkExisting: async () => {}, // already linked
        // Resolve the target User by the id we already know (Teacher.userId)
        // rather than by `email` — an admin may have edited the teacher's
        // email between the first invite and this resend, and that PATCH
        // does not keep the linked User.email in sync (see PATCH handler in
        // ../route.ts). Looking up by email here would miss the real user
        // and create an orphaned, membership-less account instead.
        existingUserId: teacher.userId,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, message: 'This email is already in use.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { ok: true, resent: true },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const result = await createPortalInvite({
      schoolId: mySchool.schoolId,
      organizationId: mySchool.organizationId,
      email: teacher.email,
      inviteType: 'TEACHER_INVITE',
      portalLabel: 'espace enseignant',
      expiresInMs: INVITE_TTL_MS,
      createOrgMembership: true,
      linkExisting: async (tx, userId) => {
        await tx.teacher.update({ where: { id: teacher.id }, data: { userId } });
      },
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: 'This email is already in use.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { ok: true, resent: false },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
