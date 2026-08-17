// GET /api/school/fees/overdue — Relances Impayés read model: one row per
// (student, overdue tranche) — a student with 2 overdue tranches appears
// twice, matching Banani's own per-tranche row shape. Built on the same
// shared ledger as the Fee Management overview so "overdue" never drifts
// between the two screens.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import { getFeeLedgerRows } from '@/lib/server/fees/rows';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PAGE_SIZE = 15;
const CRITICAL_DAYS = 30;
const RECENT_DAYS = 14;

function severityOf(days: number): 'CRITICAL' | 'OVERDUE' | 'RECENT' {
  if (days > CRITICAL_DAYS) return 'CRITICAL';
  if (days <= RECENT_DAYS) return 'RECENT';
  return 'OVERDUE';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rows = await getFeeLedgerRows(mySchool.schoolId);
    const overdueRows = rows.filter((r) => r.status === 'OVERDUE');

    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const classId = req.nextUrl.searchParams.get('classId');
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1') || 1);

    let filtered = overdueRows;
    if (search) {
      filtered = filtered.filter(
        (r) =>
          `${r.studentFirstName} ${r.studentLastName}`.toLowerCase().includes(search) ||
          r.studentNumber.toLowerCase().includes(search),
      );
    }
    if (classId) filtered = filtered.filter((r) => r.classId === classId);

    filtered = filtered.slice().sort((a, b) => b.daysOverdue - a.daysOverdue);
    const total = filtered.length;
    const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => ({
      studentId: r.studentId,
      firstName: r.studentFirstName,
      lastName: r.studentLastName,
      studentNumber: r.studentNumber,
      classId: r.classId,
      className: r.className,
      trancheId: r.trancheId,
      trancheLabel: r.trancheLabel,
      amountDue: r.trancheAmount - r.paidAmount,
      daysOverdue: r.daysOverdue,
      severity: severityOf(r.daysOverdue),
      lastReminderAt: r.lastReminderAt,
      disputed: r.disputedAt != null,
    }));

    const totalUnpaid = overdueRows.reduce((sum, r) => sum + (r.trancheAmount - r.paidAmount), 0);
    const criticalCount = overdueRows.filter(
      (r) => severityOf(r.daysOverdue) === 'CRITICAL',
    ).length;
    const uniqueOverdueStudents = new Set(overdueRows.map((r) => r.studentId)).size;

    const remindersSentThisMonth = await prisma.feeReminderLog.count({
      where: {
        student: { schoolId: mySchool.schoolId },
        sentAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    });

    const nextDue = overdueRows
      .slice()
      .sort((a, b) => a.trancheDueDate.getTime() - b.trancheDueDate.getTime())[0];

    const byClass = new Map<string, number>();
    for (const r of overdueRows) byClass.set(r.className, (byClass.get(r.className) ?? 0) + 1);
    const breakdown = Array.from(byClass.entries())
      .map(([className, count]) => ({ className, count }))
      .sort((a, b) => b.count - a.count);

    const classes = await prisma.class.findMany({
      where: { feeStructure: { schoolId: mySchool.schoolId } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(
      {
        rows: pageRows,
        total,
        page,
        pageSize: PAGE_SIZE,
        classes,
        breakdown,
        kpis: {
          totalUnpaid,
          overdueStudentCount: uniqueOverdueStudents,
          criticalCount,
          remindersSentThisMonth,
          nextDue: nextDue
            ? {
                trancheLabel: nextDue.trancheLabel,
                dueDate: nextDue.trancheDueDate,
                amount: totalUnpaid,
              }
            : null,
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
