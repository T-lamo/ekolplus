// Client-facing mirror of lib/server/school-dashboard.ts's `DashboardData` —
// kept separate (not imported) because that file is `server-only` and can't
// be pulled into a client bundle. Same shape, JSON-safe (dates as ISO strings).
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
