// POST /api/auth/teacher-invite/[token]/accept — consumes a TeacherInvite
// token and creates the teacher's login: a User row + links Teacher.userId.
// Deliberately grants NO OrganizationMember row — nothing in this feature
// needs school-membership (resolveMyTeacherProfile resolves identity via
// Teacher.userId directly), and /api/school/* routes gate reads on
// membership existing at all, not on role, so granting one would hand every
// invited teacher read access to the whole back-office. Same password-policy
// gates as /api/auth/signup, but token validation runs FIRST (WR-01
// pattern, mirrors reset-password/route.ts): the token lookup is a cheap
// unique-indexed read that should reject a garbage/expired token before any
// password-policy work (isBanned/isPwned) runs — otherwise an unrated,
// pre-session route lets an attacker probe banned-list/HIBP state for free.
// If the invite's email already belongs to an existing User, the invite is
// rejected rather than silently overwriting that account's password (no
// ownership proof exists that the caller is the account's real owner).
// Issues no session cookies — the teacher logs in afterward through the
// unmodified standard /api/auth/login flow (same posture as
// /api/auth/reset-password).
//
// Race guard (mirrors WR-05 in reset-password/route.ts): the outer
// `findUnique` check above is just an optimization to fail fast/cheaply —
// it does NOT close the TOCTOU window between two concurrent requests for
// the same still-valid token. The invite-consuming write below is a
// `updateMany` with a `usedAt: null` compare-and-swap guard and runs FIRST
// inside the transaction, before any User/Teacher write. A losing racer (or
// a request that loses to an email-already-in-use conflict) throws a
// sentinel error and the whole transaction rolls back before touching any
// account — surfaced to the caller as the same INVALID_OR_EXPIRED shape as
// an already-used invite.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { hashPassword } from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);

const Body = z.object({ password: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { token } = await params;
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { password } = parsed.data;

    // Token validation FIRST — see WR-01 note above.
    const invite = await prisma.teacherInvite.findUnique({
      where: { token },
      select: {
        id: true,
        expiresAt: true,
        usedAt: true,
        schoolId: true,
        teacherId: true,
        teacher: { select: { email: true, userId: true } },
      },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date() || invite.teacher.userId) {
      return NextResponse.json(
        { error: 'INVALID_OR_EXPIRED', message: 'Invite invalid or expired' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!invite.teacher.email) {
      return NextResponse.json(
        { error: 'INVALID_OR_EXPIRED', message: 'Invite invalid or expired' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (isBanned(password)) {
      return NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (password.length < PASSWORD_MIN) {
      return NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(password))) {
      return NextResponse.json(
        { error: 'PASSWORD_PWNED', message: 'This password appeared in a known data breach.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const passwordHash = await hashPassword(password);

    try {
      await prisma.$transaction(async (tx) => {
        // CAS guard MUST run first — see race-guard comment above.
        const consumed = await tx.teacherInvite.updateMany({
          where: { id: invite.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw new Error('TEACHER_INVITE_RACE');
        }

        const existingUser = await tx.user.findUnique({
          where: { email: invite.teacher.email! },
          select: { id: true },
        });
        if (existingUser) {
          throw new Error('TEACHER_INVITE_EMAIL_IN_USE');
        }

        const user = await tx.user.create({
          data: { email: invite.teacher.email!, passwordHash, emailVerifiedAt: new Date() },
          select: { id: true },
        });

        await tx.teacher.update({ where: { id: invite.teacherId }, data: { userId: user.id } });
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === 'TEACHER_INVITE_RACE' || err.message === 'TEACHER_INVITE_EMAIL_IN_USE')
      ) {
        return NextResponse.json(
          { error: 'INVALID_OR_EXPIRED', message: 'Invite invalid or expired' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
