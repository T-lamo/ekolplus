'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonStatCards } from '@/components/ui/Skeleton';
import { exportToCsv } from '@/lib/csv-export';
import { DASHBOARD } from '@/lib/constants';
import { ASIDE_GRID } from '@/lib/layout';
import { KpiRow } from './KpiRow';
import { AveragesTrendCard } from './AveragesTrendCard';
import { LevelDistributionCard } from './LevelDistributionCard';
import { FeesSummaryRow } from './FeesSummaryRow';
import { AttendanceByClassCard } from './AttendanceByClassCard';
import { SubjectPerformanceCard } from './SubjectPerformanceCard';
import { TodoListCard } from './TodoListCard';
import { RecentActivityCard } from './RecentActivityCard';
import type { DashboardData } from './types';

export default function DashboardPage() {
  const user = useUser();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<DashboardData>('/api/school/dashboard')
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger le tableau de bord.');
      });
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  function onExport() {
    if (!data) return;
    exportToCsv(
      'tableau-de-bord.csv',
      ['Indicateur', 'Valeur'],
      [
        [DASHBOARD.kpis.students, data.kpis.studentsCount],
        [DASHBOARD.kpis.teachers, data.kpis.teachersCount],
        [DASHBOARD.kpis.classes, data.kpis.classesCount],
        [DASHBOARD.kpis.subjects, data.kpis.subjectsCount],
        [
          DASHBOARD.kpis.attendanceRate,
          data.kpis.attendanceRateThisWeek != null ? `${data.kpis.attendanceRateThisWeek}%` : '—',
        ],
        [DASHBOARD.fees.collected, `${data.fees.collectedPercent}%`],
        [DASHBOARD.fees.overdueStudents, `${data.fees.overdueStudentCount}`],
      ],
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">
            {DASHBOARD.title}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {DASHBOARD.subtitle(user.name ?? user.email)}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {data?.academicYear && (
            <span className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground">
              Année {data.academicYear.label}
            </span>
          )}
          <Button variant="outline" className="w-fit" onClick={onExport} disabled={!data}>
            <Download size={14} />
            {DASHBOARD.export}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="flex flex-col gap-4">
          <SkeletonStatCards count={5} />
          <div className={ASIDE_GRID}>
            <Skeleton className="h-[220px] w-full" />
            <Skeleton className="h-[220px] w-full" />
          </div>
          <Skeleton className="h-[180px] w-full" />
        </div>
      )}

      {data && !data.academicYear && (
        <p className="text-sm text-muted-foreground">{DASHBOARD.emptyYear}</p>
      )}

      {data && data.academicYear && (
        <>
          <KpiRow kpis={data.kpis} />

          <div className={ASIDE_GRID}>
            <AveragesTrendCard yearLabel={data.academicYear.label} data={data.averagesTrend} />
            <LevelDistributionCard levels={data.levelDistribution} />
          </div>

          <FeesSummaryRow fees={data.fees} />

          <div className={ASIDE_GRID}>
            <AttendanceByClassCard classes={data.attendanceByClass} />
            <SubjectPerformanceCard subjects={data.subjectPerformance} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TodoListCard todos={data.todos} />
            <RecentActivityCard activity={data.recentActivity} />
          </div>
        </>
      )}
    </div>
  );
}
