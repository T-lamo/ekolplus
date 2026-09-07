// POST /api/auth/login — AUTH-02 + AUTH-10 lockout integration.
//
// Source: RESEARCH.md Pattern 9 (sequence) + Pattern 8 (constant-time error
// path) + Pattern 10 (lockout-store integration).
//
// Order is load-bearing per D-24 (enumeration resistance):
//   1. Zod validate body
//   2. Per-identifier rate limit (10/15m — D-08)
//   3. Lockout flag check (Redis) — early-out before bcrypt cost
//   4. User lookup (email or username — see resolveIdentifier below)
//   5. No-user branch: dummy bcrypt compare → INVALID_CREDENTIALS (no recordFailure)
//   6. verifyPassword → on fail recordFailure → LOCKED_OUT or INVALID_CREDENTIALS
//   7. emailVerifiedAt check (after credential match — D-24; skipped for a
//      username-only account, which has no email to verify, AND skipped
//      when the login itself was resolved via username even if that same
//      account also has an unverified email on file — see spec
//      2026-09-04-personnel-module-design.md §5.1/§5.4: "la connexion par
//      nom d'utilisateur continue de fonctionner" while an added-after-the-
//      fact email awaits verification)
//   8. recordSuccess + issue 3 cookies
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
  verifyPassword,
} from '@/lib/server/auth';
import { isLockedOut, recordFailure, recordSuccess } from '@/lib/server/auth/lockout';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getRedis } from '@/lib/server/redis';
import { prisma } from '@/lib/server/prisma';
import { zEmail } from '@/lib/server/zod-helpers';
import { normalizeUsername, USERNAME_REGEX } from '@/lib/username';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const LoginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

// A login identifier is routed by a single character: "@" always means
// email (an email can never be a valid username — USERNAME_REGEX forbids
// "@"), anything else is tried as a username. An identifier that matches
// neither format still flows through the dummy-bcrypt / INVALID_CREDENTIALS
// path below (same code, same timing as an unknown email) — it must never
// surface a distinct validation error, that would leak which accounts
// exist by format alone.
function resolveIdentifierLookup(
  identifier: string,
): { email: string } | { username: string } | null {
  if (identifier.includes('@')) {
    const parsed = zEmail.safeParse(identifier);
    return parsed.success ? { email: parsed.data } : null;
  }
  const normalized = normalizeUsername(identifier);
  return USERNAME_REGEX.test(normalized) ? { username: normalized } : null;
}

// Module-level limiter — D-08: 10 attempts / 15 min per email.
const redis = getRedis() ?? undefined;
const limiter = createEmailLimiter(
  { ...(redis ? { redis } : {}) },
  {
    bucket: 'auth:login',
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX ?? 10),
    code: 'TOO_MANY_LOGIN_ATTEMPTS',
    message: 'Too many login attempts. Try again later.',
  },
);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    // 1. Validate body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid JSON body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { identifier, password } = parsed.data;

    // 2. Rate limit per identifier (opaque string key — works the same for
    //    an email or a username, both call sites below reuse it verbatim).
    const rl = await limiter.check(req, identifier);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    // 3. Lockout flag check — early out before bcrypt
    if (await isLockedOut(identifier)) {
      log.warn('login blocked by lockout', { identifier });
      return NextResponse.json(
        { error: 'LOCKED_OUT', message: 'Account temporarily locked.' },
        { status: 423, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // 4. User lookup — email or username, decided by format alone (see
    //    resolveIdentifierLookup). An identifier matching neither format
    //    falls straight into the same no-user branch as an unknown email.
    const lookup = resolveIdentifierLookup(identifier);
    const user = lookup
      ? await prisma.user.findUnique({
          where: lookup,
          select: {
            id: true,
            email: true,
            username: true,
            passwordHash: true,
            emailVerifiedAt: true,
            tokenVersion: true,
            status: true,
          },
        })
      : null;

    // 5. No-user (or OAuth-only) branch: dummy bcrypt then INVALID_CREDENTIALS.
    //    No recordFailure here per D-24 — Pattern 9 step 4 only counts failures
    //    against accounts that exist (otherwise an attacker can DoS arbitrary
    //    emails by guessing).
    if (!user || !user.passwordHash) {
      await dummyBcryptCompare(password);
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // 6. verifyPassword → on fail, recordFailure
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const r = await recordFailure(identifier);
      if (r.locked) {
        return NextResponse.json(
          { error: 'LOCKED_OUT', message: 'Account temporarily locked.' },
          { status: 423, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // 7. emailVerifiedAt check — after credential match (D-24). A
    //    username-only account (no email at all) has nothing to verify and
    //    is active immediately; it never reaches this gate. A double-profile
    //    account (username + email both set) that logs in BY USERNAME also
    //    never reaches this gate — only an actual email-path login is
    //    blocked by its own unverified email (spec §5.4).
    const loggedInViaEmail = lookup !== null && 'email' in lookup;
    if (loggedInViaEmail && user.email && !user.emailVerifiedAt) {
      return NextResponse.json(
        { error: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email first.' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // 7b. D-ADMIN-02 — refuse SUSPENDED users AFTER credentials verify (no
    //     enumeration leak: same code path as a non-existent email up to here)
    //     but BEFORE issuing cookies.
    //
    //     WR-04: clear the lockout counter for SUSPENDED users via
    //     `recordSuccess`. The credentials already passed verifyPassword, so
    //     the account holder is legitimate — there is nothing more to deter
    //     by pinning the counter. Without this, every login attempt by a
    //     suspended user accrues toward the lockout, and a SUPERADMIN
    //     restore leaves the user one failed attempt away from a fresh
    //     lockout. Clearing here keeps the counter clean across the
    //     suspend → restore lifecycle.
    if (user.status === 'SUSPENDED') {
      await recordSuccess(identifier);
      return NextResponse.json(
        {
          error: 'ACCOUNT_SUSPENDED',
          message: 'This account has been suspended. Contact support.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // 8. Reset failure count and issue cookies.
    await recordSuccess(identifier);

    // 8b. Login analytics (Epic 2): lastLoginAt powers the admin Users /
    // Schools "Dernière connexion / Dernier accès" columns; LoginEvent
    // powers the activity heatmap + retention KPIs. Best-effort — a
    // failure here must never block a valid login.
    try {
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
        prisma.loginEvent.create({ data: { userId: user.id } }),
      ]);
    } catch (err) {
      log.warn('login analytics write failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    const accessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(accessToken, refreshToken);
    await setCsrfCookie();

    return NextResponse.json(
      { ok: true, user: { sub: user.id, email: user.email, username: user.username } },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
