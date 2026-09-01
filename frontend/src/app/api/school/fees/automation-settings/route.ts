// GET/PATCH /api/school/fees/automation-settings — backs Payment
// Configuration's 2 global toggles + currency, and Relances Impayés' 4
// reminder-rule toggles. One row per school, created on first read.
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

async function resolveOrCreate(schoolId: string) {
  return prisma.feeAutomationSettings.upsert({
    where: { schoolId },
    create: { schoolId },
    update: {},
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'paiements', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const settings = await resolveOrCreate(mySchool.schoolId);
    return NextResponse.json({ settings }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

const Body = z
  .object({
    lateFeeEnabled: z.boolean(),
    autoRemindersEnabled: z.boolean(),
    reminderBefore5Days: z.boolean(),
    reminderOnDueDate: z.boolean(),
    reminderWeeklyOverdue: z.boolean(),
    reminderCriticalOverdue: z.boolean(),
    currency: z.string().trim().min(1).max(10),
    whatsappRemindersEnabled: z.boolean(),
  })
  .partial();

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'paiements', 'edit', ctx.requestId);
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

    await resolveOrCreate(mySchool.schoolId);
    // Conditional spread (not `data: parsed.data`) — zod's .partial() types
    // each optional field as `T | undefined`, but Prisma's UpdateInput (with
    // exactOptionalPropertyTypes) requires present keys to be exactly `T`.
    const { data } = parsed;
    const settings = await prisma.feeAutomationSettings.update({
      where: { schoolId: mySchool.schoolId },
      data: {
        ...(data.lateFeeEnabled !== undefined && { lateFeeEnabled: data.lateFeeEnabled }),
        ...(data.autoRemindersEnabled !== undefined && {
          autoRemindersEnabled: data.autoRemindersEnabled,
        }),
        ...(data.reminderBefore5Days !== undefined && {
          reminderBefore5Days: data.reminderBefore5Days,
        }),
        ...(data.reminderOnDueDate !== undefined && { reminderOnDueDate: data.reminderOnDueDate }),
        ...(data.reminderWeeklyOverdue !== undefined && {
          reminderWeeklyOverdue: data.reminderWeeklyOverdue,
        }),
        ...(data.reminderCriticalOverdue !== undefined && {
          reminderCriticalOverdue: data.reminderCriticalOverdue,
        }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.whatsappRemindersEnabled !== undefined && {
          whatsappRemindersEnabled: data.whatsappRemindersEnabled,
        }),
      },
    });

    return NextResponse.json({ settings }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
