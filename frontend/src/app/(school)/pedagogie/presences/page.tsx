'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Clock,
  Download,
  Eye,
  Pencil,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import {
  Skeleton,
  SkeletonFilters,
  SkeletonStatCards,
  SkeletonTable,
} from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { PageNumbers } from '@/components/ui/Pager';
import { BarChart } from '@/components/admin/charts/BarChart';
import { exportToCsv } from '@/lib/csv-export';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { submitOrQueue } from '@/lib/offline-queue';
import { OFFLINE_SYNC } from '@/lib/constants';
import { LOCALE_BCP47 } from '@/lib/locales';
import { AttendanceEditModal } from './AttendanceEditModal';
import { statusLabel } from './status-label';
import type {
  AttendanceDay,
  AttendanceResponse,
  AttendanceStatsResponse,
  AttendanceStatus,
  AttendanceStudentRow,
} from './types';

const PAGE_SIZE = 20;

const STATUS_STYLE: Record<
  AttendanceStatus,
  { glyph: string; bg: string; fg: string; dot: string }
> = {
  PRESENT: {
    glyph: 'P',
    bg: 'bg-success',
    fg: 'text-success-foreground',
    dot: 'bg-success-foreground',
  },
  ABSENT: {
    glyph: 'A',
    bg: 'bg-destructive',
    fg: 'text-destructive-foreground',
    dot: 'bg-destructive-foreground',
  },
  LATE: {
    glyph: 'R',
    bg: 'bg-warning',
    fg: 'text-warning-foreground',
    dot: 'bg-warning-foreground',
  },
  EXCUSED: { glyph: 'J', bg: 'bg-info', fg: 'text-info-foreground', dot: 'bg-[#2563eb]' },
};
const NOT_RECORDED_STYLE = {
  glyph: '—',
  bg: 'bg-muted',
  fg: 'text-muted-foreground',
  dot: 'bg-muted-foreground',
};
const STATUS_CYCLE: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

function nextStatus(current: AttendanceStatus | null): AttendanceStatus | null {
  if (current === null) return STATUS_CYCLE[0]!;
  const idx = STATUS_CYCLE.indexOf(current);
  return idx === STATUS_CYCLE.length - 1 ? null : STATUS_CYCLE[idx + 1]!;
}

