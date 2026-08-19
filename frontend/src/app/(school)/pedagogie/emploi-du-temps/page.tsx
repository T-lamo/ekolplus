'use client';

// Emploi du temps (Banani hmhXX_ZK0yoi — .planning/banani/emploi-du-temps.md):
// header (title + « Année scolaire … — Vue hebdomadaire », view tabs Mois ·
// Semaine · Jour · Agenda, « + Ajouter un cours »), filter bar (week nav +
// Aujourd'hui, Classe / Enseignant / Salle / Matière, Exporter CSV), the
// grid (or agenda / month), the legend. Data: GET /api/school/timetable for
// the visible range; filters apply client-side (a week is ~150 rows at most).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Download,
  List,
  Plus,
  School,
  UserCheck,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { exportToCsv } from '@/lib/csv-export';
import type { RoomRow } from '@/lib/rooms';
import { cn } from '@/lib/utils';
import { LIST_PAGE } from '@/lib/layout';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
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
  CSV_HEADERS,
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

const VIEWS: { key: TimetableView; label: string; subtitle: string; Icon: typeof Calendar }[] = [
  { key: 'month', label: 'Mois', subtitle: 'Vue mensuelle', Icon: Calendar },
  { key: 'week', label: 'Semaine', subtitle: 'Vue hebdomadaire', Icon: CalendarDays },
  { key: 'day', label: 'Jour', subtitle: 'Vue journalière', Icon: CalendarClock },
  { key: 'agenda', label: 'Agenda', subtitle: 'Agenda de la semaine', Icon: List },
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
  const [meta, setMeta] = useState<Meta | null>(null);
  const [data, setData] = useState<TimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Ranges already fetched (cleared after every mutation) — switching views
  // or stepping back to a week already seen is instant, and the previous
  // grid stays on screen while a new range loads instead of a skeleton.
  const cache = useRef(new Map<string, TimetableResponse>());
  const [modal, setModal] = useState<SessionFormInitial | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [school, classes, teachers, subjects, links, roomCatalog] = await Promise.all([
          api<{
            academicYear: { id: string; label: string; startDate: string; endDate: string } | null;
          }>('/api/school'),
          api<{ classes: ClassOption[] }>('/api/school/classes'),
          api<{ teachers: TeacherOption[] }>('/api/school/teachers'),
          api<{ subjects: SubjectOption[] }>('/api/school/subjects'),
          api<{ classSubjects: ClassSubjectLink[] }>('/api/school/class-subjects'),
          api<{ rooms: RoomRow[] }>('/api/school/rooms'),
        ]);
        if (cancelled) return;
        setMeta({
          academicYear: school.academicYear
            ? {
                id: school.academicYear.id,
                label: school.academicYear.label,
                startDate: school.academicYear.startDate.slice(0, 10),
                endDate: school.academicYear.endDate.slice(0, 10),
              }
            : null,
          classes: classes.classes.map((c) => ({
            id: c.id,
            name: c.name,
            color: c.color ?? null,
            room: c.room ?? null,
            roomId: c.roomId ?? null,
          })),
          teachers: teachers.teachers.map((t) => ({
            id: t.id,
            name: t.name,
            photoUrl: t.photoUrl ?? null,
          })),
          subjects: subjects.subjects.map((s) => ({
            id: s.id,
            name: s.name,
            abbreviation: s.abbreviation ?? null,
            color: s.color ?? null,
          })),
          links: links.classSubjects.map((l) => ({
            classId: l.classId,
            subjectId: l.subjectId,
            teacherId: l.teacherId ?? null,
            weeklyHours: l.weeklyHours ?? null,
          })),
          rooms: roomCatalog.rooms,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const key = `${range.from}_${range.to}`;
    const hit = cache.current.get(key);
    if (hit) {
      setData(hit);
      setLoading(false);
      return;
    }
    setLoading(true);
    api<TimetableResponse>(`/api/school/timetable?from=${range.from}&to=${range.to}`)
      .then((res) => {
        cache.current.set(key, res);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, refreshKey]);

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
      ? formatMonthYear(anchor)
      : view === 'day'
        ? formatLong(anchor)
        : formatWeekRange(days);

  const step = useCallback(
    (dir: 1 | -1) => {
      setAnchor((a) =>
        view === 'month' ? addMonths(a, dir) : addDays(a, view === 'day' ? dir : 7 * dir),
      );
    },
    [view],
  );

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
      toast('Aucune séance à exporter sur cette période.', 'info');
      return;
    }
    exportToCsv(`emploi-du-temps-${range.from}_${range.to}.csv`, CSV_HEADERS, csvRows(filtered));
  }

  const subtitleView = VIEWS.find((v) => v.key === view)?.subtitle ?? '';
  const noYear = meta !== null && meta.academicYear === null;
  const rooms = data?.rooms ?? [];

  return (
    <div className={LIST_PAGE}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Emploi du temps</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {meta?.academicYear ? `Année scolaire ${meta.academicYear.label} — ` : ''}
            {subtitleView}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Vue"
            className="flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-muted p-[3px]"
          >
            {VIEWS.map(({ key, label, Icon }) => (
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
                {label}
              </button>
            ))}
          </div>
          <Button className="w-fit" onClick={() => openCreate()} disabled={noYear}>
            <Plus size={14} />
            Ajouter un cours
          </Button>
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
            aria-label="Période précédente"
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
            aria-label="Période suivante"
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
            Aujourd’hui
          </button>
        </div>
        <div className="hidden h-5 w-px bg-border sm:block" aria-hidden />
        <div className="flex min-w-0 basis-full flex-wrap items-center gap-1.5 sm:flex-1 sm:basis-auto">
          <TimetableFilterSelect
            className={FILTER_CLASS}
            icon={<School />}
            ariaLabel="Classe"
            value={filters.classId}
            onValueChange={setFilter('classId')}
          >
            <SelectItem value="">Toutes les classes</SelectItem>
            {(meta?.classes ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </TimetableFilterSelect>
          <TimetableFilterSelect
            className={FILTER_CLASS}
            icon={<UserCheck />}
            ariaLabel="Enseignant"
            value={filters.teacherId}
            onValueChange={setFilter('teacherId')}
          >
            <SelectItem value="">Tous les enseignants</SelectItem>
            {(meta?.teachers ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </TimetableFilterSelect>
          <TimetableFilterSelect
            className={FILTER_CLASS}
            icon={<DoorOpen />}
            ariaLabel="Salle"
            value={filters.room}
            onValueChange={setFilter('room')}
          >
            <SelectItem value="">Toutes les salles</SelectItem>
            {rooms.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </TimetableFilterSelect>
          <TimetableFilterSelect
            className={FILTER_CLASS}
            icon={<BookOpen />}
            ariaLabel="Matière"
            value={filters.subjectId}
            onValueChange={setFilter('subjectId')}
          >
            <SelectItem value="">Toutes les matières</SelectItem>
            {(meta?.subjects ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </TimetableFilterSelect>
        </div>
        <Button variant="outline" size="sm" className="ml-auto w-fit" onClick={onExport}>
          <Download size={13} />
          Exporter
        </Button>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      {noYear ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center">
          <p className="text-caption font-semibold text-foreground">Aucune année scolaire active</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure d’abord une année scolaire dans Paramètres pour planifier des cours.
          </p>
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
        // Shrinkable (min-h-0, no flex-1): the timetable takes at most the
        // room left under the header and scrolls inside — the page itself
        // never scrolls, header + filters + legend stay visible (user
        // decision 2026-08-17, same rule as the list pages).
        <div
          className={cn('flex min-h-0 flex-col transition-opacity', loading && 'opacity-60')}
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
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Aucune séance sur cette période — clique sur un créneau ou sur « Ajouter un cours
                  ».
                </p>
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
            cache.current.clear();
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
