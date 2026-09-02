'use client';

// Accueil de l'Espace Élève — the student's own dashboard: current-term
// KPIs (moyenne, présence, absences, rang), today's courses, the week at a
// glance and the latest published grades, all from the single
// /api/student/me aggregate. Same building blocks as the teacher home
// (KpiCard, compact Cards, subject visuals) so the two portals read as one
// product. The « Voir l'emploi du temps » link and the quick-access cards
// to the Scolarité screens are added by Plans 2 and 3 with those screens.
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart2, CalendarCheck, CalendarX2, Trophy } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { LOCALE_BCP47, type LocaleKey } from '@/lib/locales';
import { getSubjectVisual } from '@/lib/subject-visuals';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { KpiCard } from '@/app/(school)/dashboard/KpiRow';
import { formatOrdinal } from '@/app/(school)/eleves/ordinal';
import {
  todayDay,
  weekDays,
  formatDayName,
  isoWeekday,
  minutesToHHMM,
} from '@/components/school/timetable/timetable-utils';
import type { StudentMeResponse } from './types';

function fmtNumber(n: number | null, bcp47: string): string {
  return n == null
    ? '—'
    : n.toLocaleString(bcp47, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtShortDate(iso: string, bcp47: string): string {
  return new Date(iso).toLocaleDateString(bcp47, { day: 'numeric', month: 'short' });
}

export default function EspaceElevePage() {
  const t = useTranslations('ElevePortal');
  const tOrdinal = useTranslations('Eleves.ordinal');
  const locale = useLocale() as LocaleKey;
  const bcp47 = LOCALE_BCP47[locale];
  const { data, loading, error } = useApi<StudentMeResponse>('/api/student/me');
  const today = todayDay();

  const todaysSessions = useMemo(
    () => (data?.thisWeekSessions ?? []).filter((s) => s.date === today),
    [data, today],
  );

  const weekByDay = useMemo(() => {
    const sessions = data?.thisWeekSessions ?? [];
    const withSaturday = sessions.some((s) => isoWeekday(s.date) === 6);
    const days = weekDays(today, withSaturday);
    const map = new Map<string, number>(days.map((d) => [d, 0]));
    for (const s of sessions) {
      if (map.has(s.date)) map.set(s.date, (map.get(s.date) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [data, today]);

  const currentTermLabel =
    data?.terms.find((term) => term.id === data.currentTermId)?.label ?? null;
  const termSub = currentTermLabel ? { sub: currentTermLabel } : {};

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        {data && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('welcome', { name: data.student.firstName })}
            {' · '}
            {data.class
              ? t('home.subtitle', {
                  className: data.class.name,
                  yearLabel: data.academicYear?.label ?? '',
                })
              : t('home.noClass')}
          </p>
        )}
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] w-full" />
            ))}
          </div>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error || !data ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {t('loadError')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <KpiCard
              icon={BarChart2}
              iconBg="bg-secondary"
              iconFg="text-primary"
              value={fmtNumber(data.summary.overallAverage, bcp47)}
              label={t('home.stats.overallAverage')}
              {...termSub}
            />
            <KpiCard
              icon={CalendarCheck}
              iconBg="bg-success"
              iconFg="text-success-foreground"
              value={
                data.summary.attendanceRatePercent != null
                  ? `${data.summary.attendanceRatePercent}%`
                  : '—'
              }
              label={t('home.stats.attendanceRate')}
              {...termSub}
            />
            <KpiCard
              icon={CalendarX2}
              iconBg="bg-warning"
              iconFg="text-warning-foreground"
              value={String(data.summary.absences)}
              label={t('home.stats.absences')}
              {...termSub}
            />
            <KpiCard
              icon={Trophy}
              iconBg="bg-secondary"
              iconFg="text-primary"
              value={
                data.summary.rank != null
                  ? t('home.stats.rankOf', {
                      rank: formatOrdinal(data.summary.rank, bcp47, tOrdinal),
                      count: data.summary.rankedCount,
                    })
                  : '—'
              }
              label={t('home.stats.rank')}
              {...termSub}
            />
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('home.today')}</h2>
            {todaysSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.noCoursesToday')}</p>
            ) : (
              <Card className="divide-y divide-border p-0">
                {todaysSessions.map((s) => {
                  const visual = getSubjectVisual(s.subject.name, {
                    icon: s.subject.icon,
                    color: s.subject.color,
                  });
                  const meta = [s.teacher?.name ?? null, s.room].filter((v): v is string => !!v);
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="w-24 shrink-0 text-xs font-semibold text-primary">
                        {minutesToHHMM(s.startMinutes)}-{minutesToHHMM(s.endMinutes)}
                      </span>
                      <visual.Icon
                        size={15}
                        className="shrink-0"
                        style={{ color: visual.iconFg }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {s.subject.name}
                      </span>
                      {meta.length > 0 && (
                        <span className="shrink-0 truncate text-xs text-muted-foreground">
                          {meta.join(' · ')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </Card>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('home.thisWeek')}</h2>
            {data.thisWeekSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.noSessions')}</p>
            ) : (
              <div
                className={`grid grid-cols-2 gap-2.5 ${
                  weekByDay.length === 6 ? 'sm:grid-cols-6' : 'sm:grid-cols-5'
                }`}
              >
                {weekByDay.map(([day, count]) => (
                  <Card
                    key={day}
                    className={`gap-0.5 p-3 ${day === today ? 'border-primary' : ''}`}
                  >
                    <span className="text-xs font-semibold text-foreground capitalize">
                      {formatDayName(day, locale)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('home.sessionsCount', { count })}
                    </span>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('home.recentGrades')}</h2>
            {data.recentGrades.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.noRecentGrades')}</p>
            ) : (
              <Card className="divide-y divide-border p-0">
                {data.recentGrades.map((g) => {
                  const visual = getSubjectVisual(g.subjectName, {
                    icon: g.subjectIcon,
                    color: g.subjectColor,
                  });
                  return (
                    <div key={g.evaluationId} className="flex items-center gap-3 px-3.5 py-2.5">
                      <visual.Icon
                        size={15}
                        className="shrink-0"
                        style={{ color: visual.iconFg }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {g.subjectName}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {g.label}
                          {g.date ? ` · ${fmtShortDate(g.date, bcp47)}` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-sm bg-secondary px-2 py-0.5 text-xs font-bold text-primary">
                        {g.absent
                          ? t('home.absent')
                          : g.score != null
                            ? `${fmtNumber(g.score, bcp47)} / ${g.maxScore}`
                            : '—'}
                      </span>
                    </div>
                  );
                })}
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
