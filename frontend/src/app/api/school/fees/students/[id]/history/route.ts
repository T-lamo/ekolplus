// GET /api/school/fees/students/[id]/history — feeds both the Payment
// Registration modal (student identity, solde dû, per-tranche status for
// the tranche selector) and "Voir l'historique" (the full payment ledger).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { trancheStatus } from '@/lib/server/fees';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'paiements', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const student = await prisma.student.findFirst({
      where: { id, schoolId: mySchool.schoolId },
      select: { id: true, firstName: true, lastName: true, studentNumber: true },
    });
    if (!student) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: id,
        class: { schoolId: mySchool.schoolId, academicYear: { isActive: true } },
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            feeStructure: { include: { tranches: { orderBy: { order: 'asc' } } } },
          },
        },
      },
    });

    const tranches = enrollment?.class.feeStructure?.tranches ?? [];
    const payments = await prisma.feePayment.findMany({
      where: { studentId: id, feeTrancheId: { in: tranches.map((t) => t.id) } },
      orderBy: { paidAt: 'desc' },
      include: { recordedBy: { select: { name: true, email: true } } },
    });

    const now = new Date();
    const trancheRows = tranches.map((t) => {
      const paymentsForTranche = payments.filter((p) => p.feeTrancheId === t.id);
      const paidAmount = paymentsForTranche.reduce((sum, p) => sum + p.amount, 0);
      return {
        id: t.id,
        order: t.order,
        label: t.label,
        amount: t.amount,
        dueDate: t.dueDate,
        latePenaltyPercent: t.latePenaltyPercent,
        latePenaltyGraceDays: t.latePenaltyGraceDays,
        status: trancheStatus(t, paymentsForTranche, now),
        paidAmount,
        remaining: Math.max(t.amount - paidAmount, 0),
        lastPaymentAt: paymentsForTranche[0]?.paidAt ?? null,
      };
    });

    const totalDue = tranches.reduce((sum, t) => sum + t.amount, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    return NextResponse.json(
      {
        student,
        class: enrollment?.class ? { id: enrollment.class.id, name: enrollment.class.name } : null,
        balance: Math.max(totalDue - totalPaid, 0),
        tranches: trancheRows,
        payments: payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          penaltyAmount: p.penaltyAmount,
          method: p.method,
          reference: p.reference,
          notes: p.notes,
          paidAt: p.paidAt,
          feeTrancheId: p.feeTrancheId,
          recordedByName: p.recordedBy.name ?? p.recordedBy.email,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
