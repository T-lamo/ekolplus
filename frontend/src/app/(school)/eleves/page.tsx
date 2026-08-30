'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApi } from '@/lib/useApi';
import {
  Pencil,
  Trash2,
  UserPlus,
  FileSpreadsheet,
  Eye,
  FileText,
  CalendarCheck,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { CardGrid } from '@/components/school/CardGrid';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Card } from '@/components/ui/Card';
import { ListCard } from '@/components/school/ListCard';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton, SkeletonFilters, SkeletonTable } from '@/components/ui/Skeleton';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { Pager } from '@/components/ui/Pager';
import { exportToCsv } from '@/lib/csv-export';
import { GRID_SCROLL, LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';
import type { ClassOption, StudentListItem, StudentStatus } from './types';

// Code-split: a ~730-line form (validation, many fields) that's only ever
// shown after a click ("Ajouter un élève" / row "Modifier") — eagerly
// importing it inflated this list page's initial JS for every visitor who
// never opens it.
const StudentFormModal = dynamic(
  () => import('./StudentFormModal').then((m) => m.StudentFormModal),
  { ssr: false },
);

const PAGE_SIZE = 20;

const STATUS_TONE: Record<StudentStatus, 'success' | 'warning' | 'secondary'> = {
  ENROLLED: 'success',
  REPEATED_ABSENCES: 'warning',
  SUSPENDED: 'secondary',
};

function fmtDate(d: string, locale: string): string {
  return new Date(d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function StudentsPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const t = useTranslations('Eleves.list');
  const tStatus = useTranslations('Eleves.list.status');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [status, setStatus] = useState<'' | StudentStatus>('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const onNoSchool = (err: unknown) => {
    if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
      router.replace('/');
      return true;
    }
  };
  const {
    data: studentsData,
    error: studentsErr,
    refresh: refreshStudents,
    mutate: mutateStudents,
  } = useApi<{ students: StudentListItem[] }>('/api/school/students', {
    skip: !user,
    onError: onNoSchool,
  });
  const { data: classesData, error: classesErr } = useApi<{ classes: ClassOption[] }>(
    '/api/school/classes',
    { skip: !user, onError: onNoSchool },
  );
  const students = studentsData?.students ?? null;
  const classes = classesData?.classes ?? [];
  const error = studentsErr || classesErr ? t('loadError') : null;

  const filtered = useMemo(() => {
    return (students ?? []).filter((s) => {
      if (classFilter && s.class?.id !== classFilter) return false;
      if (status && s.status !== status) return false;
      if (search && !`${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [students, search, classFilter, status]);

  useEffect(() => {
    setPage(1);
  }, [search, classFilter, status]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function onDelete(s: StudentListItem) {
    if (
      !(await confirm({
        message: t('deleteConfirm', { name: `${s.firstName} ${s.lastName}` }),
        danger: true,
      }))
    )
      return;
    try {
      await api(`/api/school/students/${s.id}`, { method: 'DELETE' });
      mutateStudents((prev) =>
        prev ? { students: prev.students.filter((x) => x.id !== s.id) } : { students: [] },
      );
      toast(t('toasts.deleted'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  async function onSuspend(s: StudentListItem) {
    try {
      await api(`/api/school/students/${s.id}`, { method: 'PATCH', body: { status: 'SUSPENDED' } });
      mutateStudents((prev) =>
        prev
          ? {
              students: prev.students.map((x) =>
                x.id === s.id ? { ...x, status: 'SUSPENDED' } : x,
              ),
            }
          : { students: [] },
      );
      toast(t('toasts.suspended'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  function onExport() {
    exportToCsv(
      'eleves.csv',
      [t('csv.student'), t('csv.number'), t('csv.class'), t('csv.dateOfBirth'), t('csv.status')],
      filtered.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.studentNumber,
        s.class?.name ?? '',
        fmtDate(s.dateOfBirth, bcp47),
        tStatus(s.status),
      ]),
    );
  }

  function openEdit(s: StudentListItem) {
    setEditing(s.id);
  }

  function menuItemsFor(s: StudentListItem) {
    return [
      {
        label: t('menu.viewProfile'),
        icon: <Eye size={14} />,
        onClick: () => router.push(`/eleves/${s.id}`),
      },
      { label: t('menu.edit'), icon: <Pencil size={14} />, onClick: () => openEdit(s) },
      {
        label: t('menu.viewBulletin'),
        icon: <FileText size={14} />,
        onClick: () => router.push(`/eleves/${s.id}?tab=bulletins`),
      },
      {
        label: t('menu.attendance'),
        icon: <CalendarCheck size={14} />,
        onClick: () => router.push(`/eleves/${s.id}?tab=attendance`),
      },
      {
        label: t('menu.suspend'),
        icon: <UserX size={14} />,
        onClick: () => onSuspend(s),
        divider: true,
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
          {students ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(students.length > 1 ? 'countEnrolled.other' : 'countEnrolled.one', {
                count: students.length,
              })}
            </p>
          ) : (
            <Skeleton className="mt-1.5 h-3 w-28" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="w-fit" onClick={onExport}>
            <FileSpreadsheet size={14} />
            {t('export')}
          </Button>
          <Button className="w-fit" onClick={() => setEditing('new')}>
            <UserPlus size={14} />
            {t('addStudent')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {students === null && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={5} />
          </Card>
        </div>
      )}

      {students !== null && (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="max-w-[300px]"
            />
            <FilterSelect value={classFilter} onValueChange={setClassFilter}>
              <SelectItem value="">{t('allClasses')}</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={(v) => setStatus(v as '' | StudentStatus)}>
              <SelectItem value="">{t('allStatuses')}</SelectItem>
              <SelectItem value="ENROLLED">{tStatus('ENROLLED')}</SelectItem>
              <SelectItem value="REPEATED_ABSENCES">{tStatus('REPEATED_ABSENCES')}</SelectItem>
              <SelectItem value="SUSPENDED">{tStatus('SUSPENDED')}</SelectItem>
            </FilterSelect>
            <span className="text-sm text-muted-foreground">
              {t(filtered.length > 1 ? 'resultsCount.other' : 'resultsCount.one', {
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
                {students.length === 0 ? t('emptyNone') : t('emptyFiltered')}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <CardGrid className={GRID_SCROLL}>
              {paged.map((s) => (
                <ListCard
                  key={s.id}
                  tile={<Avatar name={`${s.firstName} ${s.lastName}`} size={38} src={s.photoUrl} />}
                  title={`${s.firstName} ${s.lastName}`}
                  href={`/eleves/${s.id}`}
                  subtitle={`#${s.studentNumber}`}
                  menu={<ActionMenu items={menuItemsFor(s)} />}
                  metaLeft={
                    s.class ? (
                      <Badge>{s.class.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground italic">{t('noClass')}</span>
                    )
                  }
                  metaRight={<Badge tone={STATUS_TONE[s.status]}>{tStatus(s.status)}</Badge>}
                  footerLeft={
                    <span className="text-muted-foreground">
                      {t('birthPrefix')}{' '}
                      <span className="font-semibold text-foreground">
                        {fmtDate(s.dateOfBirth, bcp47)}
                      </span>
                    </span>
                  }
                />
              ))}
            </CardGrid>
          ) : (
            <Card>
              <div className={TABLE_SCROLL}>
                <table className="w-full min-w-[820px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>{t('table.student')}</Th>
                      <Th>{t('table.class')}</Th>
                      <Th>{t('table.dateOfBirth')}</Th>
                      <Th>
                        <span className="inline-flex items-center gap-1">
                          {t('table.status')}
                          <HelpTooltip label={t('help.statusColumn')} />
                        </span>
                      </Th>
                      <Th>{t('table.average')}</Th>
                      <Th>{t('table.attendance')}</Th>
                      <Th className="w-[70px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <Link href={`/eleves/${s.id}`} className="flex items-center gap-2.5">
                            <Avatar
                              name={`${s.firstName} ${s.lastName}`}
                              size={32}
                              src={s.photoUrl}
                            />
                            <div>
                              <div className="font-semibold text-foreground">
                                {s.firstName} {s.lastName}
                              </div>
                              <div className="text-2xs text-muted-foreground">
                                #{s.studentNumber}
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-3.5 py-2.5">
                          {s.class ? (
                            <Badge>{s.class.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">
                          {fmtDate(s.dateOfBirth, bcp47)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge tone={STATUS_TONE[s.status]}>{tStatus(s.status)}</Badge>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">—</td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">—</td>
                        <td className="px-3.5 py-2.5">
                          <ActionMenu items={menuItemsFor(s)} />
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

      {editing !== null && (
        <StudentFormModal
          studentId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => refreshStudents()}
        />
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
