// PATCH /api/school/fees/disputes/[id] — resolve a dispute (sets resolvedAt).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'paiements', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const dispute = await prisma.feeDispute.findFirst({
      where: { id, student: { schoolId: mySchool.schoolId } },
    });
    if (!dispute) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Dispute not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const updated = await prisma.feeDispute.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });

    return NextResponse.json({ dispute: updated }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
