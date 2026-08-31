'use client';

// Mes élèves — the teacher-portal twin of the school /eleves screen: same
// toolbar (search + class/subject/status filters), same grid/table views,
// same table anatomy, minus every mutation affordance (no add/edit/delete,
// no ActionMenu). Data comes exclusively from /api/teacher/* reads; the
// subject filter is resolved client-side through my classSubjects (subject
// -> the classes where I teach it), since the students payload is flat.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FileSpreadsheet } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { CardGrid } from '@/components/school/CardGrid';
import { ListCard } from '@/components/school/ListCard';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton, SkeletonFilters, SkeletonTable } from '@/components/ui/Skeleton';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { Pager } from '@/components/ui/Pager';
import { exportToCsv } from '@/lib/csv-export';
import { GRID_SCROLL, LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';

const PAGE_SIZE = 20;

type StudentStatus = 'ENROLLED' | 'REPEATED_ABSENCES' | 'SUSPENDED';

const STATUS_TONE: Record<StudentStatus, 'success' | 'warning' | 'secondary'> = {
  ENROLLED: 'success',
  REPEATED_ABSENCES: 'warning',
  SUSPENDED: 'secondary',
};

interface TeacherStudentRow {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  photoUrl: string | null;
  status: StudentStatus;
  classId: string;
  className: string;
  classLevel: string;
}

interface TeacherMeFiltersResponse {
  homeroomClasses: { id: string; name: string }[];
  classSubjects: {
    id: string;
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
  }[];
}

export default function TeacherStudentsPage() {
  const t = useTranslations('TeacherStudents.list');
  const tEleves = useTranslations('Eleves.list');
  const tStatus = useTranslations('Eleves.list.status');
  const tTeacherClasses = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [status, setStatus] = useState<'' | StudentStatus>('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);

  const { data: studentsData, error: studentsErr } = useApi<{ students: TeacherStudentRow[] }>(
    '/api/teacher/students',
  );
  const { data: me, error: meErr } = useApi<TeacherMeFiltersResponse>('/api/teacher/me');
  const students = studentsData?.students ?? null;
  const error = studentsErr || meErr ? tPortal('loadError') : null;

  const classOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const c of me?.homeroomClasses ?? []) byId.set(c.id, c.name);
    for (const cs of me?.classSubjects ?? []) byId.set(cs.classId, cs.className);
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [me]);

  const subjectOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const cs of me?.classSubjects ?? []) byId.set(cs.subjectId, cs.subjectName);
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [me]);

  const subjectClassIds = useMemo(() => {
    if (!subjectFilter) return null;
    return new Set(
      (me?.classSubjects ?? [])
        .filter((cs) => cs.subjectId === subjectFilter)
        .map((cs) => cs.classId),
    );
  }, [me, subjectFilter]);

  const filtered = useMemo(() => {
    return (students ?? []).filter((s) => {
      if (classFilter && s.classId !== classFilter) return false;
      if (subjectClassIds && !subjectClassIds.has(s.classId)) return false;
      if (status && s.status !== status) return false;
      if (search && !`${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [students, search, classFilter, subjectClassIds, status]);

  useEffect(() => {
    setPage(1);
  }, [search, classFilter, subjectFilter, status]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function onExport() {
    exportToCsv(
      'mes-eleves.csv',
      [tEleves('csv.student'), tEleves('csv.number'), tEleves('csv.class'), tEleves('csv.status')],
      filtered.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.studentNumber,
        s.className,
        tStatus(s.status),
      ]),
    );
  }

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          {students ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('count', { count: students.length })}
            </p>
          ) : (
            <Skeleton className="mt-1.5 h-3 w-28" />
          )}
        </div>
        <Button variant="outline" className="w-fit" onClick={onExport}>
          <FileSpreadsheet size={14} />
          {tEleves('export')}
        </Button>
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
            <SkeletonTable rows={8} cols={4} />
          </Card>
        </div>
      )}

      {students !== null && (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tEleves('searchPlaceholder')}
              className="max-w-[300px]"
            />
            <FilterSelect value={classFilter} onValueChange={setClassFilter}>
              <SelectItem value="">{tEleves('allClasses')}</SelectItem>
              {classOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectItem value="">{t('allSubjects')}</SelectItem>
              {subjectOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={(v) => setStatus(v as '' | StudentStatus)}>
              <SelectItem value="">{tEleves('allStatuses')}</SelectItem>
              <SelectItem value="ENROLLED">{tStatus('ENROLLED')}</SelectItem>
              <SelectItem value="REPEATED_ABSENCES">{tStatus('REPEATED_ABSENCES')}</SelectItem>
              <SelectItem value="SUSPENDED">{tStatus('SUSPENDED')}</SelectItem>
            </FilterSelect>
            <span className="text-sm text-muted-foreground">
              {tEleves(filtered.length > 1 ? 'resultsCount.other' : 'resultsCount.one', {
                count: filtered.length,
              })}
            </span>
            <div className="ml-auto hidden md:block">
              <ViewToggle view={view} onChange={setView} />
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">
                {students.length === 0 ? t('emptyNone') : tEleves('emptyFiltered')}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <CardGrid className={GRID_SCROLL}>
              {paged.map((s) => (
                <ListCard
                  key={s.id}
                  tile={<Avatar name={`${s.firstName} ${s.lastName}`} size={38} src={s.photoUrl} />}
                  title={`${s.firstName} ${s.lastName}`}
                  href={`/espace-enseignant/eleves/${s.id}`}
                  subtitle={`#${s.studentNumber}`}
                  metaLeft={<Badge>{s.className}</Badge>}
                  metaRight={<Badge tone={STATUS_TONE[s.status]}>{tStatus(s.status)}</Badge>}
                />
              ))}
            </CardGrid>
          ) : (
            <Card>
              <div className={TABLE_SCROLL}>
                <table className="w-full min-w-[680px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>{tEleves('table.student')}</Th>
                      <Th>{tTeacherClasses('table.studentNumber')}</Th>
                      <Th>{tEleves('table.class')}</Th>
                      <Th>{tEleves('table.status')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <Link
                            href={`/espace-enseignant/eleves/${s.id}`}
                            className="flex items-center gap-2.5"
                          >
                            <Avatar
                              name={`${s.firstName} ${s.lastName}`}
                              size={32}
                              src={s.photoUrl}
                            />
                            <span className="font-semibold text-foreground">
                              {s.firstName} {s.lastName}
                            </span>
                          </Link>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">#{s.studentNumber}</td>
                        <td className="px-3.5 py-2.5">
                          <Badge>{s.className}</Badge>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge tone={STATUS_TONE[s.status]}>{tStatus(s.status)}</Badge>
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
