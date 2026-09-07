// School Dashboard read model — one function hydrates the whole page (same
// "one GET, one heavy aggregation" precedent as admin/stats/detailed and
// fees/rows.ts). School-wide (all classes/students), distinct from
// grades.ts/attendance.ts which stay scoped to per-student/per-class so
// their existing contracts don't blur. See .planning/banani/school-dashboard.md.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { weightedAverage, resolveCurrentTerm } from '@/lib/server/grades';
import { attendanceRate, mondayOf, addDays, dateOnlyUTC } from '@/lib/server/attendance';
import { getFeeLedgerRows } from '@/lib/server/fees/rows';
import { NUMERIC_SUBJECT_FILTER } from '@/lib/server/qualitative';
import { queryActivityEvents } from '@/lib/server/activity-log';

export interface DashboardData {
  academicYear: { id: string; label: string } | null;
  kpis: {
    studentsCount: number;
    studentsDeltaThisMonth: number;
    teachersCount: number;
    classesCount: number;
    subjectsCount: number;
    attendanceRateThisWeek: number | null;
    attendanceRateDeltaVsLastWeek: number | null;
  };
  averagesTrend: { month: string; average: number | null }[];
  levelDistribution: { level: string; count: number }[];
  fees: {
    collectedPercent: number;
    overdueStudentPercent: number;
    overdueStudentCount: number;
    nextTranche: { label: string; dueDate: string; studentsConcerned: number } | null;
    daysUntilNextTranche: number | null;
    tranchesElapsed: number;
    tranchesTotal: number;
  };
  attendanceByClass: { classId: string; className: string; ratePercent: number | null }[];
  subjectPerformance: { subjectId: string; name: string; average: number | null }[];
  todos: {
    evaluationsToGrade: number;
    evaluationsOverdue: number;
    unjustifiedAbsencesThisWeek: number;
    teachersWithoutClass: number;
    overduePayments: number;
  };
  recentActivity: {
    type: 'grade' | 'absence' | 'payment' | 'enrollment';
    text: string;
    at: string;
  }[];
}

const MONTH_LABELS_FR = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Jun',
  'Jul',
  'Aoû',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
];

const EMPTY: DashboardData = {
  academicYear: null,
  kpis: {
    studentsCount: 0,
    studentsDeltaThisMonth: 0,
    teachersCount: 0,
    classesCount: 0,
    subjectsCount: 0,
    attendanceRateThisWeek: null,
    attendanceRateDeltaVsLastWeek: null,
  },
  averagesTrend: [],
  levelDistribution: [],
  fees: {
    collectedPercent: 0,
    overdueStudentPercent: 0,
    overdueStudentCount: 0,
    nextTranche: null,
    daysUntilNextTranche: null,
    tranchesElapsed: 0,
    tranchesTotal: 0,
  },
  attendanceByClass: [],
  subjectPerformance: [],
  todos: {
    evaluationsToGrade: 0,
    evaluationsOverdue: 0,
    unjustifiedAbsencesThisWeek: 0,
    teachersWithoutClass: 0,
    overduePayments: 0,
  },
  recentActivity: [],
};

