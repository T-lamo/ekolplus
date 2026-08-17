'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Pencil,
  Trash2,
  UserPlus,
  Download,
  Upload,
  Eye,
  FileText,
  CalendarCheck,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { CardGrid } from '@/components/school/CardGrid';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { ListCard } from '@/components/school/ListCard';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton, SkeletonFilters, SkeletonTable } from '@/components/ui/Skeleton';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { Pager } from '@/components/ui/Pager';
import { exportToCsv } from '@/lib/csv-export';
import { StudentFormModal } from './StudentFormModal';
import type { ClassOption, StudentListItem, StudentStatus } from './types';

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<StudentStatus, string> = {
  ENROLLED: 'Inscrit(e)',
  REPEATED_ABSENCES: 'Absences',
  SUSPENDED: 'Suspendu(e)',
};
const STATUS_TONE: Record<StudentStatus, 'success' | 'warning' | 'secondary'> = {
  ENROLLED: 'success',
  REPEATED_ABSENCES: 'warning',
  SUSPENDED: 'secondary',
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function StudentsPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [students, setStudents] = useState<StudentListItem[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [status, setStatus] = useState<'' | StudentStatus>('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ students: StudentListItem[] }>('/api/school/students'),
      api<{ classes: ClassOption[] }>('/api/school/classes'),
    ])
      .then(([s, c]) => {
        setStudents(s.students);
        setClasses(c.classes);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les élèves.');
      });
  }, [user, router, refreshKey]);

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
    if (!window.confirm(`Supprimer « ${s.firstName} ${s.lastName} » ?`)) return;
    try {
      await api(`/api/school/students/${s.id}`, { method: 'DELETE' });
      setStudents((prev) => (prev ? prev.filter((x) => x.id !== s.id) : prev));
      toast('Élève supprimé.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  async function onSuspend(s: StudentListItem) {
    try {
      await api(`/api/school/students/${s.id}`, { method: 'PATCH', body: { status: 'SUSPENDED' } });
      setStudents((prev) =>
        prev ? prev.map((x) => (x.id === s.id ? { ...x, status: 'SUSPENDED' } : x)) : prev,
      );
      toast('Élève suspendu.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  function onExport() {
    exportToCsv(
      'eleves.csv',
      ['Élève', 'Numéro', 'Classe', 'Date de naissance', 'Statut'],
      filtered.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.studentNumber,
        s.class?.name ?? '',
        fmtDate(s.dateOfBirth),
        STATUS_LABEL[s.status],
      ]),
    );
  }

  function openEdit(s: StudentListItem) {
    setEditing(s.id);
  }

  function menuItemsFor(s: StudentListItem) {
    return [
      {
        label: 'Voir le profil',
        icon: <Eye size={14} />,
        onClick: () => router.push(`/eleves/${s.id}`),
      },
      { label: 'Modifier', icon: <Pencil size={14} />, onClick: () => openEdit(s) },
      {
        label: 'Voir le bulletin',
        icon: <FileText size={14} />,
        onClick: () => toast('Disponible avec Epic 7 (Bulletins).', 'info'),
      },
      {
        label: 'Présences',
        icon: <CalendarCheck size={14} />,
        onClick: () => toast('Disponible avec Epic 8 (Présences).', 'info'),
      },
      {
        label: 'Suspendre',
        icon: <UserX size={14} />,
        onClick: () => onSuspend(s),
        divider: true,
      },
      {
        label: 'Supprimer',
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
    <div className="flex min-h-full flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Élèves</h1>
          {students ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {students.length} élèves inscrits
            </p>
          ) : (
            <Skeleton className="mt-1.5 h-3 w-28" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => toast('Import CSV — bientôt disponible.', 'info')}
          >
            <Upload size={14} />
            Importer
          </Button>
          <Button variant="outline" className="w-fit" onClick={onExport}>
            <Download size={14} />
            Exporter
          </Button>
          <Button className="w-fit" onClick={() => setEditing('new')}>
            <UserPlus size={14} />
            Ajouter un élève
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
              placeholder="Rechercher un élève..."
              className="max-w-[300px]"
            />
            <FilterSelect value={classFilter} onValueChange={setClassFilter}>
              <SelectItem value="">Toutes les classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={(v) => setStatus(v as '' | StudentStatus)}>
              <SelectItem value="">Tous les statuts</SelectItem>
              <SelectItem value="ENROLLED">Inscrit(e)</SelectItem>
              <SelectItem value="REPEATED_ABSENCES">Absences</SelectItem>
              <SelectItem value="SUSPENDED">Suspendu(e)</SelectItem>
            </FilterSelect>
            <span className="text-sm text-muted-foreground">{filtered.length} résultats</span>
            <ViewToggle view={view} onChange={setView} className="ml-auto" />
          </div>

          {filtered.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">
                {students.length === 0 ? 'Aucun élève — ajoute le premier.' : 'Aucun résultat.'}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <CardGrid className="flex-1">
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
                      <span className="text-muted-foreground italic">Sans classe</span>
                    )
                  }
                  metaRight={<Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>}
                  footerLeft={
                    <span className="text-muted-foreground">
                      Naissance{' '}
                      <span className="font-semibold text-foreground">
                        {fmtDate(s.dateOfBirth)}
                      </span>
                    </span>
                  }
                />
              ))}
            </CardGrid>
          ) : (
            <Card className="flex-1">
              <div className="flex-1 overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Élève</Th>
                      <Th>Classe</Th>
                      <Th>Date de naissance</Th>
                      <Th>Statut</Th>
                      <Th>Moyenne</Th>
                      <Th>Présence</Th>
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
                          {fmtDate(s.dateOfBirth)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
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
