// GET/POST /api/admin/billing/coupons — Coupons screen (Banani
// zNn8It52QEEh). Statuses are always derived (couponStatus) so they can't
// drift; "Remises accordées" is the real current monthly discount across
// attached subscriptions (honest adaptation — the mockup's lifetime total
// would require history we don't have yet, label adjusted accordingly).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { $Enums, Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  couponStatus,
  monthsSince,
  subscriptionMonthlyCents,
} from '@/lib/server/admin/saas-metrics';
import { createLogger } from '@/lib/server/logger';
import {
  COUPON_CODE_HINT,
  COUPON_CODE_MAX,
  COUPON_CODE_MIN,
  COUPON_CODE_RE,
} from '@/lib/coupon-code';
import { isStripeConfigured } from '@/lib/server/billing/stripe-client';
import {
  COUPON_STRIPE_SELECT,
  isStripeRedeemablePlan,
  reconcileStripeCoupon,
} from '@/lib/server/billing/coupons';

const log = createLogger();
const PAGE_SIZE = 20;

const COUPON_SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  durationMonths: true,
  maxUses: true,
  usedCount: true,
  expiresAt: true,
  active: true,
  description: true,
  plan: { select: { key: true, name: true } },
  school: { select: { id: true, name: true } },
  stripePromotionCodeId: true,
  _count: { select: { subscriptions: true } },
} satisfies Prisma.CouponSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const q = (url.searchParams.get('q') ?? '').slice(0, 100).trim();
    const type = url.searchParams.get('type');
    const plan = url.searchParams.get('plan');

    const where: Prisma.CouponWhereInput = {
      ...(q ? { code: { contains: q, mode: 'insensitive' } } : {}),
      ...(type ? { type: type as $Enums.CouponType } : {}),
      ...(plan ? { plan: { key: plan } } : {}),
    };

    const now = new Date();

    const [total, rows, allCoupons, usesAgg, discountedSubs] = await Promise.all([
      prisma.coupon.count({ where }),
      prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: COUPON_SELECT,
      }),
      prisma.coupon.findMany({
        select: { active: true, expiresAt: true, maxUses: true, usedCount: true },
      }),
      prisma.coupon.aggregate({ _sum: { usedCount: true } }),
      prisma.subscription.findMany({
        where: { couponId: { not: null }, status: { in: ['ACTIVE', 'TRIAL'] } },
        select: {
          startedAt: true,
          plan: { select: { pricePerStudentCents: true } },
          coupon: { select: { type: true, value: true, durationMonths: true } },
          school: { select: { id: true } },
        },
      }),
    ]);

    // Current monthly discount = Σ (gross − net) across coupon-attached subs.
    const subSchoolIds = discountedSubs.map((s) => s.school.id);
    const counts =
      subSchoolIds.length > 0
        ? await prisma.student.groupBy({
            by: ['schoolId'],
            where: { schoolId: { in: subSchoolIds } },
            _count: { _all: true },
          })
        : [];
    const studentsBySchool = new Map(counts.map((c) => [c.schoolId, c._count._all]));
    let discountCents = 0;
    for (const sub of discountedSubs) {
      const students = studentsBySchool.get(sub.school.id) ?? 0;
      const gross = students * sub.plan.pricePerStudentCents;
      const net = subscriptionMonthlyCents({
        students,
        priceCents: sub.plan.pricePerStudentCents,
        coupon: sub.coupon,
        monthsSinceStart: monthsSince(sub.startedAt, now),
      });
      discountCents += gross - net;
    }

    const statuses = allCoupons.map((c) => couponStatus(c, now));
    const activeCount = statuses.filter((s) => s === 'ACTIVE' || s === 'EXPIRING').length;
    const expiredCount = statuses.filter((s) => s === 'EXPIRED').length;

    return NextResponse.json(
      {
        items: rows.map((c) => ({
          id: c.id,
          code: c.code,
          type: c.type,
          value: c.value,
          durationMonths: c.durationMonths,
          maxUses: c.maxUses,
          usedCount: c.usedCount,
          expiresAt: c.expiresAt?.toISOString() ?? null,
          active: c.active,
          description: c.description,
          plan: c.plan,
          school: c.school,
          attachedSubscriptions: c._count.subscriptions,
          status: couponStatus(c, now),
          // Whether the code can be typed on the hosted Checkout page
          // (mirrored as a Stripe Promotion Code). `redeemable` = the plan
          // scope allows it at all (only Pro is billed via Stripe).
          stripe: {
            synced: c.stripePromotionCodeId !== null,
            redeemable: isStripeRedeemablePlan(c.plan?.key ?? null),
          },
        })),
        total,
        page,
        pageSize: PAGE_SIZE,
        stripeConfigured: isStripeConfigured(),
        stats: {
          activeCount,
          totalUses: usesAgg._sum.usedCount ?? 0,
          monthlyDiscountCents: discountCents,
          expiredCount,
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const PostBody = z.object({
  code: z
    .string()
    .trim()
    .min(COUPON_CODE_MIN)
    .max(COUPON_CODE_MAX)
    .regex(COUPON_CODE_RE, COUPON_CODE_HINT),
  type: z.enum(['PERCENT', 'FIXED', 'FREE_MONTH']),
  value: z.number().int().positive(),
  durationMonths: z.number().int().positive().max(60).nullable().optional(),
  planKey: z.string().nullable().optional(),
  maxUses: z.number().int().positive().max(100000).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  schoolId: z.string().nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = PostBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const body = parsed.data;

    if (body.type === 'PERCENT' && body.value > 100) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Un pourcentage ne peut pas dépasser 100.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let planId: string | null = null;
    if (body.planKey) {
      const plan = await prisma.subscriptionPlan.findUnique({ where: { key: body.planKey } });
      if (!plan) {
        return NextResponse.json(
          { error: 'PLAN_NOT_FOUND', message: 'Unknown plan' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      planId = plan.id;
    }

    const code = body.code.toUpperCase();
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(
        { error: 'CODE_TAKEN', message: 'Ce code existe déjà.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.coupon.create({
        data: {
          code,
          type: body.type,
          value: body.value,
          durationMonths: body.durationMonths ?? null,
          planId,
          maxUses: body.maxUses ?? null,
          expiresAt: body.expiresAt ?? null,
          schoolId: body.schoolId ?? null,
          description: body.description ?? null,
        },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'billing.coupon_create',
        targetType: 'Coupon',
        targetId: row.id,
        metadata: { code, type: body.type, value: body.value },
      });
      return row;
    });

    // Mirror on Stripe AFTER the row exists: a Stripe hiccup must not lose
    // the admin's coupon — the row is kept, flagged unsynced in the list,
    // and « Synchroniser avec Stripe » (PATCH {}) retries.
    let stripe: { synced: boolean; error?: string } = { synced: false };
    try {
      const view = await prisma.coupon.findUniqueOrThrow({
        where: { id: created.id },
        select: COUPON_STRIPE_SELECT,
      });
      const sync = await reconcileStripeCoupon(prisma, view, null);
      if (sync.stripePromotionCodeId) {
        await prisma.coupon.update({
          where: { id: created.id },
          data: {
            stripeCouponId: sync.stripeCouponId,
            stripePromotionCodeId: sync.stripePromotionCodeId,
          },
        });
        stripe = { synced: true };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('coupon created but not mirrored on Stripe', {
        couponId: created.id,
        code,
        message,
      });
      stripe = { synced: false, error: message };
    }

    return NextResponse.json(
      { coupon: created, stripe },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