export async function getSchoolDashboard(schoolId: string): Promise<DashboardData> {
  const year = await prisma.academicYear.findFirst({
    where: { schoolId, isActive: true },
    orderBy: { startDate: 'desc' },
  });
  if (!year) return EMPTY;

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Every query below depends only on `schoolId`/`year.id` (nothing on each
  // other's results) — one wide Promise.all instead of chained sequential
  // awaits. This dashboard fans out to ~10 queries no matter what; on this
  // Neon instance's observed multi-second per-round-trip latency, running
  // them as separate `await` hops compounds into a multi-tens-of-seconds
  // page load. Running them concurrently is the whole difference.
  const [
    classes,
    teachersCount,
    subjectsCount,
    enrollments,
    teachersWithoutClass,
    evaluations,
    terms,
    draftEvaluations,
    feeRows,
    recentActivity,
  ] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId, academicYearId: year.id },
      select: { id: true, name: true, level: true },
      orderBy: { name: 'asc' },
    }),
    prisma.teacher.count({ where: { schoolId, isActive: true } }),
    // Drafts are still being configured — only published subjects count.
    prisma.subject.count({ where: { schoolId, status: 'ACTIVE' } }),
    prisma.enrollment.findMany({
      where: { academicYearId: year.id },
      select: { studentId: true, classId: true, enrolledAt: true },
    }),
    prisma.teacher.count({
      where: {
        schoolId,
        isActive: true,
        classSubjects: { none: { class: { academicYearId: year.id } } },
      },
    }),
    prisma.evaluation.findMany({
      where: {
        status: 'PUBLISHED',
        countsTowardAverage: true,
        classSubject: { class: { schoolId, academicYearId: year.id }, ...NUMERIC_SUBJECT_FILTER },
      },
      select: {
        date: true,
        createdAt: true,
        coefficient: true,
        maxScore: true,
        termId: true,
        classSubject: { select: { subjectId: true, subject: { select: { name: true } } } },
        grades: { select: { score: true, absent: true } },
      },
    }),
    prisma.term.findMany({ where: { academicYearId: year.id } }),
    prisma.evaluation.findMany({
      where: { status: 'DRAFT', classSubject: { class: { schoolId, academicYearId: year.id } } },
      select: { term: { select: { endDate: true } } },
    }),
    getFeeLedgerRows(schoolId),
    getRecentActivity(schoolId, year.id),
  ]);

  const studentIds = enrollments.map((e) => e.studentId);
  const studentsDeltaThisMonth = enrollments.filter((e) => e.enrolledAt >= startOfMonth).length;

  const thisMonday = mondayOf(now);
  const lastMonday = addDays(thisMonday, -7);
  const nextMonday = addDays(thisMonday, 7);

  // Second wave: depends on `studentIds`/`classes` from the batch above,
  // but its members are independent of each other — still one Promise.all.
  const [attendanceThisWeek, attendanceLastWeek, attendanceByClass] = await Promise.all([
    studentIds.length === 0
      ? []
      : prisma.attendance.findMany({
          where: { studentId: { in: studentIds }, date: { gte: thisMonday, lt: nextMonday } },
          select: { status: true, justification: true },
        }),
    studentIds.length === 0
      ? []
      : prisma.attendance.findMany({
          where: { studentId: { in: studentIds }, date: { gte: lastMonday, lt: thisMonday } },
          select: { status: true },
        }),
    Promise.all(
      classes.map(async (c) => {
        const ids = enrollments.filter((e) => e.classId === c.id).map((e) => e.studentId);
        if (ids.length === 0) return { classId: c.id, className: c.name, ratePercent: null };
        const rows = await prisma.attendance.findMany({
          where: { studentId: { in: ids }, date: { gte: startOfMonth } },
          select: { status: true },
        });
        return { classId: c.id, className: c.name, ratePercent: attendanceRate(rows) };
      }),
    ),
  ]);

  const rateThisWeek = attendanceRate(attendanceThisWeek);
  const rateLastWeek = attendanceRate(attendanceLastWeek);
  const attendanceRateDeltaVsLastWeek =
    rateThisWeek != null && rateLastWeek != null ? rateThisWeek - rateLastWeek : null;
  const unjustifiedAbsencesThisWeek = attendanceThisWeek.filter(
    (r) => r.status === 'ABSENT' && !r.justification,
  ).length;

  // Level distribution: group active-year classes by their free-text
  // `level`, sum current enrollments per class.
  const enrollmentCountByClass = new Map<string, number>();
  for (const e of enrollments) {
    enrollmentCountByClass.set(e.classId, (enrollmentCountByClass.get(e.classId) ?? 0) + 1);
  }
  const countByLevel = new Map<string, number>();
  for (const c of classes) {
    const count = enrollmentCountByClass.get(c.id) ?? 0;
    countByLevel.set(c.level, (countByLevel.get(c.level) ?? 0) + count);
  }
  const levelDistribution = [...countByLevel.entries()]
    .filter(([, count]) => count > 0)
    .map(([level, count]) => ({ level, count }));

  const currentTerm = resolveCurrentTerm(terms);
  const termsById = new Map(terms.map((t) => [t.id, t]));

  // Monthly trend: pool every valid grade row school-wide, weighted by its
  // evaluation's coefficient, bucketed by the evaluation's own month — Sep
  // (year start) through the current month. `Evaluation.date` is optional
  // (a teacher may never set it); falling back to `createdAt` would bucket
  // by "when the DB row was inserted" — meaningless for a real evaluation
  // entered well after the fact, and wrong even for a synchronous entry
  // whose Term is now in the past. Falling back to the evaluation's own
  // Term.startDate instead always keeps the bucket inside the academic
  // year's real calendar.
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  const gradesByMonth = new Map<string, { value: number; weight: number }[]>();
  for (const ev of evaluations) {
    const bucketDate = ev.date ?? termsById.get(ev.termId)?.startDate ?? ev.createdAt;
    const key = monthKey(bucketDate);
    const list = gradesByMonth.get(key) ?? [];
    for (const g of ev.grades) {
      if (g.absent || g.score == null) continue;
      const normalized = ev.maxScore > 0 ? (g.score / ev.maxScore) * 20 : 0;
      list.push({ value: normalized, weight: ev.coefficient });
    }
    gradesByMonth.set(key, list);
  }
  const trendStart = new Date(
    Date.UTC(year.startDate.getUTCFullYear(), year.startDate.getUTCMonth(), 1),
  );
  const trendEnd = dateOnlyUTC(now) < year.endDate ? now : year.endDate;
  const averagesTrend: { month: string; average: number | null }[] = [];
  const cursor = new Date(trendStart);
  while (cursor <= trendEnd && averagesTrend.length < 12) {
    const key = monthKey(cursor);
    averagesTrend.push({
      month: MONTH_LABELS_FR[cursor.getUTCMonth()]!,
      average: weightedAverage(gradesByMonth.get(key) ?? []),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  // Subject performance: same pooling, grouped by subject instead of month,
  // scoped to the current term — matches every other per-subject average in
  // the app (Notes Résultats/Grade Notebook/Appréciations all default to
  // "current term", not the whole year).
  const gradesBySubject = new Map<
    string,
    { name: string; rows: { value: number; weight: number }[] }
  >();
  for (const ev of evaluations) {
    if (!currentTerm || ev.termId !== currentTerm.id) continue;
    const key = ev.classSubject.subjectId;
    const entry = gradesBySubject.get(key) ?? { name: ev.classSubject.subject.name, rows: [] };
    for (const g of ev.grades) {
      if (g.absent || g.score == null) continue;
      const normalized = ev.maxScore > 0 ? (g.score / ev.maxScore) * 20 : 0;
      entry.rows.push({ value: normalized, weight: ev.coefficient });
    }
    gradesBySubject.set(key, entry);
  }
  const subjectPerformance = [...gradesBySubject.entries()]
    .map(([subjectId, { name, rows }]) => ({ subjectId, name, average: weightedAverage(rows) }))
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  // Evaluations still in DRAFT — "à corriger" — and how many are overdue
  // (their term already ended). `draftEvaluations` was fetched in the first
  // Promise.all batch above.
  const evaluationsOverdue = draftEvaluations.filter((e) => e.term.endDate < now).length;

  // Fees — reuses the shared ledger so this can never drift from Fee
  // Management / Relances Impayés' own definitions of "overdue"/"paid".
  // `feeRows` was also fetched in the first batch.
  const feeTotalStudents = new Set(feeRows.map((r) => r.studentId)).size;
  const totalCollected = feeRows.reduce((sum, r) => sum + r.paidAmount, 0);
  const totalExpected = feeRows.reduce((sum, r) => sum + r.trancheAmount, 0);
  const overdueStudentIds = new Set(
    feeRows.filter((r) => r.status === 'OVERDUE').map((r) => r.studentId),
  );
  const upcoming = feeRows
    .filter((r) => r.status === 'UPCOMING' || r.status === 'PARTIAL')
    .slice()
    .sort((a, b) => a.trancheDueDate.getTime() - b.trancheDueDate.getTime())[0];
  const structureIdForTranches = upcoming?.feeStructureId ?? feeRows[0]?.feeStructureId ?? null;
  const structureRows = structureIdForTranches
    ? feeRows.filter((r) => r.feeStructureId === structureIdForTranches)
    : [];
  const trancheIdsInStructure = new Set(structureRows.map((r) => r.trancheId));
  const tranchesTotal = trancheIdsInStructure.size;
  const tranchesElapsed = [...trancheIdsInStructure].filter((id) => {
    const row = structureRows.find((r) => r.trancheId === id)!;
    return row.trancheDueDate <= now;
  }).length;

  return {
    academicYear: { id: year.id, label: year.label },
    kpis: {
      studentsCount: studentIds.length,
      studentsDeltaThisMonth,
      teachersCount,
      classesCount: classes.length,
      subjectsCount,
      attendanceRateThisWeek: rateThisWeek,
      attendanceRateDeltaVsLastWeek,
    },
    averagesTrend,
    levelDistribution,
    fees: {
      collectedPercent: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0,
      overdueStudentPercent:
        feeTotalStudents > 0 ? Math.round((overdueStudentIds.size / feeTotalStudents) * 100) : 0,
      overdueStudentCount: overdueStudentIds.size,
      nextTranche: upcoming
        ? {
            label: upcoming.trancheLabel,
            dueDate: upcoming.trancheDueDate.toISOString(),
            studentsConcerned: feeRows.filter((r) => r.trancheId === upcoming.trancheId).length,
          }
        : null,
      daysUntilNextTranche: upcoming
        ? Math.ceil(
            (dateOnlyUTC(upcoming.trancheDueDate).getTime() - dateOnlyUTC(now).getTime()) /
              86_400_000,
          )
        : null,
      tranchesElapsed,
      tranchesTotal,
    },
    attendanceByClass,
    subjectPerformance,
    todos: {
      evaluationsToGrade: draftEvaluations.length,
      evaluationsOverdue,
      unjustifiedAbsencesThisWeek,
      teachersWithoutClass,
      overduePayments: overdueStudentIds.size,
    },
    recentActivity,
  };
}

async function getRecentActivity(
  schoolId: string,
  academicYearId: string,
): Promise<DashboardData['recentActivity']> {
  const events = await queryActivityEvents(schoolId, academicYearId, { limitPerType: 5 });
  return events.slice(0, 8);
}
