// PATCH /api/admin/billing/subscriptions/[id] — the "Gérer" modal: change
// plan / status / renewal date, attach or detach a coupon. Every status
// transition is logged to SubscriptionStatusChange in the same tx (churn
// analytics, Q2 decision). See .planning/banani/admin-subscriptions.md.
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
import { couponStatus } from '@/lib/server/admin/saas-metrics';

const PatchBody = z.object({
  planKey: z.string().min(1).optional(),
  status: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELED']).optional(),
  renewsAt: z.coerce.date().optional(),
  trialEndsAt: z.coerce.date().nullable().optional(),
  /** Attach by code; explicit null detaches the current coupon. */
  couponCode: z.string().trim().nullable().optional(),
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

    const sub = await prisma.subscription.findUnique({
      where: { id },
      select: { id: true, status: true, schoolId: true, planId: true, couponId: true },
    });
    if (!sub) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subscription not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const data: Record<string, unknown> = {};
    if (body.renewsAt !== undefined) data['renewsAt'] = body.renewsAt;
    if (body.trialEndsAt !== undefined) data['trialEndsAt'] = body.trialEndsAt;
    if (body.status !== undefined) data['status'] = body.status;

    if (body.planKey !== undefined) {
      const plan = await prisma.subscriptionPlan.findUnique({ where: { key: body.planKey } });
      if (!plan || !plan.active) {
        return NextResponse.json(
          { error: 'PLAN_NOT_FOUND', message: 'Unknown plan' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      data['planId'] = plan.id;
    }

    let couponDelta: { attach?: string; detach?: string | null } | null = null;
    if (body.couponCode !== undefined) {
      if (body.couponCode === null) {
        data['couponId'] = null;
        couponDelta = { detach: sub.couponId };
      } else {
        const coupon = await prisma.coupon.findUnique({ where: { code: body.couponCode } });
        const now = new Date();
        const st = coupon ? couponStatus(coupon, now) : null;
        if (!coupon || (st !== 'ACTIVE' && st !== 'EXPIRING')) {
          return NextResponse.json(
            { error: 'COUPON_INVALID', message: 'Coupon invalide, expiré ou épuisé.' },
            { status: 400, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        if (coupon.schoolId && coupon.schoolId !== sub.schoolId) {
          return NextResponse.json(
            {
              error: 'COUPON_SCHOOL_MISMATCH',
              message: 'Ce coupon est réservé à une autre école.',
            },
            { status: 400, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        data['couponId'] = coupon.id;
        couponDelta = { attach: coupon.id };
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.subscription.update({ where: { id }, data });
      if (body.status !== undefined && body.status !== sub.status) {
        await tx.subscriptionStatusChange.create({
          data: { subscriptionId: id, fromStatus: sub.status, toStatus: body.status },
        });
      }
      if (couponDelta?.attach && couponDelta.attach !== sub.couponId) {
        await tx.coupon.update({
          where: { id: couponDelta.attach },
          data: { usedCount: { increment: 1 } },
        });
      }
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'billing.subscription_update',
        targetType: 'Subscription',
        targetId: id,
        metadata: { fields: Object.keys(data), from: sub.status, to: body.status ?? sub.status },
      });
      return next;
    });

    return NextResponse.json(
      { subscription: updated },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
