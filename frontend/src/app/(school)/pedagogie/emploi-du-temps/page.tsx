'use client';

// Emploi du temps (Banani hmhXX_ZK0yoi — .planning/banani/emploi-du-temps.md):
// header (title + « Année scolaire … — Vue hebdomadaire », view tabs Mois ·
// Semaine · Jour · Agenda, « + Ajouter un cours »), filter bar (week nav +
// Aujourd'hui, Classe / Enseignant / Salle / Matière, Exporter CSV), the
// grid (or agenda / month), the legend. Data: GET /api/school/timetable for
// the visible range; filters apply client-side (a week is ~150 rows at most).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BookOpen,
  Calendar,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  FileSpreadsheet,
  List,
  Plus,
  School,
  UserCheck,
} from 'lucide-react';
import { ApiError } from '@/lib/api';
import { invalidateCachePrefix, useApi } from '@/lib/useApi';
import { usePermissions } from '@/lib/usePermissions';
import { exportToCsv } from '@/lib/csv-export';
import type { RoomRow } from '@/lib/rooms';
import { cn } from '@/lib/utils';
import { LIST_PAGE } from '@/lib/layout';
import { useToast } from '@/contexts/ToastContext';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { Button } from '@/components/ui/Button';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { SelectItem } from '@/components/ui/Select';
import { TimetableFilterSelect } from '@/components/school/timetable/TimetableFilterSelect';
import { TimetableGrid } from '@/components/school/timetable/TimetableGrid';
import { TimetableAgenda } from '@/components/school/timetable/TimetableAgenda';
import { TimetableMonth } from '@/components/school/timetable/TimetableMonth';
import { TimetableLegend } from '@/components/school/timetable/TimetableLegend';
import {
  SessionFormModal,
  type SessionFormInitial,
} from '@/components/school/timetable/SessionFormModal';
import type {
  ClassOption,
  ClassSubjectLink,
  SubjectOption,
  TeacherOption,
  TimetableFilters,
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

// Labels/subtitles live in `timetable.toolbar.views.*` (keyed by `key`) —
// this const can't call a hook, so it carries only the icon and identity.
const VIEWS: { key: TimetableView; Icon: typeof Calendar }[] = [
  { key: 'month', Icon: Calendar },
  { key: 'week', Icon: CalendarDays },
  { key: 'day', Icon: CalendarClock },
  { key: 'agenda', Icon: List },
];

const EMPTY_FILTERS: TimetableFilters = { classId: '', teacherId: '', room: '', subjectId: '' };
// Two per row on a phone, natural width from sm up.
const FILTER_CLASS = 'min-w-0 flex-1 basis-[calc(50%-3px)] sm:flex-none sm:basis-auto';

interface Meta {
  academicYear: { id: string; label: string; startDate: string; endDate: string } | null;
  classes: ClassOption[];
  teachers: TeacherOption[];
  subjects: SubjectOption[];
  links: ClassSubjectLink[];
  /** Catalogue des salles (configuration/salles) — champ « Salle / Lieu » de la modale. */
  rooms: RoomRow[];
}

export default function EmploiDuTempsPage() {
  const { toast } = useToast();
  const locale = useLocale();
  const t = useTranslations('Timetable.toolbar');
  const tExport = useTranslations('Timetable.export');
  const today = todayDay();
  const [view, setView] = useState<TimetableView>('week');
  const [anchor, setAnchor] = useState(today);
  // Week's 5-6 narrow day columns need real horizontal room — on a phone
  // (no `lg` sidebar) default to Day instead so the landing view is usable
  // without constant sideways scrolling. Set in an effect (not the initial
  // state) to keep SSR/client markup identical; Week/Month/Agenda stay one
  // tap away. Runs once, before the switch to a manually-chosen view.
  useEffect(() => {
    if (window.innerWidth < 1024) setView('day');
  }, []);
  const [filters, setFilters] = useState<TimetableFilters>(EMPTY_FILTERS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<SessionFormInitial | null>(null);

  function handleLoadError(err: unknown) {
    setLoadError(err instanceof ApiError ? err.message : t('networkError'));
    return true;
  }

  // Visible range — the whole month grid, the week (Mon–Sun) or the day.
  const range = useMemo(() => {
    if (view === 'month') {
      const g = monthGrid(anchor);
      return { from: g[0]?.[0] ?? anchor, to: g[5]?.[6] ?? anchor };
    }
    if (view === 'day') return { from: anchor, to: anchor };
    const monday = mondayOf(anchor);
    return { from: monday, to: addDays(monday, 6) };
  }, [view, anchor]);

  const { data: schoolData } = useApi<{
    academicYear: { id: string; label: string; startDate: string; endDate: string } | null;
  }>('/api/school', { onError: handleLoadError });
  const { data: classesData } = useApi<{ classes: ClassOption[] }>('/api/school/classes', {
    onError: handleLoadError,
  });
  const { data: teachersData } = useApi<{ teachers: TeacherOption[] }>('/api/school/teachers', {
    onError: handleLoadError,
  });
  const { data: subjectsData } = useApi<{ subjects: SubjectOption[] }>('/api/school/subjects', {
    onError: handleLoadError,
  });
  const { data: linksData } = useApi<{ classSubjects: ClassSubjectLink[] }>(
    '/api/school/class-subjects',
    { onError: handleLoadError },
  );
  const { data: roomCatalogData } = useApi<{ rooms: RoomRow[] }>('/api/school/rooms', {
    onError: handleLoadError,
  });

  const meta: Meta | null = useMemo(() => {
    if (
      !schoolData ||
      !classesData ||
      !teachersData ||
      !subjectsData ||
      !linksData ||
      !roomCatalogData
    )
      return null;
    return {
      academicYear: schoolData.academicYear
        ? {
            id: schoolData.academicYear.id,
            label: schoolData.academicYear.label,
            startDate: schoolData.academicYear.startDate.slice(0, 10),
            endDate: schoolData.academicYear.endDate.slice(0, 10),
          }
        : null,
      classes: classesData.classes.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color ?? null,
        room: c.room ?? null,
        roomId: c.roomId ?? null,
      })),
      teachers: teachersData.teachers.map((teacher) => ({
        id: teacher.id,
        name: teacher.name,
        photoUrl: teacher.photoUrl ?? null,
      })),
      subjects: subjectsData.subjects.map((s) => ({
        id: s.id,
        name: s.name,
        abbreviation: s.abbreviation ?? null,
        color: s.color ?? null,
      })),
      links: linksData.classSubjects.map((l) => ({
        classId: l.classId,
        subjectId: l.subjectId,
        teacherId: l.teacherId ?? null,
        weeklyHours: l.weeklyHours ?? null,
      })),
      rooms: roomCatalogData.rooms,
    };
  }, [schoolData, classesData, teachersData, subjectsData, linksData, roomCatalogData]);

  // Ranges already fetched are cached by useApi itself (keyed by the exact
  // `from`/`to` query string) — switching views or stepping back to a week
  // already seen is instant, and the previous grid stays on screen while a
  // new range loads instead of a skeleton (useApi doesn't clear `data` on a
  // path change with no cache hit, which is exactly the effect wanted here).
  const {
    data,
    loading,
    refresh: refreshTimetable,
  } = useApi<TimetableResponse>(`/api/school/timetable?from=${range.from}&to=${range.to}`, {
    onError: handleLoadError,
  });
  // A prior transient failure must not keep the banner up once every piece
  // needed to render the grid has since loaded successfully (loadError is
  // otherwise a one-way ratchet: onError sets it, nothing ever clears it).
  useEffect(() => {
    if (meta && data) setLoadError(null);
  }, [meta, data]);
  const error = loadError;

  const filtered = useMemo<TimetableSession[]>(() => {
    if (!data) return [];
    return data.sessions.filter(
      (s) =>
        (!filters.classId || s.classId === filters.classId) &&
        (!filters.teacherId || s.teacherId === filters.teacherId) &&
        (!filters.subjectId || s.subjectId === filters.subjectId) &&
        (!filters.room || (s.room ?? '').toLowerCase() === filters.room.toLowerCase()),
    );
  }, [data, filters]);

  const weekWithSaturday = filtered.some((s) => isoWeekday(s.date) === 6);
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

  const { can, canSee } = usePermissions();
  if (!canSee('emploiDuTemps')) return <AccessDenied />;

  const setFilter = (key: keyof TimetableFilters) => (value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));

  function openCreate(day?: string, startMinutes?: number) {
    const base =
      day ??
      (view === 'day'
        ? anchor
        : mondayOf(anchor) <= today && today <= addDays(mondayOf(anchor), 6)
          ? today
          : mondayOf(anchor));
    setModal({
      day: base,
      ...(startMinutes !== undefined ? { startMinutes } : {}),
      ...(filters.classId ? { classId: filters.classId } : {}),
    });
  }

  function onExport() {
    if (filtered.length === 0) {
      toast(t('exportEmpty'), 'info');
      return;
    }
    // Column heads follow the admin's UI language; the filename stays a
    // stable technical slug in every locale (spec decision 5).
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
      csvRows(filtered, locale),
    );
  }

  const subtitleView = t(`views.${view}.subtitle`);
  const noYear = meta !== null && meta.academicYear === null;
  const rooms = data?.rooms ?? [];

  return (
    <div className={LIST_PAGE}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
            <HelpTooltip label={t('help.pageOverview')} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {meta?.academicYear
              ? t('headerWithYear', { label: meta.academicYear.label, view: subtitleView })
              : subtitleView}
          </p>
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
          {can('emploiDuTemps', 'create') && (
            <Button className="w-fit" onClick={() => openCreate()} disabled={noYear}>
              <Plus size={14} />
              {t('addSession')}
            </Button>
          )}
          <HelpTooltip label={t('help.createSession')} />
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
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
        <div className="hidden h-5 w-px bg-border sm:block" aria-hidden />
        <div className="flex min-w-0 basis-full flex-wrap items-center gap-1.5 sm:flex-1 sm:basis-auto">
          <TimetableFilterSelect
            className={FILTER_CLASS}
            icon={<School />}
            ariaLabel={t('filterClass')}
            value={filters.classId}
            onValueChange={setFilter('classId')}
          >
            <SelectItem value="">{t('allClasses')}</SelectItem>
            {(meta?.classes ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </TimetableFilterSelect>
          <TimetableFilterSelect
            className={FILTER_CLASS}
            icon={<UserCheck />}
            ariaLabel={t('filterTeacher')}
            value={filters.teacherId}
            onValueChange={setFilter('teacherId')}
          >
            <SelectItem value="">{t('allTeachers')}</SelectItem>
            {(meta?.teachers ?? []).map((teacher) => (
              <SelectItem key={teacher.id} value={teacher.id}>
                {teacher.name}
              </SelectItem>
            ))}
          </TimetableFilterSelect>
          <TimetableFilterSelect
            className={FILTER_CLASS}
            icon={<DoorOpen />}
            ariaLabel={t('filterRoom')}
            value={filters.room}
            onValueChange={setFilter('room')}
          >
            <SelectItem value="">{t('allRooms')}</SelectItem>
            {rooms.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </TimetableFilterSelect>
          <TimetableFilterSelect
            className={FILTER_CLASS}
            icon={<BookOpen />}
            ariaLabel={t('filterSubject')}
            value={filters.subjectId}
            onValueChange={setFilter('subjectId')}
          >
            <SelectItem value="">{t('allSubjects')}</SelectItem>
            {(meta?.subjects ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </TimetableFilterSelect>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {can('emploiDuTemps', 'export') && (
            <Button variant="outline" size="sm" className="w-fit" onClick={onExport}>
              <FileSpreadsheet size={13} />
              {t('export')}
            </Button>
          )}
          <HelpTooltip label={t('help.exportScope')} />
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      {noYear ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center">
          <p className="text-caption font-semibold text-foreground">{t('noYearTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('noYearHint')}</p>
        </div>
      ) : !data ? (
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
            <TimetableAgenda
              days={days}
              sessions={filtered}
              today={today}
              onSessionClick={(s) => setModal({ session: s })}
            />
          ) : view === 'month' ? (
            <TimetableMonth
              anchor={anchor}
              sessions={filtered}
              today={today}
              onDayClick={(day) => {
                setAnchor(day);
                setView('day');
              }}
              onSessionClick={(s) => setModal({ session: s })}
            />
          ) : (
            <>
              <TimetableGrid
                days={days}
                sessions={filtered}
                today={today}
                showClass={!filters.classId}
                onSessionClick={(s) => setModal({ session: s })}
                onSlotClick={(day, start) => openCreate(day, start)}
              />
              {filtered.length === 0 && (
                <p className="mt-2 text-center text-xs text-muted-foreground">{t('emptyRange')}</p>
              )}
            </>
          )}
        </div>
      )}

      {data && !noYear && <TimetableLegend sessions={filtered} />}

      {modal && meta && (
        <SessionFormModal
          initial={modal}
          classes={meta.classes}
          teachers={meta.teachers}
          subjects={meta.subjects}
          rooms={meta.rooms}
          links={meta.links}
          sessions={data?.sessions ?? []}
          academicYear={
            meta.academicYear
              ? { label: meta.academicYear.label, endDate: meta.academicYear.endDate }
              : null
          }
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null);
            toast(message);
            invalidateCachePrefix('/api/school/timetable');
            void refreshTimetable();
          }}
        />
      )}
    </div>
  );
}
