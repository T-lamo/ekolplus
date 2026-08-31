'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarDays, School as SchoolIcon, Users } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { KpiCard } from '@/app/(school)/dashboard/KpiRow';
import {
  todayDay,
  weekDays,
  formatDayName,
  isoWeekday,
  minutesToHHMM,
} from '@/components/school/timetable/timetable-utils';
import type { LocaleKey } from '@/lib/locales';
import { getSubjectVisual } from '@/lib/subject-visuals';

interface TeacherMeResponse {
  teacher: { id: string; name: string; email: string | null };
  homeroomClasses: { id: string; name: string; level: string; studentCount: number }[];
  classSubjects: {
    id: string;
    classId: string;
    className: string;
    classLevel: string;
    subjectId: string;
    subjectName: string;
    studentCount: number;
  }[];
  thisWeekSessions: {
    id: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    room: string | null;
    class: { name: string };
    subject: { name: string; icon: string | null; color: string | null };
  }[];
  academicYear: { id: string; label: string } | null;
}

export default function EspaceEnseignantHomePage() {
  const t = useTranslations('TeacherPortal');
  const locale = useLocale() as LocaleKey;
  const user = useUser();
  const { data, loading, error } = useApi<TeacherMeResponse>('/api/teacher/me');
  const today = todayDay();

  const stats = useMemo(() => {
    if (!data) return null;
    const classIds = new Set<string>([
      ...data.homeroomClasses.map((c) => c.id),
      ...data.classSubjects.map((cs) => cs.classId),
    ]);
    const subjectIds = new Set(data.classSubjects.map((cs) => cs.subjectId));
    const students = new Map<string, number>();
    for (const c of data.homeroomClasses) students.set(c.id, c.studentCount);
    for (const cs of data.classSubjects) students.set(cs.classId, cs.studentCount);
    let studentTotal = 0;
    for (const n of students.values()) studentTotal += n;
    return { classes: classIds.size, subjects: subjectIds.size, students: studentTotal };
  }, [data]);

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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('welcome', { name: user?.name ?? user?.email ?? '' })}
        </p>
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] w-full" />
            ))}
          </div>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error || !data || !stats ? (
        <p className="text-sm text-destructive">{t('loadError')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <KpiCard
              icon={SchoolIcon}
              iconBg="bg-secondary"
              iconFg="text-primary"
              value={String(stats.classes)}
              label={t('home.stats.classes')}
            />
            <KpiCard
              icon={BookOpen}
              iconBg="bg-info"
              iconFg="text-info-foreground"
              value={String(stats.subjects)}
              label={t('home.stats.subjects')}
            />
            <KpiCard
              icon={Users}
              iconBg="bg-secondary"
              iconFg="text-primary"
              value={String(stats.students)}
              label={t('home.stats.students')}
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
                        {s.subject.name} · {s.class.name}
                      </span>
                      {s.room && (
                        <span className="shrink-0 text-xs text-muted-foreground">{s.room}</span>
                      )}
                    </div>
                  );
                })}
              </Card>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">{t('home.thisWeek')}</h2>
              <Link
                href="/espace-enseignant/emploi-du-temps"
                className="flex items-center gap-1 text-xs font-semibold text-primary"
              >
                {t('home.viewTimetable')}
                <ArrowRight size={13} />
              </Link>
            </div>
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
            <h2 className="text-sm font-bold text-foreground">{t('home.quickActions')}</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Link href="/espace-enseignant/classes">
                <Card className="flex-row items-center gap-3 p-3.5">
                  <div className="flex h-8.5 w-8.5 items-center justify-center rounded-md bg-secondary text-primary">
                    <SchoolIcon size={16} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {t('home.myClasses')}
                  </span>
                  <ArrowRight size={14} className="ml-auto text-muted-foreground" />
                </Card>
              </Link>
              <Link href="/espace-enseignant/emploi-du-temps">
                <Card className="flex-row items-center gap-3 p-3.5">
                  <div className="flex h-8.5 w-8.5 items-center justify-center rounded-md bg-secondary text-primary">
                    <CalendarDays size={16} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {t('home.viewTimetable')}
                  </span>
                  <ArrowRight size={14} className="ml-auto text-muted-foreground" />
                </Card>
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
