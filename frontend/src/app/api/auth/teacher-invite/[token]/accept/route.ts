// POST /api/auth/teacher-invite/[token]/accept — consumes a TeacherInvite
// token and creates the teacher's login: a User row + an
// OrganizationMember(role: MEMBER) on the school's organization + links
// Teacher.userId. Same password-policy gates as /api/auth/signup. Issues no
// session cookies — the teacher logs in afterward through the unmodified
// standard /api/auth/login flow (same posture as /api/auth/reset-password).
//
// Race guard (mirrors WR-05 in reset-password/route.ts): the outer
// `findUnique` check above is just an optimization to fail fast/cheaply —
// it does NOT close the TOCTOU window between two concurrent requests for
// the same still-valid token. The invite-consuming write below is a
// `updateMany` with a `usedAt: null` compare-and-swap guard and runs FIRST
// inside the transaction, before any User/OrganizationMember/Teacher write.
// A losing racer sees count===0, throws a sentinel error, and the whole
// transaction rolls back before touching the account — surfaced to the
// caller as the same INVALID_OR_EXPIRED shape as an already-used invite.
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
        const user = existingUser
          ? await tx.user.update({
              where: { id: existingUser.id },
              data: { passwordHash, emailVerifiedAt: new Date() },
              select: { id: true },
            })
          : await tx.user.create({
              data: { email: invite.teacher.email!, passwordHash, emailVerifiedAt: new Date() },
              select: { id: true },
            });

        const org = await tx.organization.findFirst({
          where: { school: { id: invite.schoolId } },
          select: { id: true },
        });
        if (org) {
          await tx.organizationMember.upsert({
            where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
            create: { organizationId: org.id, userId: user.id, role: 'MEMBER' },
            update: {},
          });
        }

        await tx.teacher.update({ where: { id: invite.teacherId }, data: { userId: user.id } });
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'TEACHER_INVITE_RACE') {
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
