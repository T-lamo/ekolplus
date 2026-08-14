// Shared read model for Frais & Scolarité — one row per (student, tranche)
// for every student enrolled in the school's active AcademicYear whose
// class has a FeeStructure configured. Fee Management (Suivi des paiements)
// aggregates these by student; Relances Impayés filters to OVERDUE and
// keeps per-tranche granularity. Built once here so both routes can never
// drift on what "overdue" or "paid" means — same precedent as
// lib/server/bulletin-pdf/get-bulletin-view.ts.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { resolveActiveAcademicYear } from '@/lib/server/school';
import { trancheStatus, daysOverdue, type TrancheStatus } from '@/lib/server/fees';

export interface FeeLedgerRow {
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  feeStructureId: string;
  trancheId: string;
  trancheOrder: number;
  trancheLabel: string;
  trancheAmount: number;
  trancheDueDate: Date;
  status: TrancheStatus;
  paidAmount: number;
  daysOverdue: number;
  lastReminderAt: Date | null;
  disputedAt: Date | null;
}

export async function getFeeLedgerRows(schoolId: string): Promise<FeeLedgerRow[]> {
  const year = await resolveActiveAcademicYear(schoolId);
  if (!year) return [];

  const enrollments = await prisma.enrollment.findMany({
    where: { academicYearId: year.id, class: { schoolId } },
    include: {
      student: {
        select: { id: true, firstName: true, lastName: true, studentNumber: true },
      },
      class: {
        select: {
          id: true,
          name: true,
          feeStructure: { include: { tranches: { orderBy: { order: 'asc' } } } },
        },
      },
    },
  });

  const configuredEnrollments = enrollments.filter((e) => e.class.feeStructure != null);
  if (configuredEnrollments.length === 0) return [];

  const studentIds = configuredEnrollments.map((e) => e.studentId);
  const trancheIds = configuredEnrollments.flatMap((e) =>
    e.class.feeStructure!.tranches.map((t) => t.id),
  );

  const [payments, disputes, reminders] = await Promise.all([
    prisma.feePayment.findMany({
      where: { studentId: { in: studentIds }, feeTrancheId: { in: trancheIds } },
      select: { studentId: true, feeTrancheId: true, amount: true },
    }),
    prisma.feeDispute.findMany({
      where: { studentId: { in: studentIds }, feeTrancheId: { in: trancheIds }, resolvedAt: null },
      select: { studentId: true, feeTrancheId: true, openedAt: true },
    }),
    prisma.feeReminderLog.findMany({
      where: { studentId: { in: studentIds }, feeTrancheId: { in: trancheIds } },
      orderBy: { sentAt: 'desc' },
      select: { studentId: true, feeTrancheId: true, sentAt: true },
    }),
  ]);

  const now = new Date();
  const rows: FeeLedgerRow[] = [];

  for (const enrollment of configuredEnrollments) {
    const structure = enrollment.class.feeStructure!;
    for (const tranche of structure.tranches) {
      const paymentsForPair = payments.filter(
        (p) => p.studentId === enrollment.studentId && p.feeTrancheId === tranche.id,
      );
      const dispute = disputes.find(
        (d) => d.studentId === enrollment.studentId && d.feeTrancheId === tranche.id,
      );
      const lastReminder = reminders.find(
        (r) => r.studentId === enrollment.studentId && r.feeTrancheId === tranche.id,
      );
      rows.push({
        studentId: enrollment.studentId,
        studentFirstName: enrollment.student.firstName,
        studentLastName: enrollment.student.lastName,
        studentNumber: enrollment.student.studentNumber,
        classId: enrollment.class.id,
        className: enrollment.class.name,
        feeStructureId: structure.id,
        trancheId: tranche.id,
        trancheOrder: tranche.order,
        trancheLabel: tranche.label,
        trancheAmount: tranche.amount,
        trancheDueDate: tranche.dueDate,
        status: trancheStatus(tranche, paymentsForPair, now),
        paidAmount: paymentsForPair.reduce((sum, p) => sum + p.amount, 0),
        daysOverdue: daysOverdue(tranche, paymentsForPair, now),
        lastReminderAt: lastReminder?.sentAt ?? null,
        disputedAt: dispute?.openedAt ?? null,
      });
    }
  }

  return rows;
}

export function rowProgress(row: FeeLedgerRow): number {
  return row.trancheAmount <= 0 ? 1 : Math.min(row.paidAmount / row.trancheAmount, 1);
}
