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
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton, SkeletonFilters, SkeletonTable } from '@/components/ui/Skeleton';
import { exportToCsv } from '@/lib/csv-export';
import { StudentFormModal } from './StudentFormModal';
import type { ClassOption, StudentDetail, StudentListItem, StudentStatus } from './types';

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
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [editing, setEditing] = useState<StudentDetail | 'new' | null>(null);

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
  }, [user, router]);

  const filtered = useMemo(() => {
    return (students ?? []).filter((s) => {
      if (classFilter && s.class?.id !== classFilter) return false;
      if (status && s.status !== status) return false;
      if (search && !`${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [students, search, classFilter, status]);

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

  async function openEdit(s: StudentListItem) {
    try {
      const res = await api<{ student: StudentDetail }>(`/api/school/students/${s.id}`);
      setEditing(res.student);
    } catch {
      toast('Impossible de charger le profil.', 'error');
    }
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
    <div className="flex flex-col gap-5">
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
            <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5">
              <button
                type="button"
                onClick={() => setView('list')}
                aria-label="Vue liste"
                aria-pressed={view === 'list'}
                className={`flex h-8 w-8 items-center justify-center rounded ${view === 'list' ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}
              >
                <ListIcon size={15} />
              </button>
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-label="Vue grille"
                aria-pressed={view === 'grid'}
                className={`flex h-8 w-8 items-center justify-center rounded ${view === 'grid' ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}
              >
                <LayoutGrid size={15} />
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">
                {students.length === 0 ? 'Aucun élève — ajoute le premier.' : 'Aucun résultat.'}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => (
                <Card key={s.id} className="gap-3 p-4">
                  <div className="flex items-start justify-between">
                    <Link href={`/eleves/${s.id}`} className="flex items-center gap-2.5">
                      <Avatar name={`${s.firstName} ${s.lastName}`} size={36} src={s.photoUrl} />
                      <div>
                        <div className="font-bold text-foreground">
                          {s.firstName} {s.lastName}
                        </div>
                        <div className="text-[11px] text-muted-foreground">#{s.studentNumber}</div>
                      </div>
                    </Link>
                    <ActionMenu items={menuItemsFor(s)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.class && <Badge>{s.class.name}</Badge>}
                    <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{fmtDate(s.dateOfBirth)}</div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="overflow-x-auto">
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
                  {filtered.map((s) => (
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
                            <div className="text-[11px] text-muted-foreground">
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
            </Card>
          )}
        </>
      )}

      {editing && (
        <StudentFormModal
          student={editing === 'new' ? null : editing}
          classes={classes}
          onClose={() => setEditing(null)}
          onSaved={(saved) =>
            setStudents((prev) => {
              if (!prev) return prev;
              const item: StudentListItem = {
                id: saved.id,
                studentNumber: saved.studentNumber,
                firstName: saved.firstName,
                lastName: saved.lastName,
                photoUrl: saved.photoUrl,
                dateOfBirth: saved.dateOfBirth,
                status: saved.status,
                class: saved.class,
                guardianCount: saved.guardians.length,
              };
              const exists = prev.some((s) => s.id === saved.id);
              return exists ? prev.map((s) => (s.id === saved.id ? item : s)) : [...prev, item];
            })
          }
        />
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
