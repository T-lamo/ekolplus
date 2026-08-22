'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  Pencil,
  Trash2,
  UserPlus,
  FileSpreadsheet,
  Eye,
  Link as LinkIcon,
  CalendarCheck,
  Mail,
  UserX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
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
import { OverflowTags } from '@/components/ui/OverflowTags';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { Pager } from '@/components/ui/Pager';
import { exportToCsv } from '@/lib/csv-export';
import { CardGrid } from '@/components/school/CardGrid';
import { getSubjectVisual } from '@/lib/subject-visuals';
import { GRID_SCROLL, LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { teacherStatusLabel } from './status-label';
// Code-split: only shown after a click ("Ajouter" / row "Modifier") —
// see the matching StudentFormModal split in eleves/page.tsx for why.
const TeacherFormModal = dynamic(
  () => import('./TeacherFormModal').then((m) => m.TeacherFormModal),
  { ssr: false },
);
import type { TeacherListItem, TeacherStatus } from './types';

const PAGE_SIZE = 20;

interface SubjectOption {
  id: string;
  name: string;
}

const STATUS_TONE: Record<TeacherStatus, 'success' | 'warning' | 'secondary'> = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  INACTIVE: 'secondary',
};

export default function TeachersPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const t = useTranslations('Enseignants.list');
  const tStatus = useTranslations('Enseignants.status');
  const tCommon = useTranslations('Common');
  const [teachers, setTeachers] = useState<TeacherListItem[] | null>(null);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [status, setStatus] = useState<'' | TeacherStatus>('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ teachers: TeacherListItem[] }>('/api/school/teachers?scope=all'),
      api<{ subjects: SubjectOption[] }>('/api/school/subjects'),
    ])
      .then(([t, s]) => {
        setTeachers(t.teachers);
        setSubjects(s.subjects);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError(t('loadError'));
      });
  }, [user, router, refreshKey, t]);

  const filtered = useMemo(() => {
    return (teachers ?? []).filter((t) => {
      if (subjectFilter && !t.subjects.some((s) => s.id === subjectFilter)) return false;
      if (status && t.status !== status) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [teachers, search, subjectFilter, status]);

  useEffect(() => {
    setPage(1);
  }, [search, subjectFilter, status]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function onDelete(row: TeacherListItem) {
    if (!(await confirm({ message: t('deleteConfirm', { name: row.name }), danger: true }))) return;
    try {
      await api(`/api/school/teachers/${row.id}`, { method: 'DELETE' });
      setTeachers((prev) => (prev ? prev.filter((x) => x.id !== row.id) : prev));
      toast(t('toasts.deleted'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  async function onDeactivate(row: TeacherListItem) {
    try {
      await api(`/api/school/teachers/${row.id}`, {
        method: 'PATCH',
        body: { status: 'INACTIVE' },
      });
      setTeachers((prev) =>
        prev ? prev.map((x) => (x.id === row.id ? { ...x, status: 'INACTIVE' } : x)) : prev,
      );
      toast(t('toasts.deactivated'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  async function onSendWhatsapp(row: TeacherListItem) {
    try {
      await api(`/api/school/teachers/${row.id}/send-whatsapp`, { method: 'POST' });
      toast(t('toasts.whatsappSent'), 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'NO_TEACHER_PHONE') {
          toast(t('toasts.whatsappNoPhone'), 'error');
          return;
        }
        if (err.code === 'NOT_CONFIGURED') {
          toast(t('toasts.whatsappNotConfigured'), 'error');
          return;
        }
      }
      toast(t('toasts.whatsappFailed'), 'error');
    }
  }

  function onExport() {
    exportToCsv(
      'enseignants.csv',
      [
        t('csv.teacher'),
        t('csv.subjects'),
        t('csv.classes'),
        t('csv.status'),
        t('csv.weeklyHours'),
        t('csv.contact'),
      ],
      filtered.map((t) => [
        t.name,
        t.subjects.map((s) => s.name).join('; '),
        t.classes.map((c) => c.name).join('; '),
        teacherStatusLabel(t.status, tStatus),
        t.weeklyHours,
        t.email ?? '',
      ]),
    );
  }

  function menuItemsFor(row: TeacherListItem) {
    return [
      {
        label: t('menu.viewProfile'),
        icon: <Eye size={14} />,
        onClick: () => router.push(`/enseignants/${row.id}`),
      },
      {
        label: t('menu.edit'),
        icon: <Pencil size={14} />,
        onClick: () => setEditing(row.id),
      },
      {
        label: t('menu.manageAssignments'),
        icon: <LinkIcon size={14} />,
        onClick: () => router.push('/configuration/matieres'),
      },
      {
        label: t('menu.viewAttendance'),
        icon: <CalendarCheck size={14} />,
        onClick: () => toast(t('menu.viewAttendanceSoon'), 'info'),
      },
      {
        label: t('menu.sendWhatsapp'),
        icon: <Mail size={14} />,
        onClick: () => onSendWhatsapp(row),
      },
      {
        label: t('menu.deactivate'),
        icon: <UserX size={14} />,
        onClick: () => onDeactivate(row),
        divider: true,
      },
      {
        label: t('menu.delete'),
        icon: <Trash2 size={14} />,
        onClick: () => onDelete(row),
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
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          {teachers ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(teachers.length > 1 ? 'countRegistered.other' : 'countRegistered.one', {
                count: teachers.length,
              })}
            </p>
          ) : (
            <Skeleton className="mt-1.5 h-3 w-32" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="w-fit" onClick={onExport}>
            <FileSpreadsheet size={14} />
            {t('export')}
          </Button>
          <Button className="w-fit" onClick={() => setEditing('new')}>
            <UserPlus size={14} />
            {t('addTeacher')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {teachers === null && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={5} />
          </Card>
        </div>
      )}

      {teachers !== null && (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="max-w-[300px]"
            />
            <FilterSelect value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectItem value="">{t('allSubjects')}</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={(v) => setStatus(v as '' | TeacherStatus)}>
              <SelectItem value="">{t('allStatuses')}</SelectItem>
              <SelectItem value="ACTIVE">{tStatus('ACTIVE')}</SelectItem>
              <SelectItem value="ON_LEAVE">{tStatus('ON_LEAVE')}</SelectItem>
              <SelectItem value="INACTIVE">{tStatus('INACTIVE')}</SelectItem>
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
                {teachers.length === 0 ? t('emptyNone') : t('emptyFiltered')}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <CardGrid className={GRID_SCROLL}>
              {paged.map((row) => (
                <ListCard
                  key={row.id}
                  tile={<Avatar name={row.name} size={38} src={row.photoUrl} />}
                  title={row.name}
                  subtitle={row.email ?? '—'}
                  menu={<ActionMenu items={menuItemsFor(row)} />}
                  metaLeft={
                    <OverflowTags
                      items={row.subjects}
                      keyOf={(s) => s.id}
                      renderItem={(s) => {
                        const v = getSubjectVisual(s.name);
                        return (
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap"
                            style={{ background: v.badgeBg, color: v.badgeFg }}
                          >
                            {s.name}
                          </span>
                        );
                      }}
                      emptyLabel={t('noSubject')}
                    />
                  }
                  metaRight={
                    <Badge tone={STATUS_TONE[row.status]}>
                      {teacherStatusLabel(row.status, tStatus)}
                    </Badge>
                  }
                  footerLeft={
                    <span className="truncate text-muted-foreground">
                      {row.classes.map((c) => c.name).join(', ') || t('noClassLabel')}
                    </span>
                  }
                  footerRight={
                    <span className="font-semibold text-foreground">{row.weeklyHours}h/sem.</span>
                  }
                />
              ))}
            </CardGrid>
          ) : (
            <Card>
              <div className={TABLE_SCROLL}>
                <table className="w-full min-w-[960px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>{t('table.teacher')}</Th>
                      <Th>{t('table.subjects')}</Th>
                      <Th>{t('table.classes')}</Th>
                      <Th>{t('table.status')}</Th>
                      <Th>{t('table.weeklyHours')}</Th>
                      <Th>{t('table.contact')}</Th>
                      <Th className="w-[70px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={row.name} size={32} src={row.photoUrl} />
                            <div className="font-semibold text-foreground">{row.name}</div>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <OverflowTags
                            items={row.subjects}
                            keyOf={(s) => s.id}
                            renderItem={(s) => {
                              const v = getSubjectVisual(s.name);
                              return (
                                <span
                                  className="inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap"
                                  style={{ background: v.badgeBg, color: v.badgeFg }}
                                >
                                  {s.name}
                                </span>
                              );
                            }}
                            emptyLabel={t('noSubjectShort')}
                          />
                        </td>
                        <td className="px-3.5 py-2.5">
                          <OverflowTags
                            items={row.classes}
                            keyOf={(c) => c.id}
                            renderItem={(c) => (
                              <span className="inline-flex rounded-full bg-info px-2 py-0.5 text-2xs font-semibold whitespace-nowrap text-info-foreground">
                                {c.name}
                              </span>
                            )}
                            emptyLabel="—"
                          />
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge tone={STATUS_TONE[row.status]}>
                            {teacherStatusLabel(row.status, tStatus)}
                          </Badge>
                        </td>
                        <td className="px-3.5 py-2.5 font-semibold text-foreground">
                          {row.weeklyHours}h
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">{row.email ?? '—'}</td>
                        <td className="px-3.5 py-2.5">
                          <ActionMenu items={menuItemsFor(row)} />
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
        <TeacherFormModal
          teacherId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => setRefreshKey((k) => k + 1)}
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
