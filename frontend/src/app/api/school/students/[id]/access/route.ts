// POST /api/school/students/[id]/access — username-only access for an
// existing student who has no account yet (spec
// 2026-09-04-personnel-module-design.md §6.7/§7). Same mechanics as
// teachers/[id]/access: active immediately, no VerificationCode, no
// outbox row, generated password returned once as `temporaryPassword`.
// No OrganizationMember row is created — student accounts never carry
// one, exactly like students/[id]/invite (`createOrgMembership: false`);
// resolveMySpaces()'s student check reads Student.userId directly and
// never needs an organization membership.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf, hashPassword } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { generateInitialPassword } from '@/lib/server/initial-password';
import { zUsername } from '@/lib/username';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const bodySchema = z.object({ username: zUsername });

function jsonError(
  requestId: string,
  status: number,
  error: string,
  message: string,
  extra?: object,
) {
  return NextResponse.json(
    { error, message, ...extra },
    { status, headers: { 'x-request-id': requestId } },
  );
}
function notFound(requestId: string) {
  return jsonError(requestId, 404, 'NOT_FOUND', 'Student not found');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = verifyCsrf(req);
    if (csrf) return csrf;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'eleves', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student || student.schoolId !== mySchool.schoolId) return notFound(ctx.requestId);
    if (student.userId) {
      return jsonError(
        ctx.requestId,
        400,
        'ACCOUNT_ALREADY_EXISTS',
        'This student already has an account.',
      );
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(ctx.requestId, 400, 'VALIDATION_FAILED', 'Invalid username', {
        field: 'username',
      });
    }

    const existing = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (existing) {
      return jsonError(ctx.requestId, 409, 'USERNAME_TAKEN', 'This username is already taken.');
    }

    const temporaryPassword = generateInitialPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const name = `${student.firstName} ${student.lastName}`.trim();

    try {
      const userId = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username: parsed.data.username,
            name,
            phone: student.phone,
            passwordHash,
          },
        });
        await tx.student.update({ where: { id: student.id }, data: { userId: user.id } });
        return user.id;
      });
      return NextResponse.json(
        { ok: true, userId, temporaryPassword },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return jsonError(ctx.requestId, 409, 'USERNAME_TAKEN', 'This username is already taken.');
      }
      throw err;
    }
  });
}
