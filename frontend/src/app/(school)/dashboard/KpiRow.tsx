import { BookOpen, CalendarCheck, School, UserCheck, Users, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DASHBOARD } from '@/lib/constants';
import type { DashboardData } from './types';

const t = DASHBOARD.kpis;

export function KpiRow({ kpis }: { kpis: DashboardData['kpis'] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        icon={Users}
        iconBg="bg-secondary"
        iconFg="text-primary"
        value={String(kpis.studentsCount)}
        label={t.students}
        delta={kpis.studentsDeltaThisMonth > 0 ? `+${kpis.studentsDeltaThisMonth}` : undefined}
        deltaSub={kpis.studentsDeltaThisMonth > 0 ? t.thisMonth : undefined}
      />
      <KpiCard
        icon={UserCheck}
        iconBg="bg-info"
        iconFg="text-info-foreground"
        value={String(kpis.teachersCount)}
        label={t.teachers}
      />
      <KpiCard
        icon={School}
        iconBg="bg-[#e0faf0]"
        iconFg="text-[#059669]"
        value={String(kpis.classesCount)}
        label={t.classes}
      />
      <KpiCard
        icon={BookOpen}
        iconBg="bg-[#fff4e0]"
        iconFg="text-[#d97706]"
        value={String(kpis.subjectsCount)}
        label={t.subjects}
      />
      <KpiCard
        icon={CalendarCheck}
        iconBg="bg-secondary"
        iconFg="text-primary"
        value={kpis.attendanceRateThisWeek != null ? `${kpis.attendanceRateThisWeek}%` : '—'}
        valueTone="text-primary"
        label={t.attendanceRate}
        sub={t.attendanceRateSub}
        delta={
          kpis.attendanceRateDeltaVsLastWeek != null && kpis.attendanceRateDeltaVsLastWeek !== 0
            ? `${kpis.attendanceRateDeltaVsLastWeek > 0 ? '+' : ''}${kpis.attendanceRateDeltaVsLastWeek}%`
            : undefined
        }
        deltaTone={
          kpis.attendanceRateDeltaVsLastWeek != null && kpis.attendanceRateDeltaVsLastWeek < 0
            ? 'destructive'
            : 'success'
        }
      />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  iconBg,
  iconFg,
  value,
  valueTone = 'text-foreground',
  label,
  sub,
  delta,
  deltaSub,
  deltaTone = 'success',
}: {
  icon: LucideIcon;
  iconBg: string;
  iconFg: string;
  value: string;
  valueTone?: string;
  label: string;
  sub?: string;
  delta?: string | undefined;
  deltaSub?: string | undefined;
  deltaTone?: 'success' | 'destructive';
}) {
  return (
    <Card className="gap-1 p-4">
      <div className="mb-1.5 flex items-start justify-between">
        <div
          className={`flex h-8.5 w-8.5 items-center justify-center rounded-md ${iconBg} ${iconFg}`}
        >
          <Icon size={16} />
        </div>
        {delta && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              deltaTone === 'destructive'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-success text-success-foreground'
            }`}
          >
            {delta}
          </span>
        )}
      </div>
      <div className={`text-[28px] leading-tight font-bold ${valueTone}`}>{value}</div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {(sub || deltaSub) && <div className="text-2xs text-muted-foreground">{deltaSub ?? sub}</div>}
    </Card>
  );
}
