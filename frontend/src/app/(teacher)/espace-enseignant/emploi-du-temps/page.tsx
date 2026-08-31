'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import {
  addDays,
  formatDayName,
  formatWeekRange,
  mondayOf,
  todayDay,
  weekDays,
} from '@/components/school/timetable/timetable-utils';
import type { LocaleKey } from '@/lib/locales';

interface TimetableResponse {
  sessions: {
    id: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    room: string | null;
    class: { name: string };
    subject: { name: string };
  }[];
}

function minutesToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export default function EspaceEnseignantTimetablePage() {
  const t = useTranslations('TeacherTimetable');
  const tPortal = useTranslations('TeacherPortal');
  const locale = useLocale() as LocaleKey;
  const [anchor, setAnchor] = useState(() => mondayOf(todayDay()));
  const days = weekDays(anchor);
  const { data, loading, error } = useApi<TimetableResponse>(
    `/api/school/timetable?from=${days[0]}&to=${days[days.length - 1]}`,
  );

  const sessionsByDay = new Map<string, TimetableResponse['sessions']>();
  for (const day of days) sessionsByDay.set(day, []);
  for (const s of data?.sessions ?? []) {
    sessionsByDay.get(s.date)?.push(s);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('previousWeek')}
          onClick={() => setAnchor((a) => addDays(a, -7))}
        >
          <ChevronLeft size={18} />
        </Button>
        <span className="text-sm font-medium text-foreground">{formatWeekRange(days, locale)}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('nextWeek')}
          onClick={() => setAnchor((a) => addDays(a, 7))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((day) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {formatDayName(day, locale)}
                {day === todayDay() ? ` · ${t('today')}` : ''}
              </h2>
              {sessionsByDay.get(day)!.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noSessions')}</p>
              ) : (
                sessionsByDay.get(day)!.map((s) => (
                  <Card key={s.id} className="gap-1 p-3.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {minutesToHHMM(s.startMinutes)}-{minutesToHHMM(s.endMinutes)}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {s.subject.name} · {s.class.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.room ? t('room', { room: s.room }) : t('noRoom')}
                    </p>
                  </Card>
                ))
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