function fmtDayHeader(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

export default function PresencesPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const t = useTranslations('Presences');
  const tStatus = useTranslations('Presences.status');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];

  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [classId, setClassId] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | AttendanceStatus>('');
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly' | 'stats' | 'alerts'>('weekly');
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<AttendanceStatsResponse | null>(null);
  const [editing, setEditing] = useState<{
    student: AttendanceStudentRow;
    date: string;
    focusJustification: boolean;
  } | null>(null);

  const weekStartParam = useMemo(() => {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff),
    );
    monday.setUTCDate(monday.getUTCDate() + weekOffset * 7);
    return monday.toISOString().slice(0, 10);
  }, [weekOffset]);

  const monthParam = useMemo(() => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }, [monthOffset]);

  const gridView = activeTab === 'monthly' ? 'month' : 'week';

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const qs = new URLSearchParams({ view: gridView });
    if (gridView === 'month') qs.set('month', monthParam);
    else qs.set('weekStart', weekStartParam);
    if (classId) qs.set('classId', classId);
    api<AttendanceResponse>(`/api/school/attendance?${qs.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        if (res.resolvedClassId && res.resolvedClassId !== classId) setClassId(res.resolvedClassId);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError(t('loadError'));
      });
    return () => {
      cancelled = true;
    };
  }, [user, router, gridView, weekStartParam, monthParam, classId, t]);

  useEffect(() => {
    if (!user || activeTab !== 'stats') return;
    let cancelled = false;
    const qs = new URLSearchParams();
    if (classId) qs.set('classId', classId);
    api<AttendanceStatsResponse>(`/api/school/attendance/stats?${qs.toString()}`).then((res) => {
      if (!cancelled) setStats(res);
    });
    return () => {
      cancelled = true;
    };
  }, [user, activeTab, classId]);

  function refresh() {
    if (!user) return;
    const qs = new URLSearchParams({ view: gridView });
    if (gridView === 'month') qs.set('month', monthParam);
    else qs.set('weekStart', weekStartParam);
    if (classId) qs.set('classId', classId);
    api<AttendanceResponse>(`/api/school/attendance?${qs.toString()}`).then(setData);
  }

  const todayIso = data?.days.find((d) => d.isToday)?.date;
  const targetDate = todayIso ?? data?.days[data.days.length - 1]?.date ?? null;

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.students.filter((s) => {
      if (search && !`${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (statusFilter && targetDate) {
        const record = s.days[targetDate];
        if ((record?.status ?? null) !== statusFilter) return false;
      }
      return true;
    });
  }, [data, search, statusFilter, targetDate]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStudents = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function markDay(studentId: string, date: string, status: AttendanceStatus | null) {
    if (!user) return;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        students: prev.students.map((s) =>
          s.id === studentId
            ? { ...s, days: { ...s.days, [date]: status ? { status, justification: null } : null } }
            : s,
        ),
      };
    });
    const student = data?.students.find((s) => s.id === studentId);
    const label = student
      ? t('offline.label', {
          name: `${student.firstName} ${student.lastName.charAt(0)}.`,
          day: fmtDayHeader(date, bcp47),
        })
      : t('offline.labelFallback');
    const entry =
      status === null
        ? {
            path: `/api/school/attendance?studentId=${studentId}&date=${date}`,
            method: 'DELETE' as const,
            label,
          }
        : {
            path: '/api/school/attendance',
            method: 'PATCH' as const,
            body: { studentId, date, status },
            label,
          };
    try {
      const r = await submitOrQueue(entry, user.id);
      if (r.queued) {
        toast(OFFLINE_SYNC.queuedToast, 'info');
      } else {
        refresh();
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
      refresh();
    }
  }

  async function deleteToday(student: AttendanceStudentRow) {
    if (!targetDate) return;
    if (
      !(await confirm({
        message: t('deleteConfirm.message', { name: `${student.firstName} ${student.lastName}` }),
        confirmLabel: t('deleteConfirm.confirmLabel'),
        danger: true,
      }))
    )
      return;
    await markDay(student.id, targetDate, null);
    toast(t('toasts.entryDeleted'), 'success');
  }

  function onExport() {
    if (!data) return;
    exportToCsv(
      'presences.csv',
      [
        t('csv.student'),
        t('csv.number'),
        ...data.days.map((d) => fmtDayHeader(d.date, bcp47)),
        t('csv.rate'),
        t('csv.absences'),
      ],
      filtered.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.studentNumber,
        ...data.days.map((d) =>
          s.days[d.date] ? STATUS_STYLE[s.days[d.date]!.status].glyph : '—',
        ),
        s.rate != null ? `${s.rate}%` : '—',
        s.absences,
      ]),
    );
  }

  function menuItemsFor(s: AttendanceStudentRow): ActionMenuItem[] {
    return [
      {
        label: t('actions.viewDetail'),
        icon: <Eye size={14} />,
        onClick: () => router.push(`/eleves/${s.id}`),
      },
      {
        label: t('actions.editAttendance'),
        icon: <Pencil size={14} />,
        onClick: () => setEditing({ student: s, date: targetDate!, focusJustification: false }),
      },
      {
        label: t('actions.justifyAbsence'),
        icon: <ShieldCheck size={14} />,
        onClick: () => setEditing({ student: s, date: targetDate!, focusJustification: true }),
        divider: true,
      },
      {
        label: t('actions.deleteEntry'),
        icon: <Trash2 size={14} />,
        onClick: () => deleteToday(s),
        tone: 'danger' as const,
        divider: true,
      },
    ];
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  const s = data?.summary;

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('subtitle')}
            {s?.yearLabel ? t('yearSuffix', { year: s.yearLabel }) : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="w-fit" onClick={onExport}>
            <Download size={14} />
            {t('export')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonStatCards count={5} />
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={6} />
          </Card>
        </div>
      )}

      {data && data.classes.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('emptyClasses')}</p>
      )}

      {data && data.classes.length > 0 && s && (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
            <SummaryCard
              icon={Users}
              tone="secondary"
              label={t('summary.totalStudents')}
              value={String(s.totalStudents)}
              sub={`${s.className ?? ''}${s.yearLabel ? ` — ${s.yearLabel}` : ''}`}
            />
            <SummaryCard
              icon={UserCheck}
              tone="success"
              label={t('summary.presentToday')}
              value={String(s.presentToday)}
              sub={t('summary.outOfStudents', { count: s.totalStudents })}
            />
            <SummaryCard
              icon={UserX}
              tone="destructive"
              label={t('summary.absentToday')}
              value={String(s.absentToday)}
              sub={t(
                s.absentTodayUnjustified > 1
                  ? 'summary.unjustified.other'
                  : 'summary.unjustified.one',
                { count: s.absentTodayUnjustified },
              )}
            />
            <SummaryCard
              icon={Clock}
              tone="warning"
              label={t('summary.lateThisMonth')}
              value={String(s.lateThisMonth)}
              sub={t('summary.vsLastMonth', {
                delta: `${s.lateThisMonthDelta >= 0 ? '+' : ''}${s.lateThisMonthDelta}`,
              })}
            />
            <SummaryCard
              icon={TrendingUp}
              tone="blue"
              label={t('summary.attendanceRate')}
              value={s.attendanceRatePercent != null ? `${s.attendanceRatePercent}%` : '—'}
              sub={t('summary.thisQuarter')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('filters.searchPlaceholder')}
              className="max-w-[260px]"
            />
            <FilterSelect
              value={classId}
              onValueChange={(v) => {
                setClassId(v);
                setPage(1);
              }}
            >
              {data.classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            {activeTab === 'monthly' ? (
              <FilterSelect
                value={String(monthOffset)}
                onValueChange={(v) => {
                  setMonthOffset(Number(v));
                  setPage(1);
                }}
              >
                <SelectItem value="0">{t('filters.thisMonth')}</SelectItem>
                <SelectItem value="-1">{t('filters.lastMonth')}</SelectItem>
                <SelectItem value="-2">{t('filters.twoMonthsAgo')}</SelectItem>
              </FilterSelect>
            ) : (
              <FilterSelect
                value={String(weekOffset)}
                onValueChange={(v) => {
                  setWeekOffset(Number(v));
                  setPage(1);
                }}
              >
                <SelectItem value="0">{t('filters.thisWeek')}</SelectItem>
                <SelectItem value="-1">{t('filters.lastWeek')}</SelectItem>
                <SelectItem value="-2">{t('filters.twoWeeksAgo')}</SelectItem>
              </FilterSelect>
            )}
            <FilterSelect
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as '' | AttendanceStatus);
                setPage(1);
              }}
            >
              <SelectItem value="">{t('filters.allStatuses')}</SelectItem>
              <SelectItem value="PRESENT">{tStatus('PRESENT')}</SelectItem>
              <SelectItem value="ABSENT">{tStatus('ABSENT')}</SelectItem>
              <SelectItem value="LATE">{tStatus('LATE')}</SelectItem>
              <SelectItem value="EXCUSED">{t('statusFilterExcused')}</SelectItem>
            </FilterSelect>
            <span className="text-sm text-muted-foreground">
              {t(
                filtered.length > 1 ? 'filters.studentsCount.other' : 'filters.studentsCount.one',
                {
                  count: filtered.length,
                },
              )}
            </span>
          </div>

          <Tabs
            tabs={[
              { key: 'weekly', label: t('tabs.weekly') },
              { key: 'monthly', label: t('tabs.monthly') },
              { key: 'stats', label: t('tabs.stats') },
              { key: 'alerts', label: t('tabs.alerts') },
            ]}
            active={activeTab}
            onChange={(key) => {
              setActiveTab(key as typeof activeTab);
              setPage(1);
            }}
          />

          {(activeTab === 'weekly' || activeTab === 'monthly') && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                {(Object.keys(STATUS_STYLE) as AttendanceStatus[]).map((k) => (
                  <div
                    key={k}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[k].dot}`} />
                    {statusLabel(k, tStatus)}
                  </div>
                ))}
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className={`h-2.5 w-2.5 rounded-full ${NOT_RECORDED_STYLE.dot}`} />
                  {t('notRecorded')}
                </div>
              </div>

              <Card>
                {filtered.length === 0 ? (
                  <p className="p-5 text-sm text-muted-foreground">
                    {data.students.length === 0
                      ? t('table.noStudentsInClass')
                      : t('table.noResults')}
                  </p>
                ) : (
                  <>
                    <div className={TABLE_SCROLL}>
                      <table
                        className="w-full border-collapse text-sm"
                        style={{ minWidth: `${280 + data.days.length * 44}px` }}
                      >
                        <thead className={STICKY_THEAD}>
                          <tr className="border-b border-border">
                            <Th className="sticky left-0 z-10 bg-card">{t('table.student')}</Th>
                            {data.days.map((d) => (
                              <Th key={d.date} className="text-center capitalize">
                                {fmtDayHeader(d.date, bcp47)}
                              </Th>
                            ))}
                            <Th className="text-center">{t('table.rate')}</Th>
                            <Th className="text-center">{t('table.absences')}</Th>
                            <Th className="w-[50px]" />
                          </tr>
                        </thead>
                        <tbody>
                          {pageStudents.map((row) => (
                            <tr key={row.id} className="border-b border-border last:border-none">
                              <td className="sticky left-0 z-10 bg-card px-3.5 py-2.5">
                                <div className="flex items-center gap-2.5">
                                  <Avatar name={`${row.firstName} ${row.lastName}`} size={28} />
                                  <div>
                                    <div className="font-semibold text-foreground">
                                      {row.firstName} {row.lastName}
                                    </div>
                                    <div className="text-2xs text-muted-foreground">
                                      #{row.studentNumber}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              {data.days.map((d) => (
                                <td key={d.date} className="px-1.5 py-2.5 text-center">
                                  <PresenceDot
                                    day={d}
                                    record={row.days[d.date] ?? null}
                                    onClick={() =>
                                      markDay(
                                        row.id,
                                        d.date,
                                        nextStatus(row.days[d.date]?.status ?? null),
                                      )
                                    }
                                  />
                                </td>
                              ))}
                              <td className="px-3.5 py-2.5 text-center">
                                <RateBar rate={row.rate} />
                              </td>
                              <td className="px-3.5 py-2.5 text-center text-muted-foreground">
                                {row.absences}
                              </td>
                              <td className="px-1.5 py-2.5">
                                <ActionMenu items={menuItemsFor(row)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between border-t border-border px-3.5 py-2.5">
                      <span className="text-xs text-muted-foreground">
                        {t('table.paginationSummary', {
                          from: (page - 1) * PAGE_SIZE + 1,
                          to: Math.min(page * PAGE_SIZE, filtered.length),
                          total: filtered.length,
                          rate:
                            s.attendanceRatePercent != null ? `${s.attendanceRatePercent}%` : '—',
                        })}
                      </span>
                      <div className="flex items-center gap-1">
                        <PageNumbers page={page} totalPages={pageCount} onChange={setPage} />
                      </div>
                    </div>
                  </>
                )}
              </Card>
            </>
          )}

          {activeTab === 'stats' && <StatsSection stats={stats} />}

          {activeTab === 'alerts' && (
            <AlertsSection
              students={filtered}
              onView={(id) => router.push(`/eleves/${id}`)}
              onJustify={(row) =>
                targetDate &&
                setEditing({ student: row, date: targetDate, focusJustification: true })
              }
            />
          )}
        </>
      )}

      {editing && (
        <AttendanceEditModal
          studentId={editing.student.id}
          studentName={`${editing.student.firstName} ${editing.student.lastName}`}
          date={editing.date}
          initialStatus={editing.student.days[editing.date]?.status ?? null}
          initialJustification={editing.student.days[editing.date]?.justification ?? null}
          focusJustification={editing.focusJustification}
          onClose={() => setEditing(null)}
          onSaved={(status, justification) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    students: prev.students.map((st) =>
                      st.id === editing.student.id
                        ? { ...st, days: { ...st.days, [editing.date]: { status, justification } } }
                        : st,
                    ),
                  }
                : prev,
            );
            setEditing(null);
            toast(t('toasts.attendanceUpdated'), 'success');
            refresh();
          }}
        />
      )}
    </div>
  );
}

function PresenceDot({
  day,
  record,
  onClick,
}: {
  day: AttendanceDay;
  record: { status: AttendanceStatus; justification: string | null } | null;
  onClick: () => void;
}) {
  const t = useTranslations('Presences');
  const tStatus = useTranslations('Presences.status');
  const style = record ? STATUS_STYLE[record.status] : NOT_RECORDED_STYLE;
  const label = record ? statusLabel(record.status, tStatus) : t('notRecorded');
  if (day.isFuture) {
    return (
      <span
        title={t('table.dayFuture')}
        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-2xs font-bold opacity-40 ${NOT_RECORDED_STYLE.bg} ${NOT_RECORDED_STYLE.fg}`}
      >
        {NOT_RECORDED_STYLE.glyph}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={t('table.dayClickToChange', { status: label })}
      className={`mx-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-2xs font-bold ${style.bg} ${style.fg}`}
    >
      {style.glyph}
    </button>
  );
}

