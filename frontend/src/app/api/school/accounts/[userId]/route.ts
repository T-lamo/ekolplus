// PATCH /api/school/accounts/[userId] — edit the login identifiers
// (email/username) of an existing account (spec
// 2026-09-04-personnel-module-design.md §6.5/§7). On the RBAC-01
// whitelist alongside `members/`/`roles/`: authorization is role-rank +
// `resolveSchoolAccount`, not a single `requireSchoolPermission` grant —
// see `lib/server/school-accounts.ts`'s `requireAccountAccess`.
//
// A username change bumps `tokenVersion` (invalidates existing sessions,
// same convention as a password change). A new email is stamped
// `emailVerifiedAt: null` — it must go through the existing verification
// flow before it can be used to log in or recover the account (spec §5.4);
// this route does not itself send that verification email — that's a
// separate concern (self-service "add email" flow, out of this task's
// scope) and is called out in the Task 3 report.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import { requireAccountAccess } from '@/lib/server/school-accounts';
import { zEmail } from '@/lib/server/zod-helpers';
import { zUsername } from '@/lib/username';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function jsonError(requestId: string, status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: { 'x-request-id': requestId } });
}
function notFound(requestId: string) {
  return jsonError(requestId, 404, 'NOT_FOUND', 'Not found');
}

const bodySchema = z
  .object({
    email: zEmail.nullable().optional(),
    username: zUsername.nullable().optional(),
  })
  .refine((b) => b.email !== undefined || b.username !== undefined, {
    message: 'Nothing to update',
  });

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
    if (!mySchool) return notFound(ctx.requestId);

    const { userId: targetUserId } = await params;
    const access = await requireAccountAccess(auth.user.sub, targetUserId, mySchool, ctx.requestId);
    if (!access.ok) return access.response;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(ctx.requestId, 400, 'VALIDATION_FAILED', 'Invalid request body');
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { email: true, username: true },
    });
    if (!user) return notFound(ctx.requestId);

    const nextEmail = parsed.data.email !== undefined ? parsed.data.email : user.email;
    const nextUsername = parsed.data.username !== undefined ? parsed.data.username : user.username;
    if (nextEmail === null && nextUsername === null) {
      return jsonError(
        ctx.requestId,
        400,
        'LAST_IDENTIFIER',
        'An account must keep at least one login identifier.',
      );
    }

    if (parsed.data.email !== undefined && nextEmail !== null && nextEmail !== user.email) {
      const conflict = await prisma.user.findUnique({ where: { email: nextEmail } });
      if (conflict && conflict.id !== targetUserId) {
        return jsonError(
          ctx.requestId,
          409,
          'EMAIL_ALREADY_IN_USE',
          'This email is already in use.',
        );
      }
    }
    if (
      parsed.data.username !== undefined &&
      nextUsername !== null &&
      nextUsername !== user.username
    ) {
      const conflict = await prisma.user.findUnique({ where: { username: nextUsername } });
      if (conflict && conflict.id !== targetUserId) {
        return jsonError(ctx.requestId, 409, 'USERNAME_TAKEN', 'This username is already taken.');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (parsed.data.email !== undefined) {
      data.email = nextEmail;
      if (nextEmail !== user.email) data.emailVerifiedAt = null;
    }
    if (parsed.data.username !== undefined) {
      data.username = nextUsername;
      if (nextUsername !== user.username) data.tokenVersion = { increment: 1 };
    }

    try {
      await prisma.user.update({ where: { id: targetUserId }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = Array.isArray(err.meta?.target)
          ? err.meta.target.join(',')
          : String(err.meta?.target ?? '');
        if (target.includes('email')) {
          return jsonError(
            ctx.requestId,
            409,
            'EMAIL_ALREADY_IN_USE',
            'This email is already in use.',
          );
        }
        return jsonError(ctx.requestId, 409, 'USERNAME_TAKEN', 'This username is already taken.');
      }
      throw err;
    }

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
