// frontend/src/app/api/school/members/[userId]/route.ts
// PATCH — assigns or unassigns a StaffRole on a MEMBER-role org account.
// OWNER/ADMIN targets never carry a StaffRole (implicit full access), so
// they 400 as NOT_A_MEMBER. 404 anti-fuite when the caller isn't ADMIN+,
// when the target isn't part of the caller's org, or when the given
// staffRoleId doesn't belong to the caller's school.
// Spec 2026-09-01-permission-manager §8.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const bodySchema = z.object({ staffRoleId: z.string().nullable() });

function notFound(requestId: string) {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}
function validationFailed(requestId: string) {
  return NextResponse.json(
    { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
    { status: 400, headers: { 'x-request-id': requestId } },
  );
}

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
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) return notFound(ctx.requestId);

    const { userId: targetUserId } = await params;
    const target = await prisma.organizationMember.findFirst({
      where: { organizationId: mySchool.organizationId, userId: targetUserId },
      select: { id: true, role: true },
    });
    if (!target) return notFound(ctx.requestId);
    if (target.role !== 'MEMBER') {
      return NextResponse.json(
        { error: 'NOT_A_MEMBER', message: 'Staff roles only apply to MEMBER accounts.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationFailed(ctx.requestId);
    if (parsed.data.staffRoleId !== null) {
      const role = await prisma.staffRole.findFirst({
        where: { id: parsed.data.staffRoleId, schoolId: mySchool.schoolId },
        select: { id: true },
      });
      if (!role) return notFound(ctx.requestId);
    }
    await prisma.organizationMember.update({
      where: { id: target.id },
      data: { staffRoleId: parsed.data.staffRoleId },
    });
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
