// POST /api/school/accounts/[userId]/reset-password — admin-generated
// password reset, ONLY for an account with no email on file (spec
// 2026-09-04-personnel-module-design.md §5.4/§6.5/§7): an account with an
// email has its own recovery channel ("mot de passe oublié") and an admin
// must not be able to bypass it (`ACCOUNT_HAS_EMAIL` 400 guard). Same
// authorization as PATCH accounts/[userId] — see
// `lib/server/school-accounts.ts`'s `requireAccountAccess`, on the RBAC-01
// whitelist. `tokenVersion` is bumped, exactly like a self-service password
// change; the new password is hashed immediately and returned ONCE.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf, hashPassword } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import { requireAccountAccess } from '@/lib/server/school-accounts';
import { generateInitialPassword } from '@/lib/server/initial-password';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function jsonError(requestId: string, status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: { 'x-request-id': requestId } });
}
function notFound(requestId: string) {
  return jsonError(requestId, 404, 'NOT_FOUND', 'Not found');
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
    if (!mySchool) return notFound(ctx.requestId);

    const { userId: targetUserId } = await params;
    const access = await requireAccountAccess(auth.user.sub, targetUserId, mySchool, ctx.requestId);
    if (!access.ok) return access.response;

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { email: true },
    });
    if (!user) return notFound(ctx.requestId);
    if (user.email != null) {
      return jsonError(
        ctx.requestId,
        400,
        'ACCOUNT_HAS_EMAIL',
        'This account has an email on file; the person should use "forgot password" instead.',
      );
    }

    const temporaryPassword = generateInitialPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await prisma.user.update({
      where: { id: targetUserId },
      data: { passwordHash, tokenVersion: { increment: 1 }, passwordChangedAt: new Date() },
    });

    return NextResponse.json(
      { ok: true, temporaryPassword },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
