// PATCH /api/admin/schools/[id] — "Modifier les infos" + Suspendre/
// Réactiver from the Écoles clientes row menu (Banani 72UpLW9LHCiI).
// DELETE /api/admin/schools/[id] — "Supprimer l'école": type-to-confirm,
// SUPERADMIN only, deletes the Organization (cascades School → every
// school-scoped model; Organization.ownerId is onDelete: Restrict so the
// owner keeps their User account) — same mechanism as the school-side
// danger zone (DELETE /api/school), audited BEFORE the row disappears.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { confirmNameMatches } from '@/lib/server/school-danger-zone';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  shortName: z.string().trim().max(10).nullable().optional(),
  country: z.string().trim().min(1).max(80).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  phone: zPhone.nullable().optional(),
  officialEmail: zEmail.nullable().optional(),
  officialCode: z.string().trim().max(40).nullable().optional(),
  // Suspendre / Réactiver — flips the school's Subscription, which is what
  // "suspended" means for a SaaS tenant (no separate School.status field).
  subscriptionStatus: z.enum(['SUSPENDED', 'ACTIVE']).optional(),
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

    const school = await prisma.school.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        name: true,
        subscription: { select: { id: true, status: true } },
      },
    });
    if (!school) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'School not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { subscriptionStatus, ...fields } = parsed.data;
    if (subscriptionStatus && !school.subscription) {
      return NextResponse.json(
        { error: 'SUBSCRIPTION_NOT_FOUND', message: 'This school has no subscription to update.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // exactOptionalPropertyTypes: keep only keys explicitly present.
    const data = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.school.update({ where: { id }, data });
        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: 'school.update',
          targetType: 'School',
          targetId: id,
          metadata: { fields: Object.keys(data) },
        });
      }
      if (subscriptionStatus && school.subscription) {
        await tx.subscription.update({
          where: { id: school.subscription.id },
          data: { status: subscriptionStatus },
        });
        await tx.subscriptionStatusChange.create({
          data: {
            subscriptionId: school.subscription.id,
            fromStatus: school.subscription.status,
            toStatus: subscriptionStatus,
          },
        });
        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: 'school.subscription_status',
          targetType: 'Subscription',
          targetId: school.subscription.id,
          metadata: { from: school.subscription.status, to: subscriptionStatus, schoolId: id },
        });
      }
      return tx.school.findUniqueOrThrow({ where: { id } });
    });

    return NextResponse.json({ school: updated }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

const DeleteBody = z.object({ confirmName: z.string().trim().min(1) });

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await params;
    const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const school = await prisma.school.findUnique({
      where: { id },
      select: { id: true, organizationId: true, name: true },
    });
    if (!school) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'School not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!confirmNameMatches(school.name, parsed.data.confirmName)) {
      return NextResponse.json(
        { error: 'CONFIRM_NAME_MISMATCH', message: "Le nom saisi ne correspond pas à l'école." },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(async (tx) => {
      // Log BEFORE deleting — nothing left to reference targetId afterward.
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'school.delete',
        targetType: 'Organization',
        targetId: school.organizationId,
        metadata: { schoolId: school.id, schoolName: school.name, via: 'admin-backoffice' },
      });
      await tx.organization.delete({ where: { id: school.organizationId } });
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
