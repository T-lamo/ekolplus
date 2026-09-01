// POST /api/school/fees/payments — the Payment Registration modal's submit.
// Late penalty is computed server-side (never trusts a client-supplied
// penalty amount) via computeLatePenalty, gated by the school's
// FeeAutomationSettings.lateFeeEnabled.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { computeLatePenalty } from '@/lib/server/fees';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  studentId: z.string().min(1),
  feeTrancheId: z.string().min(1),
  amount: z.number().int().min(1),
  method: z.enum(['ESPECES', 'MONCASH', 'NATCASH', 'CHEQUE', 'VIREMENT']),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  paidAt: z.coerce.date().optional(),
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

    const [student, tranche, automationSettings] = await Promise.all([
      prisma.student.findFirst({
        where: { id: parsed.data.studentId, schoolId: mySchool.schoolId },
      }),
      prisma.feeTranche.findFirst({
        where: {
          id: parsed.data.feeTrancheId,
          feeStructure: { schoolId: mySchool.schoolId },
        },
      }),
      prisma.feeAutomationSettings.findUnique({ where: { schoolId: mySchool.schoolId } }),
    ]);
    if (!student) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!tranche) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Fee tranche not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const paidAt = parsed.data.paidAt ?? new Date();
    const lateFeeEnabled = automationSettings?.lateFeeEnabled ?? true;
    const penaltyAmount = lateFeeEnabled ? computeLatePenalty(tranche, paidAt) : 0;

    const payment = await prisma.feePayment.create({
      data: {
        schoolId: mySchool.schoolId,
        studentId: parsed.data.studentId,
        feeTrancheId: parsed.data.feeTrancheId,
        amount: parsed.data.amount,
        penaltyAmount,
        method: parsed.data.method,
        reference: parsed.data.reference || null,
        notes: parsed.data.notes || null,
        paidAt,
        recordedById: auth.user.sub,
      },
    });

    return NextResponse.json(
      { payment },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
