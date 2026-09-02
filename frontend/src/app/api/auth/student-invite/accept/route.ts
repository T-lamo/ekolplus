// POST /api/auth/student-invite/accept — AUTH-style code consumption.
//
// Consumes a STUDENT_INVITE code, hashes the submitted password into
// User.passwordHash, marks emailVerifiedAt, marks the code usedAt, and
// issues all three auth cookies. Direct structural mirror of
// /api/auth/teacher-invite/accept (Espace Enseignant Phase 1, Task 8) —
// see that route for the shared reasoning; only the VerificationCode.type
// filter and rate-limit bucket differ.
//
// CSRF carve-out: pre-session route — the CSRF cookie is set HERE on
// success, so calling verifyCsrf would 403 every legitimate request.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import {
  VERIFICATION_CODE_REGEX,
  hashPassword,
  setAuthCookies,
  setCsrfCookie,
  createAccessToken,
  createRefreshToken,
  timingSafeCompare,
} from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);

const Body = z.object({
  email: zEmail,
  code: z.string().regex(VERIFICATION_CODE_REGEX, 'Invalid verification code format'),
  newPassword: z.string().min(1),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:student-invite-accept',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_VERIFY_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_VERIFY_ATTEMPTS',
  message: 'Too many attempts. Try again later.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    const { email, code, newPassword } = parsed.data;

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    if (isBanned(newPassword)) {
      const res = NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (newPassword.length < PASSWORD_MIN) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(newPassword))) {
      const res = NextResponse.json(
        { error: 'PASSWORD_PWNED', message: 'This password appeared in a known data breach.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, tokenVersion: true },
    });
    if (!user) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const codeRow = await prisma.verificationCode.findFirst({
      where: { userId: user.id, code, type: 'STUDENT_INVITE', usedAt: null },
      select: { id: true, code: true, expiresAt: true },
    });
    if (!codeRow) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (codeRow.expiresAt.getTime() < Date.now()) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_EXPIRED', message: 'Verification code has expired.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (!timingSafeCompare(code, codeRow.code)) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const passwordHash = await hashPassword(newPassword);

    try {
      await prisma.$transaction(async (tx) => {
        const consumed = await tx.verificationCode.updateMany({
          where: { id: codeRow.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw new Error('VERIFICATION_CODE_RACE');
        }
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash, emailVerifiedAt: new Date() },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'VERIFICATION_CODE_RACE') {
        const res = NextResponse.json(
          { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
          { status: 400 },
        );
        res.headers.set('x-request-id', ctx.requestId);
        return res;
      }
      throw err;
    }

    const access = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refresh = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    log.info('student-invite accept success', { userId: user.id });
    const res = NextResponse.json({ ok: true, user: { sub: user.id, email: user.email } });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
