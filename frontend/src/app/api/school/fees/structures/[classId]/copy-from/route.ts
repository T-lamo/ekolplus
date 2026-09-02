// POST /api/school/fees/structures/[classId]/copy-from — "Copier depuis une
// classe". Clones the source class's FeeStructure + tranches onto the
// target class. Refuses if the target already has payments recorded
// against it (same financial-integrity guard as the main PUT route).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ sourceClassId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'paiements', 'create', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { classId } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [targetClass, sourceStructure] = await Promise.all([
      prisma.class.findFirst({ where: { id: classId, schoolId: mySchool.schoolId } }),
      prisma.feeStructure.findFirst({
        where: { classId: parsed.data.sourceClassId, schoolId: mySchool.schoolId },
        include: { tranches: { orderBy: { order: 'asc' } } },
      }),
    ]);
    if (!targetClass) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Target class not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!sourceStructure) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Source class has no fee configuration to copy' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existingTarget = await prisma.feeStructure.findUnique({ where: { classId } });
    if (existingTarget) {
      const paymentCount = await prisma.feePayment.count({
        where: { feeTranche: { feeStructureId: existingTarget.id } },
      });
      if (paymentCount > 0) {
        return NextResponse.json(
          {
            error: 'TRANCHE_HAS_PAYMENTS',
            message: 'Cannot overwrite a configuration that already has recorded payments.',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const feeStructure = await prisma.$transaction(async (tx) => {
      if (existingTarget) {
        await tx.feeTranche.deleteMany({ where: { feeStructureId: existingTarget.id } });
      }
      const structure = await tx.feeStructure.upsert({
        where: { classId },
        create: {
          schoolId: mySchool.schoolId,
          classId,
          totalAmount: sourceStructure.totalAmount,
          registrationFee: sourceStructure.registrationFee,
        },
        update: {
          totalAmount: sourceStructure.totalAmount,
          registrationFee: sourceStructure.registrationFee,
        },
      });
      await tx.feeTranche.createMany({
        data: sourceStructure.tranches.map((t) => ({
          feeStructureId: structure.id,
          order: t.order,
          label: t.label,
          amount: t.amount,
          dueDate: t.dueDate,
          latePenaltyPercent: t.latePenaltyPercent,
          latePenaltyGraceDays: t.latePenaltyGraceDays,
        })),
      });
      return tx.feeStructure.findUniqueOrThrow({
        where: { id: structure.id },
        include: { tranches: { orderBy: { order: 'asc' } } },
      });
    });

    return NextResponse.json({ feeStructure }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
