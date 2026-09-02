'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Star,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  AlertTriangle,
  Plus,
  FileSpreadsheet,
  Eye,
  Pencil,
  Trash2,
  Table2,
  BookOpen,
  BarChart2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { getCache, useApi } from '@/lib/useApi';
import { usePermissions } from '@/lib/usePermissions';
import { cn } from '@/lib/utils';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { SelectItem } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageNumbers } from '@/components/ui/Pager';
import { exportToCsv } from '@/lib/csv-export';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { fmtAverage, mentionClass, moyColor } from './format';
import { MENTIONS, type AppreciationsListData } from './types';
// Code-split: only mounted once the user switches to that tab (default is
// "Par élève") — same reasoning as the StudentFormModal split in eleves/page.tsx.
const ParMatiereTab = dynamic(() => import('./ParMatiereTab').then((m) => m.ParMatiereTab), {
  ssr: false,
});
const StatistiquesTab = dynamic(() => import('./StatistiquesTab').then((m) => m.StatistiquesTab), {
  ssr: false,
});

const PAGE_SIZE = 20;

export default function AppreciationsListPage() {
  const t = useTranslations('Appreciations.list');
  const tMention = useTranslations('Appreciations.mention');
  const locale = useLocale();
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  // Class picker = the ACTIVE year's classes (`/api/school/classes`), not
  // the classes that happen to have subject affectations — a brand-new class
  // must show up here immediately, and archived-year classes never.
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mentionFilter, setMentionFilter] = useState('');
  const [tab, setTab] = useState<'eleve' | 'matiere' | 'stats' | 'attente'>('eleve');
  const [page, setPage] = useState(1);

  const { data: classesData, error: classesErr } = useApi<{
    classes: Array<{ id: string; name: string }>;
  }>('/api/school/classes', {
    skip: !user,
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
        router.replace('/');
        return true;
      }
    },
  });
  const classes = classesData?.classes ?? [];

  const initialClassDone = useRef(false);
  useEffect(() => {
    if (!initialClassDone.current && classes.length > 0) {
      initialClassDone.current = true;
      setClassId(classes[0]!.id);
    }
  }, [classes]);

  const qs = termId ? `?termId=${termId}` : '';
  const notebookPath = `/api/school/classes/${classId}/appreciations${qs}`;
  const { data, mutate: mutateData } = useApi<AppreciationsListData>(notebookPath, {
    skip: !classId,
    onError: () => setLoadError(t('loadError')),
  });
  const terms = data?.terms ?? [];
  const error = loadError || classesErr ? t('loadError') : null;

  // `classId` (and therefore `notebookPath`) is local state, not a URL
  // param, so this component never remounts on selection change — useApi's
  // `data` can still hold the PREVIOUS class's response for one render
  // while the new fetch is in flight. Gate on `getCache(...) === data` (only
  // true once the cache entry actually written for THIS path matches what
  // we're holding) so this effect can't fire early on stale data and
  // permanently skip the real update once it lands.
  const notebookKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (data && getCache(notebookPath) === data && notebookKeyRef.current !== notebookPath) {
      notebookKeyRef.current = notebookPath;
      setTermId(data.resolvedTermId ?? '');
      setPage(1);
      // A prior transient failure must not keep the banner up over data that
      // has since loaded successfully.
      setLoadError(null);
    }
  }, [data, notebookPath]);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    let rows = data.students;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
    if (mentionFilter) rows = rows.filter((s) => s.mention === mentionFilter);
    if (tab === 'attente') rows = rows.filter((s) => s.status !== 'PUBLISHED');
    return rows;
  }, [data, search, mentionFilter, tab]);
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const pageStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const enAttenteCount = data ? data.students.filter((s) => s.status !== 'PUBLISHED').length : 0;

  const { can, canSee } = usePermissions();
  if (!canSee('appreciations')) return <AccessDenied />;

  async function deleteAppreciation(studentId: string, name: string) {
    if (!data) return;
    if (!(await confirm({ message: t('deleteConfirm', { name }), danger: true }))) return;
    try {
      await api(`/api/school/students/${studentId}/appreciations?termId=${termId}`, {
        method: 'DELETE',
      });
      mutateData({
        ...data,
        students: data.students.map((s) =>
          s.studentId === studentId
            ? { ...s, mention: null, text: null, status: 'NONE', authorName: null }
            : s,
        ),
      });
      toast(t('deletedToast'), 'success');
    } catch {
      toast(t('deleteErrorToast'), 'error');
    }
  }

  function menuItemsFor(s: AppreciationsListData['students'][number]): ActionMenuItem[] {
    return [
      {
        label: t('menuView'),
        icon: <Eye size={14} />,
        onClick: () => router.push(`/pedagogie/appreciations/${s.studentId}?termId=${termId}`),
      },
      {
        label: t('menuEdit'),
        icon: <Pencil size={14} />,
        onClick: () =>
          router.push(`/pedagogie/appreciations/${s.studentId}/saisie?termId=${termId}`),
      },
      {
        label: t('menuDelete'),
        icon: <Trash2 size={14} />,
        tone: 'danger',
        divider: true,
        onClick: () => deleteAppreciation(s.studentId, `${s.firstName} ${s.lastName}`),
      },
    ];
  }

  function onExport() {
    if (!data) return;
    exportToCsv(
      `${t('csv.filenamePrefix')}-${data.className}.csv`.toLowerCase().replace(/\s+/g, '-'),
      [
        t('csv.colStudent'),
        t('csv.colNumber'),
        t('csv.colAverage'),
        t('csv.colMention'),
        t('csv.colGeneralAppreciation'),
        t('csv.colHomeroomTeacher'),
        t('csv.colStatus'),
      ],
      filteredStudents.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.studentNumber,
        s.average ?? '',
        s.mention ? tMention(s.mention) : '',
        s.text ?? '',
        data.homeroomTeacherName ?? '',
        s.status === 'PUBLISHED' ? t('csv.statusRecorded') : t('csv.statusPending'),
      ]),
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
    <div className={`${LIST_PAGE} gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
            <HelpTooltip label={t('help.pageOverview')} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('subtitle', { year: terms[0]?.label ?? '' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can('appreciations', 'export') && (
            <Button variant="ghost" className="w-fit border border-border" onClick={onExport}>
              <FileSpreadsheet size={14} />
              {t('export')}
            </Button>
          )}
          {can('appreciations', 'create') && (
            <Button
              className="w-fit"
              disabled={!data || data.students.length === 0}
              onClick={() =>
                data?.students[0] &&
                router.push(
                  `/pedagogie/appreciations/${data.students[0].studentId}/saisie?termId=${termId}`,
                )
              }
            >
              <Plus size={14} />
              {t('newEntry')}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classes.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <Star size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">{t('noClasses')}</p>
        </Card>
      ) : (
        <>
          {data && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <SummaryCard
                icon={Users}
                tone="secondary"
                label={t('summary.totalStudents')}
                value={`${data.totalCount}`}
                sub={t('summary.totalStudentsSub', {
                  className: data.className,
                  term: terms[0]?.label ?? '',
                })}
              />
              <SummaryCard
                icon={CheckCircle2}
                tone="success"
                label={t('summary.recorded')}
                value={`${data.saisieCount}`}
                sub={t(
                  data.totalCount > 1 ? 'summary.recordedSub.other' : 'summary.recordedSub.one',
                  { count: data.totalCount },
                )}
              />
              <SummaryCard
                icon={Clock}
                tone="warning"
                label={t('summary.pending')}
                value={`${data.totalCount - data.saisieCount}`}
                sub={t('summary.pendingSub')}
              />
              <SummaryCard
                icon={TrendingUp}
                tone="success"
                label={t('summary.positive')}
                value={`${data.positiveCount}`}
                sub={t('summary.positiveSub')}
                help={t('help.positive')}
              />
              <SummaryCard
                icon={AlertTriangle}
                tone="destructive"
                label={t('summary.alert')}
                value={`${data.alertCount}`}
                sub={t('summary.alertSub')}
                help={t('help.alert')}
              />
            </div>
          )}

          <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
            <SearchInput
              placeholder={t('searchPlaceholder')}
              className="min-w-[200px] max-w-[280px] flex-1"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <FilterSelect value={classId} onValueChange={setClassId}>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={termId} onValueChange={setTermId}>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.label}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={mentionFilter}
              onValueChange={(v) => {
                setMentionFilter(v);
                setPage(1);
              }}
            >
              <SelectItem value="">{t('allMentions')}</SelectItem>
              {MENTIONS.map((m) => (
                <SelectItem key={m} value={m}>
                  {tMention(m)}
                </SelectItem>
              ))}
            </FilterSelect>
            <span className="ml-auto text-xs text-muted-foreground">
              {t(filteredStudents.length > 1 ? 'resultsCount.other' : 'resultsCount.one', {
                count: filteredStudents.length,
              })}
            </span>
          </Card>

          <div role="tablist" className="flex w-fit gap-0 border-b-2 border-border">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'eleve'}
              onClick={() => {
                setTab('eleve');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'eleve' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <Table2 size={13} />
              {t('tabs.byStudent')}
              {data && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {data.totalCount}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'matiere'}
              onClick={() => {
                setTab('matiere');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'matiere' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <BookOpen size={13} />
              {t('tabs.bySubject')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'stats'}
              onClick={() => {
                setTab('stats');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'stats' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <BarChart2 size={13} />
              {t('tabs.statistics')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'attente'}
              onClick={() => {
                setTab('attente');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'attente' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <Clock size={13} />
              {t('tabs.pending')}
              <span className="rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground">
                {enAttenteCount}
              </span>
            </button>
          </div>

          {!data ? (
            // Renders PAGE_SIZE skeleton rows, not an arbitrary count — the
            // page no longer force-matches skeleton/real heights via a
            // shared `flex-1` box (that caused its own bug: on a short
            // viewport the shared box could squeeze to near-zero and hide
            // the table). Matching the row COUNT instead keeps the
            // skeleton's natural height close to a full page of real rows,
            // so the skeleton→data swap still doesn't jump the page around
            // (Lighthouse CLS 0.29 was the original regression this guards).
            <Card className="gap-0 overflow-visible p-4">
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </Card>
          ) : tab === 'matiere' ? (
            <ParMatiereTab data={data} />
          ) : tab === 'stats' ? (
            <StatistiquesTab data={data} />
          ) : data.totalCount === 0 ? (
            <Card className="items-center gap-2 p-10 text-center">
              <Users size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('noStudents')}</p>
            </Card>
          ) : (
            <Card className="gap-0 overflow-visible">
              <div className={cn('hidden md:block', TABLE_SCROLL)}>
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <th className="px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.student')}
                      </th>
                      <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.average')}
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.mention')}
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.generalAppreciation')}
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.homeroomTeacher')}
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.status')}
                      </th>
                      <th className="w-11" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageStudents.map((s) => (
                      <tr key={s.studentId} className="border-b border-border last:border-b-0">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${s.firstName} ${s.lastName}`} size={28} />
                            <div>
                              <div className="text-caption font-semibold text-foreground">
                                {s.firstName} {s.lastName}
                              </div>
                              <div className="text-2xs text-muted-foreground">
                                #{s.studentNumber}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-sm font-bold ${moyColor(s.average)}`}>
                            {fmtAverage(s.average, locale)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {s.mention ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-bold ${mentionClass(s.mention)}`}
                            >
                              {tMention(s.mention)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {t('notProvided')}
                            </span>
                          )}
                        </td>
                        <td className="max-w-[280px] px-3 py-2.5">
                          <span className="block truncate text-xs text-foreground">
                            {s.text ?? (
                              <span className="text-muted-foreground italic">
                                {t('noAppreciation')}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs font-medium text-foreground">
                            {data.homeroomTeacherName ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {s.status === 'PUBLISHED' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-2xs font-semibold text-success-foreground">
                              <CheckCircle2 size={10} />
                              {t('statusRecorded')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                              <Clock size={10} />
                              {t('statusPending')}
                            </span>
                          )}
                        </td>
                        <td className="px-1.5 py-2.5">
                          <ActionMenu items={menuItemsFor(s)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* < md: cards */}
              <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
                {pageStudents.map((s) => (
                  <div key={s.studentId} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size={28} />
                        <div className="min-w-0">
                          <div className="truncate text-caption font-semibold text-foreground">
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="truncate text-2xs text-muted-foreground">
                            #{s.studentNumber}
                          </div>
                        </div>
                      </div>
                      <div className="-mt-1 -mr-1 shrink-0">
                        <ActionMenu items={menuItemsFor(s)} />
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                      {s.status === 'PUBLISHED' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-2xs font-semibold text-success-foreground">
                          <CheckCircle2 size={10} />
                          {t('statusRecorded')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                          <Clock size={10} />
                          {t('statusPending')}
                        </span>
                      )}
                      <span className={`text-sm font-bold ${moyColor(s.average)}`}>
                        {fmtAverage(s.average, locale)}
                        {s.mention && (
                          <span
                            className={`ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold ${mentionClass(s.mention)}`}
                          >
                            {tMention(s.mention)}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-border px-3.5 py-2.5">
                <span className="text-xs text-muted-foreground">
                  {t('paginationRange', {
                    from: (page - 1) * PAGE_SIZE + 1,
                    to: Math.min(page * PAGE_SIZE, filteredStudents.length),
                    total: filteredStudents.length,
                  })}{' '}
                  <strong className="text-foreground">
                    {t('paginationRecorded', { count: data.saisieCount })}
                  </strong>
                  {t('paginationPending', { count: data.totalCount - data.saisieCount })}
                </span>
                <div className="flex items-center gap-1">
                  <PageNumbers page={page} totalPages={pageCount} onChange={setPage} />
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tone: t,
  label,
  value,
  sub,
  help,
}: {
  icon: typeof Users;
  tone: 'secondary' | 'success' | 'warning' | 'destructive';
  label: string;
  value: string;
  sub: string;
  help?: string;
}) {
  const iconBg: Record<string, string> = {
    secondary: 'bg-secondary text-primary',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
  };
  const valueColor: Record<string, string> = {
    secondary: 'text-foreground',
    success: 'text-success-foreground',
    warning: 'text-warning-foreground',
    destructive: 'text-destructive-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[t]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-2xs font-medium text-muted-foreground">
          {label}
          {help && <HelpTooltip label={help} />}
        </div>
        <div className={`text-lg font-bold ${valueColor[t]}`}>{value}</div>
        {sub && <div className="truncate text-2xs text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}
