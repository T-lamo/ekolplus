// PATCH/DELETE /api/admin/billing/coupons/[id] — edit, enable/disable and
// delete a coupon. Deletion is refused while any subscription still holds
// the coupon (409 COUPON_IN_USE) — the honest alternative is disabling it.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchBody = z.object({
  type: z.enum(['PERCENT', 'FIXED', 'FREE_MONTH']).optional(),
  value: z.number().int().positive().optional(),
  durationMonths: z.number().int().positive().max(60).nullable().optional(),
  planKey: z.string().nullable().optional(),
  maxUses: z.number().int().positive().max(100000).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  schoolId: z.string().nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
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
    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const body = parsed.data;

    const coupon = await prisma.coupon.findUnique({
      where: { id },
      select: { id: true, code: true },
    });
    if (!coupon) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Coupon not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (body.type === 'PERCENT' && body.value !== undefined && body.value > 100) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Un pourcentage ne peut pas dépasser 100.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { planKey, ...rest } = body;
    const data: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    if (planKey !== undefined) {
      if (planKey === null) {
        data['planId'] = null;
      } else {
        const plan = await prisma.subscriptionPlan.findUnique({ where: { key: planKey } });
        if (!plan) {
          return NextResponse.json(
            { error: 'PLAN_NOT_FOUND', message: 'Unknown plan' },
            { status: 404, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        data['planId'] = plan.id;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.coupon.update({ where: { id }, data });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'billing.coupon_update',
        targetType: 'Coupon',
        targetId: id,
        metadata: { code: coupon.code, fields: Object.keys(data) },
      });
      return row;
    });

    return NextResponse.json({ coupon: updated }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(
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
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      select: { id: true, code: true, _count: { select: { subscriptions: true } } },
    });
    if (!coupon) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Coupon not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (coupon._count.subscriptions > 0) {
      return NextResponse.json(
        {
          error: 'COUPON_IN_USE',
          message: 'Ce coupon est attaché à des abonnements — désactivez-le plutôt.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(async (tx) => {
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'billing.coupon_delete',
        targetType: 'Coupon',
        targetId: id,
        metadata: { code: coupon.code },
      });
      await tx.coupon.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