function RateBar({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-muted-foreground">—</span>;
  const tone =
    rate >= 95
      ? 'bg-success-foreground'
      : rate >= 80
        ? 'bg-[#2563eb]'
        : 'bg-destructive-foreground';
  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="h-[5px] w-[50px] overflow-hidden rounded-full bg-muted">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${rate}%` }} />
      </span>
      <span className="text-xs font-semibold text-foreground">{rate}%</span>
    </div>
  );
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function SummaryCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  tone: 'secondary' | 'blue' | 'success' | 'destructive' | 'warning';
  label: string;
  value: string;
  sub: string;
}) {
  const iconBg: Record<string, string> = {
    secondary: 'bg-secondary text-primary',
    blue: 'bg-info text-info-foreground',
    success: 'bg-success text-success-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[tone]}`}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-2xs font-medium text-muted-foreground">{label}</div>
        <div className="text-xl font-bold text-foreground">{value}</div>
        <div className="truncate text-2xs text-muted-foreground">{sub}</div>
      </div>
    </Card>
  );
}

const DISTRIBUTION_STYLE: {
  key: Exclude<keyof AttendanceStatsResponse['distribution'], 'recorded'>;
  icon: typeof UserCheck;
  tone: 'success' | 'destructive' | 'warning' | 'blue';
}[] = [
  { key: 'present', icon: UserCheck, tone: 'success' },
  { key: 'absent', icon: UserX, tone: 'destructive' },
  { key: 'late', icon: Clock, tone: 'warning' },
  { key: 'excused', icon: ShieldCheck, tone: 'blue' },
];

