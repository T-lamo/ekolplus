// POST /api/school/students/[id]/invite — admin invites a student to log
// in. Target email resolution: the student's own email if set, otherwise
// the primary guardian's email (the resulting account is always a STUDENT
// account regardless of which address received the invite — see design
// spec's "Invitation target" decision). Calling this again on an
// already-linked student is a resend (invalidate the previous unused
// invite code, issue a fresh one), not an error — same convention as the
// teacher invite route.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — same reasoning as the teacher invite (onboarding link, not a security code)

function resolveInviteTarget(student: {
  email: string | null;
  guardians: { isPrimary: boolean; email: string | null }[];
}): string | null {
  if (student.email) return student.email;
  return student.guardians.find((g) => g.isPrimary && g.email)?.email ?? null;
}

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

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Admin role required' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const student = await prisma.student.findUnique({
      where: { id },
      include: { guardians: { select: { isPrimary: true, email: true } } },
    });
    if (!student || student.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const targetEmail = resolveInviteTarget(student);
    if (!targetEmail) {
      return NextResponse.json(
        {
          error: 'NO_INVITE_TARGET',
          message: 'This student has no email on file and no primary guardian email.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (student.userId) {
      await prisma.verificationCode.updateMany({
        where: { userId: student.userId, type: 'STUDENT_INVITE', usedAt: null },
        data: { usedAt: new Date() },
      });
      const result = await createPortalInvite({
        schoolId: mySchool.schoolId,
        organizationId: mySchool.organizationId,
        email: targetEmail,
        inviteType: 'STUDENT_INVITE',
        portalLabel: 'espace élève',
        expiresInMs: INVITE_TTL_MS,
        createOrgMembership: false,
        // Resend: resolve the existing account by id, not by the freshly
        // re-resolved target email. Student.email/Guardian.email can drift
        // after the first invite without User.email being kept in sync -
        // looking up by the new email would miss the linked User and
        // silently create an orphaned second account (the same bug fixed
        // in the teacher-portal plan, commit 0692b7c).
        existingUserId: student.userId,
        linkExisting: async () => {}, // already linked
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
      email: targetEmail,
      inviteType: 'STUDENT_INVITE',
      portalLabel: 'espace élève',
      expiresInMs: INVITE_TTL_MS,
      createOrgMembership: false,
      linkExisting: async (tx, userId) => {
        await tx.student.update({ where: { id: student.id }, data: { userId } });
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
