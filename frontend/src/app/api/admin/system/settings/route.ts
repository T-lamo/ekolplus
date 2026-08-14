// GET/PUT/DELETE /api/admin/system/settings — System Settings screen
// (Banani wYzeYOvmfsoL). Plan: .planning/banani/system-settings.md, scope =
// Q3 decision: identity/plan-pricing/trial/notification switches are real
// (DB singleton), Stripe status is env presence only (never the values),
// security/backups are honest read-only. GET is ADMIN-readable; PUT/DELETE
// are SUPERADMIN-only. DELETE resets the singleton to schema defaults —
// plan prices are deliberately untouched.
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
import pkg from '../../../../../../package.json';

const SETTINGS_ID = 'singleton';

const DEFAULTS = {
  platformName: 'Schoolgesti',
  domain: null as string | null,
  supportEmail: null as string | null,
  timezone: 'America/Port-au-Prince',
  locale: 'fr',
  logoUrl: null as string | null,
  trialDays: 14,
  notifyNewSubscription: true,
  notifyFailedPayment: true,
  weeklyReport: false,
  expiryReminders: true,
};

function stripeStatus(): { configured: boolean; mode: 'live' | 'test' | null } {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) return { configured: false, mode: null };
  return { configured: true, mode: key.startsWith('sk_live_') ? 'live' : 'test' };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const [row, plans, primaryAdmin] = await Promise.all([
      prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } }),
      prisma.subscriptionPlan.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: { key: true, name: true, pricePerStudentCents: true, currency: true },
      }),
      prisma.user.findFirst({
        where: { role: 'SUPERADMIN' },
        orderBy: { createdAt: 'asc' },
        select: { email: true },
      }),
    ]);

    const s = row ?? DEFAULTS;

    return NextResponse.json(
      {
        settings: {
          platformName: s.platformName,
          domain: s.domain,
          supportEmail: s.supportEmail,
          timezone: s.timezone,
          locale: s.locale,
          logoUrl: s.logoUrl,
          trialDays: s.trialDays,
          notifyNewSubscription: s.notifyNewSubscription,
          notifyFailedPayment: s.notifyFailedPayment,
          weeklyReport: s.weeklyReport,
          expiryReminders: s.expiryReminders,
        },
        plans,
        stripe: stripeStatus(),
        version: pkg.version,
        primaryAdminEmail: primaryAdmin?.email ?? null,
        isSuperadmin: auth.admin.role === 'SUPERADMIN',
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const PutBody = z.object({
  platformName: z.string().trim().min(1).max(100),
  domain: z.string().trim().max(200).nullable(),
  supportEmail: z.string().trim().email().max(200).nullable(),
  timezone: z.string().trim().min(1).max(60),
  locale: z.string().trim().min(2).max(10),
  logoUrl: z.string().trim().url().max(500).nullable(),
  trialDays: z.number().int().min(0).max(365),
  notifyNewSubscription: z.boolean(),
  notifyFailedPayment: z.boolean(),
  weeklyReport: z.boolean(),
  expiryReminders: z.boolean(),
  planPrices: z
    .array(
      z.object({
        key: z.string().min(1),
        pricePerStudentCents: z.number().int().positive().max(1_000_000),
      }),
    )
    .max(10)
    .optional(),
});

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = PutBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { planPrices, ...settings } = parsed.data;

    if (planPrices && planPrices.length > 0) {
      const keys = planPrices.map((p) => p.key);
      const found = await prisma.subscriptionPlan.count({ where: { key: { in: keys } } });
      if (found !== new Set(keys).size) {
        return NextResponse.json(
          { error: 'PLAN_NOT_FOUND', message: 'Unknown plan key' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.platformSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, ...settings },
        update: settings,
      });
      for (const p of planPrices ?? []) {
        await tx.subscriptionPlan.update({
          where: { key: p.key },
          data: { pricePerStudentCents: p.pricePerStudentCents },
        });
      }
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'system.settings_update',
        targetType: 'PlatformSettings',
        targetId: SETTINGS_ID,
        metadata: {
          fields: Object.keys(settings),
          ...(planPrices && planPrices.length > 0 ? { planPrices } : {}),
        },
      });
      return row;
    });

    return NextResponse.json({ settings: updated }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    await prisma.$transaction(async (tx) => {
      await tx.platformSettings.deleteMany({ where: { id: SETTINGS_ID } });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'system.settings_reset',
        targetType: 'PlatformSettings',
        targetId: SETTINGS_ID,
        metadata: {},
      });
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
