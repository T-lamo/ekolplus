// GET /api/school/fees/overview — Fee Management ("Suivi des paiements")
// read model: one row per student (aggregated across their tranches), the 4
// KPI numbers, the overdue alert banner, and the class list for the filter
// dropdown. Built on the shared per-tranche ledger (lib/server/fees/rows.ts)
// so it can never drift from Relances Impayés' definition of "overdue".
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, resolveActiveAcademicYear } from '@/lib/server/school';
import { getFeeLedgerRows, rowProgress } from '@/lib/server/fees/rows';
import { studentFeeStatus, type StudentFeeStatus } from '@/lib/server/fees';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PAGE_SIZE = 15;

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
    const now = new Date();

    const byStudent = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byStudent.get(row.studentId) ?? [];
      list.push(row);
      byStudent.set(row.studentId, list);
    }

    const students = Array.from(byStudent.entries()).map(([studentId, studentRows]) => {
      const first = studentRows[0]!;
      const tranches = studentRows.map((r) => ({
        id: r.trancheId,
        amount: r.trancheAmount,
        dueDate: r.trancheDueDate,
        latePenaltyPercent: null,
        latePenaltyGraceDays: null,
      }));
      const payments = studentRows.map((r) => ({
        feeTrancheId: r.trancheId,
        amount: r.paidAmount,
      }));
      const totalDue = studentRows.reduce((sum, r) => sum + r.trancheAmount, 0);
      const totalPaid = studentRows.reduce((sum, r) => sum + r.paidAmount, 0);
      const tranchesPaid = studentRows.reduce((sum, r) => sum + rowProgress(r), 0);
      return {
        studentId,
        firstName: first.studentFirstName,
        lastName: first.studentLastName,
        studentNumber: first.studentNumber,
        classId: first.classId,
        className: first.className,
        totalDue,
        totalPaid,
        remaining: totalDue - totalPaid,
        status: studentFeeStatus(tranches, payments, now),
        tranchesPaid,
        tranchesTotal: studentRows.length,
      };
    });

    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const classId = req.nextUrl.searchParams.get('classId');
    const statusParam = req.nextUrl.searchParams.get('status') as StudentFeeStatus | null;
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1') || 1);

    let filtered = students;
    if (search) {
      filtered = filtered.filter(
        (s) =>
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(search) ||
          s.studentNumber.toLowerCase().includes(search),
      );
    }
    if (classId) filtered = filtered.filter((s) => s.classId === classId);
    if (statusParam) filtered = filtered.filter((s) => s.status === statusParam);

    filtered.sort((a, b) =>
      `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
    );
    const total = filtered.length;
    const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    // KPIs computed from the FULL (unfiltered) set — the dashboard numbers
    // shouldn't change just because the table below is being searched/filtered.
    const totalCollected = students.reduce((sum, s) => sum + s.totalPaid, 0);
    const totalExpected = students.reduce((sum, s) => sum + s.totalDue, 0);
    const upToDateCount = students.filter((s) => s.status === 'UP_TO_DATE').length;
    const overdueStudents = students.filter((s) => s.status === 'OVERDUE');
    const overdueAmount = overdueStudents.reduce((sum, s) => sum + s.remaining, 0);

    const upcomingTranches = rows.filter((r) => r.status === 'UPCOMING' || r.status === 'PARTIAL');
    const nextTranche = upcomingTranches
      .slice()
      .sort((a, b) => a.trancheDueDate.getTime() - b.trancheDueDate.getTime())[0];
    const nextTrancheExpected = nextTranche
      ? rows
          .filter((r) => r.trancheId === nextTranche.trancheId)
          .reduce((sum, r) => sum + (r.trancheAmount - r.paidAmount), 0)
      : 0;

    const overdueTranche = rows
      .filter((r) => r.status === 'OVERDUE')
      .slice()
      .sort((a, b) => a.trancheDueDate.getTime() - b.trancheDueDate.getTime())[0];

    // Every class in the active academic year, not just ones with a
    // FeeStructure configured — the filter is navigational (pick a class to
    // narrow the table), so a not-yet-configured class should still be
    // selectable (it honestly renders "Aucun résultat" below) rather than
    // silently vanishing from the dropdown. Same scoping as Configuration's
    // classes list (fees/structures/route.ts).
    const activeYear = await resolveActiveAcademicYear(mySchool.schoolId);
    const classes = activeYear
      ? await prisma.class.findMany({
          where: { schoolId: mySchool.schoolId, academicYearId: activeYear.id },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [];

    return NextResponse.json(
      {
        students: pageRows,
        total,
        page,
        pageSize: PAGE_SIZE,
        classes,
        kpis: {
          totalCollected,
          totalExpected,
          upToDateCount,
          totalStudents: students.length,
          overdueCount: overdueStudents.length,
          overdueAmount,
          nextTranche: nextTranche
            ? {
                label: nextTranche.trancheLabel,
                dueDate: nextTranche.trancheDueDate,
                expectedAmount: nextTrancheExpected,
              }
            : null,
        },
        overdueAlert: overdueTranche
          ? {
              count: overdueStudents.length,
              trancheLabel: overdueTranche.trancheLabel,
              dueDate: overdueTranche.trancheDueDate,
              totalUnpaid: overdueAmount,
            }
          : null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
