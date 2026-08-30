'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  School as SchoolIcon,
  UserCheck,
  BookOpen,
  Layers,
  Pencil,
  Trash2,
  Plus,
  Eye,
  FileSpreadsheet,
  Users,
  UserPlus,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
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
import { ViewToggle } from '@/components/ui/ViewToggle';
import { Pager } from '@/components/ui/Pager';
import { CardGrid } from '@/components/school/CardGrid';
import { getClassDotColor, tintOf } from '@/lib/subject-visuals';
import { exportToCsv } from '@/lib/csv-export';
import { GRID_SCROLL, LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import type { ClassData } from './types';

const PAGE_SIZE = 20;

interface SchoolInfo {
  academicYear: { label: string } | null;
}

export default function ClassesPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const t = useTranslations('Configuration.classes.list');
  const tCommon = useTranslations('Common');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);

  const onNoSchool = (err: unknown) => {
    if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
      router.replace('/');
      return true;
    }
  };
  const {
    data: classesData,
    error: classesErr,
    mutate: mutateClasses,
  } = useApi<{ classes: ClassData[] }>('/api/school/classes', { skip: !user, onError: onNoSchool });
  const { data: school, error: schoolErr } = useApi<SchoolInfo>('/api/school', {
    skip: !user,
    onError: onNoSchool,
  });
  const classes = classesData?.classes ?? null;
  const error = classesErr || schoolErr ? t('loadError') : null;

  const levels = useMemo(() => [...new Set((classes ?? []).map((c) => c.level))], [classes]);

  const filtered = useMemo(() => {
    return (classes ?? []).filter((c) => {
      if (level && c.level !== level) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [classes, search, level]);

  useEffect(() => {
    setPage(1);
  }, [search, level]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const all = classes ?? [];
    const withHomeroom = all.filter((c) => c.homeroomTeacher).length;
    const avgSubjects = all.length
      ? Math.round((all.reduce((sum, c) => sum + c.subjectCount, 0) / all.length) * 10) / 10
      : 0;
    return {
      total: all.length,
      levels: new Set(all.map((c) => c.level)).size,
      withHomeroom,
      avgSubjects,
    };
  }, [classes]);

  async function onDelete(cls: ClassData) {
    if (!(await confirm({ message: t('deleteConfirm', { name: cls.name }), danger: true }))) return;
    try {
      await api(`/api/school/classes/${cls.id}`, { method: 'DELETE' });
      mutateClasses((prev) =>
        prev ? { classes: prev.classes.filter((c) => c.id !== cls.id) } : { classes: [] },
      );
      toast(t('classDeleted'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  function onExport() {
    exportToCsv(
      'classes.csv',
      [
        t('csv.class'),
        t('csv.level'),
        t('csv.room'),
        t('csv.homeroomTeacher'),
        t('csv.capacity'),
        t('csv.subjects'),
      ],
      filtered.map((c) => [
        c.name,
        c.level,
        c.room ?? '',
        c.homeroomTeacher?.name ?? '',
        c.capacity ?? '',
        c.subjectCount,
      ]),
    );
  }

  function menuItemsFor(c: ClassData) {
    return [
      {
        label: t('menu.view'),
        icon: <Eye size={14} />,
        onClick: () => router.push(`/configuration/classes/${c.id}`),
      },
      {
        label: t('menu.edit'),
        icon: <Pencil size={14} />,
        onClick: () => router.push(`/configuration/classes/${c.id}`),
      },
      {
        label: t('menu.manageStudents'),
        icon: <Users size={14} />,
        onClick: () => toast(t('menu.manageStudentsToast'), 'info'),
      },
      {
        label: t('menu.assignTeachers'),
        icon: <UserPlus size={14} />,
        onClick: () => router.push(`/configuration/classes/${c.id}#card-matieres`),
      },
      {
        label: t('menu.viewSubjects'),
        icon: <BookOpen size={14} />,
        onClick: () => router.push(`/configuration/classes/${c.id}#card-matieres`),
      },
      {
        label: t('menu.classBulletins'),
        icon: <FileText size={14} />,
        onClick: () => toast(t('menu.classBulletinsToast'), 'info'),
      },
      {
        label: t('menu.delete'),
        icon: <Trash2 size={14} />,
        onClick: () => onDelete(c),
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
          <Button variant="outline" className="w-fit" onClick={onExport}>
            <FileSpreadsheet size={14} />
            {t('export')}
          </Button>
          <Button className="w-fit" onClick={() => router.push('/configuration/classes/nouvelle')}>
            <Plus size={14} />
            {t('addClass')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classes === null && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonStatCards count={4} />
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={6} />
          </Card>
        </div>
      )}

      {classes !== null && (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <SummaryCard icon={SchoolIcon} label={t('stats.total')} value={stats.total} />
            <SummaryCard
              icon={Layers}
              label={t('stats.levels')}
              value={stats.levels}
              tone="success"
            />
            <SummaryCard
              icon={UserCheck}
              label={t('stats.homeroomAssigned')}
              value={`${stats.withHomeroom} / ${stats.total}`}
              tone="blue"
            />
            <SummaryCard
              icon={BookOpen}
              label={t('stats.avgSubjects')}
              value={stats.avgSubjects}
              tone="warning"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="max-w-[260px]"
            />
            <FilterSelect value={level} onValueChange={setLevel}>
              <SelectItem value="">{t('allLevels')}</SelectItem>
              {levels.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              disabled
              value={school?.academicYear?.label ?? ''}
              onValueChange={() => {}}
              title={t('multiYearComingSoon')}
            >
              <SelectItem value={school?.academicYear?.label ?? ''}>
                {school?.academicYear?.label ?? t('noActiveYear')}
              </SelectItem>
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
                {classes.length === 0 ? t('emptyNoClasses') : t('emptyNoResults')}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <CardGrid className={GRID_SCROLL}>
              {paged.map((c) => (
                <ListCard
                  key={c.id}
                  tile={
                    <ListCardTile
                      {...(c.color
                        ? { style: { background: tintOf(c.color), color: c.color } }
                        : { className: 'bg-secondary text-primary' })}
                    >
                      <SchoolIcon size={18} />
                    </ListCardTile>
                  }
                  title={c.name}
                  href={`/configuration/classes/${c.id}`}
                  subtitle={[c.room ?? t('roomUnset'), c.track].filter(Boolean).join(' · ')}
                  menu={<ActionMenu items={menuItemsFor(c)} />}
                  metaLeft={
                    <ListCardPerson
                      name={c.homeroomTeacher?.name}
                      suffix={t('homeroomSuffix')}
                      emptyLabel={t('homeroomEmpty')}
                    />
                  }
                  metaRight={<Badge>{c.level}</Badge>}
                  footerLeft={
                    <Link
                      href={`/configuration/classes/${c.id}#card-matieres`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {t(c.subjectCount > 1 ? 'subjectCount.other' : 'subjectCount.one', {
                        count: c.subjectCount,
                      })}
                    </Link>
                  }
                  footerRight={
                    <>
                      <span className="font-bold text-foreground">{c.studentCount}</span>
                      {c.capacity != null ? ` / ${c.capacity}` : ''} {t('studentCountSuffix')}
                    </>
                  }
                />
              ))}
            </CardGrid>
          ) : (
            <Card>
              <div className={TABLE_SCROLL}>
                <table className="w-full min-w-[920px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>{t('table.class')}</Th>
                      <Th>{t('table.level')}</Th>
                      <Th>{t('table.homeroomTeacher')}</Th>
                      <Th>{t('table.students')}</Th>
                      <Th>{t('table.subjects')}</Th>
                      <Th>{t('table.average')}</Th>
                      <Th>{t('table.status')}</Th>
                      <Th className="w-[80px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c) => (
                      <tr key={c.id} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: c.color ?? getClassDotColor(c.id) }}
                            />
                            <div>
                              <div className="font-semibold text-foreground">{c.name}</div>
                              {c.room && (
                                <div className="text-2xs text-muted-foreground">{c.room}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge>{c.level}</Badge>
                        </td>
                        <td className="px-3.5 py-2.5 text-foreground">
                          {c.homeroomTeacher ? (
                            <div className="flex items-center gap-1.5">
                              <Avatar name={c.homeroomTeacher.name} size={22} />
                              <span>{c.homeroomTeacher.name}</span>
                            </div>
                          ) : (
                            <span className="italic text-muted-foreground">
                              {t('table.unassigned')}
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-foreground">
                          <span className="font-semibold">{c.studentCount}</span>
                          <span className="text-muted-foreground">
                            {' '}
                            / {c.capacity ?? '—'} {t('table.places')}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Link
                            href={`/configuration/classes/${c.id}#card-matieres`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {c.subjectCount}
                          </Link>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">—</td>
                        <td className="px-3.5 py-2.5">
                          <Badge tone="success">{t('table.active')}</Badge>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <ActionMenu items={menuItemsFor(c)} />
                        </td>
                      </tr>
                    ))}
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
  tone?: 'secondary' | 'success';
}) {
  const toneClasses = {
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-success text-success-foreground',
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
  value: number | string;
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
