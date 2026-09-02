'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Users,
  Pencil,
  Trash2,
  Plus,
  Eye,
  FileSpreadsheet,
  UserPlus,
  Link as LinkIcon,
  Percent,
  Copy,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePermissions } from '@/lib/usePermissions';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { Card } from '@/components/ui/Card';
import { ListCard, ListCardPerson, ListCardTile } from '@/components/school/ListCard';
import { Button } from '@/components/ui/Button';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import {
  Skeleton,
  SkeletonFilters,
  SkeletonStatCards,
  SkeletonTable,
} from '@/components/ui/Skeleton';
import { OverflowTags } from '@/components/ui/OverflowTags';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { Pager } from '@/components/ui/Pager';
import { CardGrid } from '@/components/school/CardGrid';
import { getSubjectVisual } from '@/lib/subject-visuals';
import { exportToCsv } from '@/lib/csv-export';
import { GRID_SCROLL, LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { subjectStatusLabel } from './status-label';
import type { SubjectData } from './types';

const PAGE_SIZE = 20;

type StatusFilter = '' | 'active' | 'unassigned' | 'archived';

function coefficientLabel(coefficients: number[]): string {
  if (coefficients.length === 0) return '—';
  const uniq = [...new Set(coefficients)];
  if (uniq.length === 1) return String(uniq[0]);
  return `${Math.min(...uniq)}–${Math.max(...uniq)}`;
}

export default function MatieresPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const t = useTranslations('Configuration.matieres.list');
  const tCommon = useTranslations('Common');
  const tStatus = useTranslations('Configuration.matieres.status');
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);

  const {
    data: subjectsData,
    error: subjectsErr,
    mutate: mutateSubjects,
  } = useApi<{ subjects: SubjectData[] }>('/api/school/subjects?includeDrafts=1', {
    skip: !user,
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
        router.replace('/');
        return true;
      }
    },
  });
  const subjects = subjectsData?.subjects ?? null;
  const error = subjectsErr ? t('loadError') : null;

  const domains = useMemo(
    () => [...new Set((subjects ?? []).map((s) => s.domain).filter((d): d is string => !!d))],
    [subjects],
  );

  const filtered = useMemo(() => {
    return (subjects ?? []).filter((s) => {
      if (domain && s.domain !== domain) return false;
      if (status === 'archived' && s.isActive) return false;
      if (status === 'active' && (!s.isActive || s.classes.length === 0)) return false;
      if (status === 'unassigned' && (!s.isActive || s.classes.length > 0)) return false;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [subjects, search, domain, status]);

  useEffect(() => {
    setPage(1);
  }, [search, domain, status]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const all = subjects ?? [];
    return {
      total: all.length,
      active: all.filter((s) => s.isActive && s.classes.length > 0).length,
      unassigned: all.filter((s) => s.isActive && s.classes.length === 0).length,
      teachers: new Set(all.flatMap((s) => s.teacherNames)).size,
    };
  }, [subjects]);

  const { can, canSee } = usePermissions();
  if (!canSee('configuration')) return <AccessDenied />;

  async function onDelete(subject: SubjectData) {
    if (!(await confirm({ message: t('deleteConfirm', { name: subject.name }), danger: true })))
      return;
    try {
      await api(`/api/school/subjects/${subject.id}`, { method: 'DELETE' });
      mutateSubjects((prev) =>
        prev ? { subjects: prev.subjects.filter((s) => s.id !== subject.id) } : { subjects: [] },
      );
      toast(t('subjectDeleted'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  async function onToggleArchive(subject: SubjectData) {
    try {
      const res = await api<{ subject: { isActive: boolean; status: SubjectData['status'] } }>(
        `/api/school/subjects/${subject.id}`,
        {
          method: 'PATCH',
          body: { status: subject.isActive ? 'ARCHIVED' : 'ACTIVE' },
        },
      );
      mutateSubjects((prev) =>
        prev
          ? {
              subjects: prev.subjects.map((s) =>
                s.id === subject.id
                  ? { ...s, isActive: res.subject.isActive, status: res.subject.status }
                  : s,
              ),
            }
          : { subjects: [] },
      );
      toast(res.subject.isActive ? t('unarchived') : t('archived'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  function onExport() {
    exportToCsv(
      'matieres.csv',
      [
        t('csv.subject'),
        t('csv.code'),
        t('csv.domain'),
        t('csv.coefficient'),
        t('csv.teachers'),
        t('csv.classes'),
        t('csv.status'),
      ],
      filtered.map((s) => [
        s.name,
        s.code ?? '',
        s.domain ?? '',
        coefficientLabel(s.coefficients),
        s.teacherNames.join('; '),
        s.classes.map((c) => c.name).join('; '),
        s.status !== 'ACTIVE'
          ? subjectStatusLabel(s.status, tStatus)
          : s.classes.length > 0
            ? tStatus('ACTIVE')
            : tStatus('unassigned'),
      ]),
    );
  }

  function menuItemsFor(s: SubjectData) {
    return [
      {
        label: t('menu.view'),
        icon: <Eye size={14} />,
        onClick: () => router.push(`/configuration/matieres/${s.id}`),
      },
      {
        label: t('menu.edit'),
        icon: <Pencil size={14} />,
        onClick: () => router.push(`/configuration/matieres/${s.id}`),
      },
      {
        label: t('menu.assignTeacher'),
        icon: <UserPlus size={14} />,
        onClick: () => router.push(`/configuration/matieres/${s.id}?tab=affectations`),
      },
      {
        label: t('menu.manageAssignments'),
        icon: <LinkIcon size={14} />,
        onClick: () => router.push(`/configuration/matieres/${s.id}?tab=affectations`),
      },
      {
        label: t('menu.editCoefficient'),
        icon: <Percent size={14} />,
        onClick: () => router.push(`/configuration/matieres/${s.id}`),
      },
      {
        label: t('menu.duplicate'),
        icon: <Copy size={14} />,
        onClick: () => toast(t('duplicateComingSoon'), 'info'),
        divider: true,
      },
      {
        label: s.isActive ? t('menu.archive') : t('menu.unarchive'),
        icon: s.isActive ? <Archive size={14} /> : <ArchiveRestore size={14} />,
        onClick: () => onToggleArchive(s),
      },
      {
        label: t('menu.delete'),
        icon: <Trash2 size={14} />,
        onClick: () => onDelete(s),
        tone: 'danger' as const,
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

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
            <HelpTooltip label={t('help.pageOverview')} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('configuration', 'export') && (
            <Button variant="outline" className="w-fit" onClick={onExport}>
              <FileSpreadsheet size={14} />
              {t('export')}
            </Button>
          )}
          {can('configuration', 'create') && (
            <Button
              className="w-fit"
              onClick={() => router.push('/configuration/matieres/nouvelle')}
            >
              <Plus size={14} />
              {t('addSubject')}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {subjects === null && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonStatCards count={4} />
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={6} />
          </Card>
        </div>
      )}

      {subjects !== null && (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <SummaryCard icon={BookOpen} label={t('stats.total')} value={stats.total} />
            <SummaryCard
              icon={CheckCircle2}
              label={t('stats.active')}
              value={stats.active}
              tone="success"
            />
            <SummaryCard
              icon={AlertCircle}
              label={t('stats.unassigned')}
              value={stats.unassigned}
              tone="warning"
            />
            <SummaryCard
              icon={Users}
              label={t('stats.teachers')}
              value={stats.teachers}
              tone="blue"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="max-w-[260px]"
            />
            <FilterSelect value={domain} onValueChange={setDomain}>
              <SelectItem value="">{t('allDomains')}</SelectItem>
              {domains.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectItem value="">{t('allStatuses')}</SelectItem>
              <SelectItem value="active">{tStatus('ACTIVE')}</SelectItem>
              <SelectItem value="unassigned">{tStatus('unassigned')}</SelectItem>
              <SelectItem value="archived">{tStatus('ARCHIVED')}</SelectItem>
            </FilterSelect>
            <span className="text-sm text-muted-foreground">
              {t(filtered.length > 1 ? 'resultCount.other' : 'resultCount.one', {
                count: filtered.length,
              })}
            </span>
            {/* Table view needs real width to be usable — mobile always
                gets the card grid instead, so the toggle (and the way to
                reach the table) only shows from `md` up. */}
            <div className="ml-auto hidden md:block">
              <ViewToggle view={view} onChange={setView} />
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">
                {subjects.length === 0 ? t('emptyNoSubjects') : t('emptyNoResults')}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <CardGrid className={GRID_SCROLL}>
              {paged.map((s) => {
                const visual = getSubjectVisual(s.name, { icon: s.icon, color: s.color });
                const status =
                  s.status === 'DRAFT' ? (
                    <Badge>{tStatus('DRAFT')}</Badge>
                  ) : !s.isActive ? (
                    <Badge>{tStatus('ARCHIVED')}</Badge>
                  ) : s.classes.length > 0 ? (
                    <Badge tone="success">{tStatus('ACTIVE')}</Badge>
                  ) : (
                    <Badge tone="warning">{tStatus('unassigned')}</Badge>
                  );
                return (
                  <ListCard
                    key={s.id}
                    tile={
                      <ListCardTile style={{ background: visual.iconBg, color: visual.iconFg }}>
                        <visual.Icon size={18} />
                      </ListCardTile>
                    }
                    title={s.name}
                    href={`/configuration/matieres/${s.id}`}
                    subtitle={[s.code, s.domain].filter(Boolean).join(' · ') || '—'}
                    menu={<ActionMenu items={menuItemsFor(s)} />}
                    metaLeft={
                      <ListCardPerson
                        name={s.teacherNames[0]}
                        suffix={
                          s.teacherNames.length > 1 ? `+${s.teacherNames.length - 1}` : undefined
                        }
                      />
                    }
                    metaRight={status}
                    footerLeft={
                      <OverflowTags
                        items={s.classes}
                        keyOf={(c) => c.id}
                        renderItem={(c) => <Badge>{c.name}</Badge>}
                        emptyLabel={t('noClasses')}
                      />
                    }
                    footerRight={
                      <>
                        Coef.{' '}
                        <span className="font-bold text-foreground">
                          {coefficientLabel(s.coefficients)}
                        </span>
                      </>
                    }
                  />
                );
              })}
            </CardGrid>
          ) : (
            <Card>
              <div className={TABLE_SCROLL}>
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>{t('table.subject')}</Th>
                      <Th>{t('table.domain')}</Th>
                      <Th>
                        <span className="inline-flex items-center gap-1">
                          {t('table.coefficient')}
                          <HelpTooltip label={t('help.coefficientColumn')} />
                        </span>
                      </Th>
                      <Th>{t('table.assignedTeacher')}</Th>
                      <Th>{t('table.classes')}</Th>
                      <Th>{t('table.evaluationCount')}</Th>
                      <Th>{t('table.status')}</Th>
                      <Th className="w-[80px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => {
                      const visual = getSubjectVisual(s.name, { icon: s.icon, color: s.color });
                      return (
                        <tr key={s.id} className="border-b border-border last:border-none">
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                                style={{ background: visual.iconBg, color: visual.iconFg }}
                              >
                                <visual.Icon size={16} />
                              </div>
                              <div>
                                <div className="font-semibold text-foreground">{s.name}</div>
                                {s.code && (
                                  <div className="text-2xs text-muted-foreground">{s.code}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            {s.domain ? (
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap"
                                style={{ background: visual.badgeBg, color: visual.badgeFg }}
                              >
                                {s.domain}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 font-bold text-foreground">
                            {coefficientLabel(s.coefficients)}
                          </td>
                          <td className="px-3.5 py-2.5 text-foreground">
                            {s.teacherNames.length > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <Avatar name={s.teacherNames[0]!} size={22} />
                                <span>
                                  {s.teacherNames[0]}
                                  {s.teacherNames.length > 1 && ` +${s.teacherNames.length - 1}`}
                                </span>
                              </div>
                            ) : (
                              <span className="italic text-muted-foreground">
                                {t('unassignedLabel')}
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <OverflowTags
                              items={s.classes}
                              keyOf={(c) => c.id}
                              renderItem={(c) => <Badge>{c.name}</Badge>}
                              emptyLabel={t('noClasses')}
                            />
                          </td>
                          <td className="px-3.5 py-2.5 text-muted-foreground">—</td>
                          <td className="px-3.5 py-2.5">
                            {s.status === 'DRAFT' ? (
                              <Badge>{tStatus('DRAFT')}</Badge>
                            ) : !s.isActive ? (
                              <Badge>{tStatus('ARCHIVED')}</Badge>
                            ) : s.classes.length > 0 ? (
                              <Badge tone="success">{tStatus('ACTIVE')}</Badge>
                            ) : (
                              <Badge tone="warning">{tStatus('unassigned')}</Badge>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <ActionMenu items={menuItemsFor(s)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager
                centered
                page={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onChange={setPage}
              />
            </Card>
          )}
          {view === 'grid' && filtered.length > 0 && (
            <Pager
              centered
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onChange={setPage}
            />
          )}
        </>
      )}
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

function Badge({
  children,
  tone = 'secondary',
}: {
  children: ReactNode;
  tone?: 'secondary' | 'success' | 'warning';
}) {
  const toneClasses = {
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = 'secondary',
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
  tone?: 'secondary' | 'success' | 'warning' | 'blue';
}) {
  const iconWrap = {
    secondary: 'bg-secondary text-primary',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
    blue: 'bg-info text-info-foreground',
  } as const;
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconWrap[tone]}`}
      >
        <Icon size={17} />
      </div>
      <div>
        <div className="text-2xs font-medium text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-foreground">{value}</div>
      </div>
    </Card>
  );
}
