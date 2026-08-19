// PATCH/DELETE /api/admin/billing/coupons/[id] — edit, enable/disable and
// delete a coupon. Deletion is refused while any subscription still holds
// the coupon (409 COUPON_IN_USE) — the honest alternative is disabling it.
//
// Stripe mirror (lib/server/billing/coupons.ts): Stripe is reconciled
// BEFORE the DB write, so a Stripe failure leaves the coupon exactly as it
// was (502 STRIPE_ERROR) instead of a code whose terms differ between the
// back-office and the Checkout page. `PATCH {}` is the explicit
// « Synchroniser avec Stripe » for a row created without keys.
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
import { createLogger } from '@/lib/server/logger';
import {
  COUPON_STRIPE_SELECT,
  reconcileStripeCoupon,
  removeStripeCoupon,
  type CouponStripeView,
} from '@/lib/server/billing/coupons';

const log = createLogger();

function stripeError(ctx: { requestId: string }, err: unknown, what: string): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  log.error(`stripe coupon ${what} failed`, { message });
  return NextResponse.json(
    { error: 'STRIPE_ERROR', message: `Stripe a refusé la modification : ${message}` },
    { status: 502, headers: { 'x-request-id': ctx.requestId } },
  );
}

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

    const coupon = await prisma.coupon.findUnique({ where: { id }, select: COUPON_STRIPE_SELECT });
    if (!coupon) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Coupon not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const nextType = body.type ?? coupon.type;
    const nextValue = body.value ?? coupon.value;
    if (nextType === 'PERCENT' && nextValue > 100) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Un pourcentage ne peut pas dépasser 100.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { planKey, ...rest } = body;
    const data: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    // Intended state after the edit — what Stripe must mirror.
    let nextPlan: CouponStripeView['plan'] = coupon.plan;
    if (planKey !== undefined) {
      if (planKey === null) {
        data['planId'] = null;
        nextPlan = null;
      } else {
        const plan = await prisma.subscriptionPlan.findUnique({ where: { key: planKey } });
        if (!plan) {
          return NextResponse.json(
            { error: 'PLAN_NOT_FOUND', message: 'Unknown plan' },
            { status: 404, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        data['planId'] = plan.id;
        nextPlan = { key: plan.key };
      }
    }
    let nextSchool: CouponStripeView['school'] = coupon.school;
    if (body.schoolId !== undefined) {
      nextSchool = body.schoolId
        ? await prisma.school.findUnique({
            where: { id: body.schoolId },
            select: { id: true, name: true, stripeCustomerId: true, officialEmail: true },
          })
        : null;
      if (body.schoolId && !nextSchool) {
        return NextResponse.json(
          { error: 'SCHOOL_NOT_FOUND', message: 'Unknown school' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }
    const after: CouponStripeView = {
      ...coupon,
      type: nextType,
      value: nextValue,
      durationMonths:
        body.durationMonths !== undefined ? body.durationMonths : coupon.durationMonths,
      maxUses: body.maxUses !== undefined ? body.maxUses : coupon.maxUses,
      expiresAt: body.expiresAt !== undefined ? body.expiresAt : coupon.expiresAt,
      active: body.active ?? coupon.active,
      plan: nextPlan,
      school: nextSchool,
    };

    let sync;
    try {
      sync = await reconcileStripeCoupon(prisma, after, coupon);
    } catch (err) {
      return stripeError(ctx, err, 'update');
    }
    data['stripeCouponId'] = sync.stripeCouponId;
    data['stripePromotionCodeId'] = sync.stripePromotionCodeId;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.coupon.update({ where: { id }, data });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'billing.coupon_update',
        targetType: 'Coupon',
        targetId: id,
        metadata: { code: coupon.code, fields: Object.keys(rest), stripe: sync.action },
      });
      return row;
    });

    return NextResponse.json(
      {
        coupon: updated,
        stripe: { synced: sync.stripePromotionCodeId !== null, action: sync.action },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
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
      select: {
        id: true,
        code: true,
        stripeCouponId: true,
        stripePromotionCodeId: true,
        _count: { select: { subscriptions: true } },
      },
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

    // Stripe first: a code must never stay redeemable on Checkout after the
    // back-office forgot it. `removeStripeCoupon` tolerates already-deleted
    // objects; any other Stripe error keeps the row (502).
    if (coupon.stripeCouponId || coupon.stripePromotionCodeId) {
      try {
        await removeStripeCoupon(coupon);
      } catch (err) {
        return stripeError(ctx, err, 'delete');
      }
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