function StatsSection({ stats }: { stats: AttendanceStatsResponse | null }) {
  const t = useTranslations('Presences.stats');
  const tDist = useTranslations('Presences.stats.distribution');

  if (!stats) {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-3.5">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-20" />
            </Card>
          ))}
        </div>
        <Card className="p-5">
          <Skeleton className="h-[180px] w-full" />
        </Card>
      </div>
    );
  }

  const { distribution, weeklyTrend, overallRatePercent } = stats;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {DISTRIBUTION_STYLE.map((m) => {
          const count = distribution[m.key];
          const pct =
            distribution.recorded > 0 ? Math.round((count / distribution.recorded) * 100) : 0;
          return (
            <SummaryCard
              key={m.key}
              icon={m.icon}
              tone={m.tone}
              label={tDist(m.key)}
              value={String(count)}
              sub={distribution.recorded > 0 ? t('percentOfRecorded', { pct }) : t('noData')}
            />
          );
        })}
      </div>

      <Card className="gap-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
            <TrendingUp size={14} className="text-primary" />
            {t('weeklyRateTitle')}
          </div>
          <span className="text-sm font-bold text-foreground">
            {overallRatePercent != null ? `${overallRatePercent}%` : '—'}{' '}
            <span className="text-xs font-normal text-muted-foreground">{t('thisQuarter')}</span>
          </span>
        </div>
        <BarChart data={weeklyTrend} formatValue={(v) => `${v}%`} ariaLabel={t('chartAriaLabel')} />
      </Card>
    </div>
  );
}

