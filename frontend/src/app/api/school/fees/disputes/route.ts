// POST /api/school/fees/disputes — "Marquer comme litigieux" on a Relances
// Impayés row. A real open/resolve record, not a bare boolean.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  studentId: z.string().min(1),
  feeTrancheId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'paiements', 'create', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [student, tranche] = await Promise.all([
      prisma.student.findFirst({
        where: { id: parsed.data.studentId, schoolId: mySchool.schoolId },
      }),
      prisma.feeTranche.findFirst({
        where: {
          id: parsed.data.feeTrancheId,
          feeStructure: { schoolId: mySchool.schoolId },
        },
      }),
    ]);
    if (!student || !tranche) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student or tranche not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.feeDispute.findFirst({
      where: {
        studentId: parsed.data.studentId,
        feeTrancheId: parsed.data.feeTrancheId,
        resolvedAt: null,
      },
    });
    if (existing) {
      return NextResponse.json(
        { dispute: existing },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const dispute = await prisma.feeDispute.create({
      data: {
        studentId: parsed.data.studentId,
        feeTrancheId: parsed.data.feeTrancheId,
        reason: parsed.data.reason || null,
        openedById: auth.user.sub,
      },
    });

    return NextResponse.json(
      { dispute },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
