// GET — one class's FeeStructure + tranches for the Payment Configuration
// editor panel (null fields when not yet configured — the editor shows an
// empty-state prompt instead).
// PUT — whole-tranche-list replace. The Tranche Builder UI edits the full
// set client-side and sends everything back on "Enregistrer la
// configuration" rather than incremental per-tranche PATCHes, so the route
// mirrors that: delete-and-recreate tranches inside one transaction.
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

async function loadClassForSchool(classId: string, schoolId: string) {
  return prisma.class.findFirst({
    where: { id: classId, schoolId },
    include: { feeStructure: { include: { tranches: { orderBy: { order: 'asc' } } } } },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'paiements', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { classId } = await params;
    const klass = await loadClassForSchool(classId, mySchool.schoolId);
    if (!klass) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Class not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        class: { id: klass.id, name: klass.name },
        feeStructure: klass.feeStructure,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const TrancheInput = z.object({
  order: z.number().int().min(1),
  label: z.string().trim().min(1).max(80),
  amount: z.number().int().min(0),
  dueDate: z.coerce.date(),
  latePenaltyPercent: z.number().int().min(0).max(100).nullable().optional(),
  latePenaltyGraceDays: z.number().int().min(0).max(90).nullable().optional(),
});

const Body = z.object({
  totalAmount: z.number().int().min(0),
  registrationFee: z.number().int().min(0).default(0),
  tranches: z.array(TrancheInput).min(1),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
): Promise<NextResponse> {
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

    const { classId } = await params;
    const klass = await prisma.class.findFirst({
      where: { id: classId, schoolId: mySchool.schoolId },
    });
    if (!klass) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Class not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const orders = parsed.data.tranches.map((t) => t.order);
    if (new Set(orders).size !== orders.length) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Tranche order values must be unique' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const structure = await tx.feeStructure.upsert({
        where: { classId },
        create: {
          schoolId: mySchool.schoolId,
          classId,
          totalAmount: parsed.data.totalAmount,
          registrationFee: parsed.data.registrationFee,
        },
        update: {
          totalAmount: parsed.data.totalAmount,
          registrationFee: parsed.data.registrationFee,
        },
      });

      // Upsert by (feeStructureId, order) — never delete-and-recreate,
      // since that would CASCADE DELETE any FeePayment/FeeDispute/
      // FeeReminderLog already tied to a tranche's id, silently destroying
      // payment history whenever a school just tweaks a due date.
      const existing = await tx.feeTranche.findMany({ where: { feeStructureId: structure.id } });
      const incomingOrders = new Set(parsed.data.tranches.map((t) => t.order));
      const removed = existing.filter((t) => !incomingOrders.has(t.order));

      if (removed.length > 0) {
        const removedIds = removed.map((t) => t.id);
        const paymentCount = await tx.feePayment.count({
          where: { feeTrancheId: { in: removedIds } },
        });
        if (paymentCount > 0) {
          return { error: 'TRANCHE_HAS_PAYMENTS' as const };
        }
        await tx.feeTranche.deleteMany({ where: { id: { in: removedIds } } });
      }

      for (const t of parsed.data.tranches) {
        await tx.feeTranche.upsert({
          where: { feeStructureId_order: { feeStructureId: structure.id, order: t.order } },
          create: {
            feeStructureId: structure.id,
            order: t.order,
            label: t.label,
            amount: t.amount,
            dueDate: t.dueDate,
            latePenaltyPercent: t.latePenaltyPercent ?? null,
            latePenaltyGraceDays: t.latePenaltyGraceDays ?? null,
          },
          update: {
            label: t.label,
            amount: t.amount,
            dueDate: t.dueDate,
            latePenaltyPercent: t.latePenaltyPercent ?? null,
            latePenaltyGraceDays: t.latePenaltyGraceDays ?? null,
          },
        });
      }

      const feeStructure = await tx.feeStructure.findUniqueOrThrow({
        where: { id: structure.id },
        include: { tranches: { orderBy: { order: 'asc' } } },
      });
      return { feeStructure };
    });

    if ('error' in result) {
      return NextResponse.json(
        {
          error: result.error,
          message: 'Cannot remove a tranche that already has recorded payments.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { feeStructure: result.feeStructure },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