const ALERT_RATE_THRESHOLD = 80;
const ALERT_ABSENCE_THRESHOLD = 3;

function AlertsSection({
  students,
  onView,
  onJustify,
}: {
  students: AttendanceStudentRow[];
  onView: (studentId: string) => void;
  onJustify: (row: AttendanceStudentRow) => void;
}) {
  const t = useTranslations('Presences.alerts');
  const atRisk = students
    .filter(
      (s) =>
        (s.rate != null && s.rate < ALERT_RATE_THRESHOLD) || s.absences >= ALERT_ABSENCE_THRESHOLD,
    )
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0) || b.absences - a.absences);

  if (atRisk.length === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <ShieldCheck size={28} className="text-success-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">
          {t('emptyState', { rate: ALERT_RATE_THRESHOLD, absences: ALERT_ABSENCE_THRESHOLD })}
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
        <AlertTriangle size={15} className="text-warning-foreground" />
        <span className="text-caption font-semibold text-foreground">
          {t(atRisk.length > 1 ? 'studentsToWatch.other' : 'studentsToWatch.one', {
            count: atRisk.length,
          })}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('thresholdSubtitle', {
            rate: ALERT_RATE_THRESHOLD,
            absences: ALERT_ABSENCE_THRESHOLD,
          })}
        </span>
      </div>
      <table className="hidden w-full min-w-[560px] border-collapse text-sm md:table">
        <thead>
          <tr className="border-b border-border">
            <Th>{t('student')}</Th>
            <Th>{t('reason')}</Th>
            <Th className="text-center">{t('rate')}</Th>
            <Th className="text-center">{t('absences')}</Th>
            <Th className="w-[180px]" />
          </tr>
        </thead>
        <tbody>
          {atRisk.map((row) => {
            const lowRate = row.rate != null && row.rate < ALERT_RATE_THRESHOLD;
            const highAbsences = row.absences >= ALERT_ABSENCE_THRESHOLD;
            return (
              <tr key={row.id} className="border-b border-border last:border-none">
                <td className="px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={`${row.firstName} ${row.lastName}`} size={28} />
                    <div>
                      <div className="font-semibold text-foreground">
                        {row.firstName} {row.lastName}
                      </div>
                      <div className="text-2xs text-muted-foreground">#{row.studentNumber}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3.5 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {lowRate && (
                      <span className="rounded-full bg-destructive px-2 py-0.5 text-2xs font-bold text-destructive-foreground">
                        {t('lowRate')}
                      </span>
                    )}
                    {highAbsences && (
                      <span className="rounded-full bg-warning px-2 py-0.5 text-2xs font-bold text-warning-foreground">
                        {t('repeatedAbsences')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3.5 py-2.5 text-center">
                  <RateBar rate={row.rate} />
                </td>
                <td className="px-3.5 py-2.5 text-center font-semibold text-foreground">
                  {row.absences}
                </td>
                <td className="px-3.5 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onView(row.id)}
                      className="rounded-md border border-border px-2.5 py-1.5 text-2xs font-semibold text-foreground"
                    >
                      {t('view')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onJustify(row)}
                      className="rounded-md border border-border px-2.5 py-1.5 text-2xs font-semibold text-foreground"
                    >
                      {t('justify')}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* < md: cards */}
      <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
        {atRisk.map((row) => {
          const lowRate = row.rate != null && row.rate < ALERT_RATE_THRESHOLD;
          const highAbsences = row.absences >= ALERT_ABSENCE_THRESHOLD;
          return (
            <div key={row.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={`${row.firstName} ${row.lastName}`} size={28} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">
                      {row.firstName} {row.lastName}
                    </div>
                    <div className="truncate text-2xs text-muted-foreground">
                      #{row.studentNumber}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {lowRate && (
                    <span className="rounded-full bg-destructive px-2 py-0.5 text-2xs font-bold text-destructive-foreground">
                      {t('lowRate')}
                    </span>
                  )}
                  {highAbsences && (
                    <span className="rounded-full bg-warning px-2 py-0.5 text-2xs font-bold text-warning-foreground">
                      {t('repeatedAbsences')}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border pt-2.5">
                <RateBar rate={row.rate} />
                <span className="text-caption font-semibold text-foreground">
                  {t(row.absences > 1 ? 'absenceCount.other' : 'absenceCount.one', {
                    count: row.absences,
                  })}
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onView(row.id)}
                  className="flex-1 rounded-md border border-border px-2.5 py-1.5 text-2xs font-semibold text-foreground"
                >
                  {t('view')}
                </button>
                <button
                  type="button"
                  onClick={() => onJustify(row)}
                  className="flex-1 rounded-md border border-border px-2.5 py-1.5 text-2xs font-semibold text-foreground"
                >
                  {t('justify')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
