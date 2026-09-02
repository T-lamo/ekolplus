'use client';

// Emploi du temps élève — the admin timetable's real views (month / week /
// day / agenda + legend), read-only, on the student's own class only via
// /api/student/timetable (the server scopes on the session's current
// enrollment, so the page carries no id at all). Clone of the teacher page
// minus its teacherId plumbing; `showClass={false}` because every card is
// the same class, so subject + room + teacher is what matters. No
// /api/school/* call: those are deny-by-default for student accounts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  List,
} from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { exportToCsv } from '@/lib/csv-export';
import { cn } from '@/lib/utils';
import { LIST_PAGE } from '@/lib/layout';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { TimetableGrid } from '@/components/school/timetable/TimetableGrid';
import { TimetableAgenda } from '@/components/school/timetable/TimetableAgenda';
import { TimetableMonth } from '@/components/school/timetable/TimetableMonth';
import { TimetableLegend } from '@/components/school/timetable/TimetableLegend';
import type {
  TimetableResponse,
  TimetableSession,
  TimetableView,
} from '@/components/school/timetable/types';
import {
  addDays,
  addMonths,
  csvRows,
  formatLong,
  formatMonthYear,
  formatWeekRange,
  isoWeekday,
  mondayOf,
  monthGrid,
  todayDay,
  weekDays,
} from '@/components/school/timetable/timetable-utils';

const VIEWS: { key: TimetableView; Icon: typeof Calendar }[] = [
  { key: 'month', Icon: Calendar },
  { key: 'week', Icon: CalendarDays },
  { key: 'day', Icon: CalendarClock },
  { key: 'agenda', Icon: List },
];

export default function EleveTimetablePage() {
  const { toast } = useToast();
  const locale = useLocale();
  const t = useTranslations('Timetable.toolbar');
  const tExport = useTranslations('Timetable.export');
  const tPortal = useTranslations('ElevePortal');
  const today = todayDay();
  const [view, setView] = useState<TimetableView>('week');
  const [anchor, setAnchor] = useState(today);
  useEffect(() => {
    if (window.innerWidth < 1024) setView('day');
  }, []);

  const range = useMemo(() => {
    if (view === 'month') {
      const g = monthGrid(anchor);
      return { from: g[0]?.[0] ?? anchor, to: g[5]?.[6] ?? anchor };
    }
    if (view === 'day') return { from: anchor, to: anchor };
    const monday = mondayOf(anchor);
    return { from: monday, to: addDays(monday, 6) };
  }, [view, anchor]);

  const { data, loading, error } = useApi<TimetableResponse>(
    `/api/student/timetable?from=${range.from}&to=${range.to}`,
  );

  const sessions = useMemo<TimetableSession[]>(() => data?.sessions ?? [], [data]);
  const weekWithSaturday = sessions.some((s) => isoWeekday(s.date) === 6);
  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    return weekDays(anchor, weekWithSaturday);
  }, [view, anchor, weekWithSaturday]);

  const navLabel =
    view === 'month'
      ? formatMonthYear(anchor, locale)
      : view === 'day'
        ? formatLong(anchor, locale)
        : formatWeekRange(days, locale);

  const step = useCallback(
    (dir: 1 | -1) => {
      setAnchor((a) =>
        view === 'month' ? addMonths(a, dir) : addDays(a, view === 'day' ? dir : 7 * dir),
      );
    },
    [view],
  );

  function onExport() {
    if (sessions.length === 0) {
      toast(t('exportEmpty'), 'info');
      return;
    }
    const headers = [
      tExport('date'),
      tExport('day'),
      tExport('start'),
      tExport('end'),
      tExport('class'),
      tExport('subject'),
      tExport('type'),
      tExport('teacher'),
      tExport('room'),
      tExport('description'),
    ];
    exportToCsv(
      `emploi-du-temps-${range.from}_${range.to}.csv`,
      headers,
      csvRows(sessions, locale),
    );
  }

  return (
    <div className={LIST_PAGE}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">
            {tPortal('timetable.title')}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t(`views.${view}.subtitle`)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label={t('viewsAriaLabel')}
            className="flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-muted p-[3px]"
          >
            {VIEWS.map(({ key, Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={cn(
                  'inline-flex items-center gap-[5px] rounded-sm px-3 py-[5px] text-xs whitespace-nowrap transition-colors',
                  view === key
                    ? 'bg-card font-semibold text-foreground'
                    : 'font-medium text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={12} aria-hidden />
                {t(`views.${key}.label`)}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="w-fit" onClick={onExport}>
            <FileSpreadsheet size={13} />
            {t('export')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive-foreground">
          {tPortal('loadError')}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={t('prevPeriod')}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-caption font-semibold whitespace-nowrap text-foreground">
          {navLabel}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={t('nextPeriod')}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted"
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          onClick={() => setAnchor(today)}
          className={cn(
            'rounded-xl px-2.5 py-[3px] text-xs font-medium transition-colors',
            anchor === today ||
              (view !== 'day' && view !== 'month' && mondayOf(anchor) === mondayOf(today)) ||
              (view === 'month' && anchor.slice(0, 7) === today.slice(0, 7))
              ? 'bg-secondary text-primary'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {t('today')}
        </button>
      </div>

      {!data ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex gap-px border-b border-border bg-muted">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11 flex-1 rounded-none bg-card/60" />
            ))}
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-1.5 border-b border-border p-1.5 last:border-b-0">
              <Skeleton className="h-16 w-12" />
              {Array.from({ length: 5 }, (_, j) => (
                <Skeleton key={j} className="h-16 flex-1" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          className={cn('flex flex-col transition-opacity', loading && 'opacity-60')}
          aria-busy={loading}
        >
          {view === 'agenda' ? (
            <TimetableAgenda days={days} sessions={sessions} today={today} />
          ) : view === 'month' ? (
            <TimetableMonth
              anchor={anchor}
              sessions={sessions}
              today={today}
              onDayClick={(day) => {
                setAnchor(day);
                setView('day');
              }}
            />
          ) : (
            <>
              <TimetableGrid days={days} sessions={sessions} today={today} showClass={false} />
              {sessions.length === 0 && (
                <p className="mt-2 text-center text-xs text-muted-foreground">{t('emptyRange')}</p>
              )}
            </>
          )}
        </div>
      )}

      {data && <TimetableLegend sessions={sessions} />}
    </div>
  );
}
