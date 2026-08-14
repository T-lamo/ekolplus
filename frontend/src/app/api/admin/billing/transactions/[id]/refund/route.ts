// POST /api/admin/billing/transactions/[id]/refund — creates the negative
// REFUNDED row linked 1:1 to the original (refundOfId unique = can't refund
// twice). The original row keeps its SUCCEEDED status — the mockup's signed
// -$ pattern. See .planning/banani/admin-transactions.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await params;
    const original = await prisma.billingTransaction.findUnique({
      where: { id },
      select: {
        id: true,
        reference: true,
        schoolId: true,
        subscriptionId: true,
        amountCents: true,
        status: true,
        periodStart: true,
        refund: { select: { id: true } },
      },
    });
    if (!original) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Transaction not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (original.status !== 'SUCCEEDED' || original.amountCents <= 0) {
      return NextResponse.json(
        { error: 'NOT_REFUNDABLE', message: 'Seule une transaction réussie peut être remboursée.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (original.refund) {
      return NextResponse.json(
        { error: 'ALREADY_REFUNDED', message: 'Cette transaction a déjà été remboursée.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const refund = await prisma.$transaction(async (tx) => {
      const row = await tx.billingTransaction.create({
        data: {
          reference: `${original.reference}-R`,
          schoolId: original.schoolId,
          subscriptionId: original.subscriptionId,
          amountCents: -original.amountCents,
          method: 'MANUAL',
          status: 'REFUNDED',
          periodStart: original.periodStart,
          refundOfId: original.id,
        },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'billing.transaction_refund',
        targetType: 'BillingTransaction',
        targetId: row.id,
        metadata: { originalReference: original.reference, amountCents: -original.amountCents },
      });
      return row;
    });

    return NextResponse.json(
      { refund },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
