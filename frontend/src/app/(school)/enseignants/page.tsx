'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Pencil,
  Trash2,
  UserPlus,
  Download,
  Upload,
  Eye,
  Link as LinkIcon,
  CalendarCheck,
  Mail,
  UserX,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';
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
import { getSubjectVisual } from '@/lib/subject-visuals';
import type { TeacherListItem, TeacherStatus } from './types';

interface SubjectOption {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<TeacherStatus, string> = {
  ACTIVE: 'Actif(ve)',
  ON_LEAVE: 'En congé',
  INACTIVE: 'Inactif(ve)',
};
const STATUS_TONE: Record<TeacherStatus, 'success' | 'warning' | 'secondary'> = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  INACTIVE: 'secondary',
};

export default function TeachersPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<TeacherListItem[] | null>(null);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [status, setStatus] = useState<'' | TeacherStatus>('');
  const [view, setView] = useState<'list' | 'grid'>('list');

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
        setError('Impossible de charger les enseignants.');
      });
  }, [user, router]);

  const filtered = useMemo(() => {
    return (teachers ?? []).filter((t) => {
      if (subjectFilter && !t.subjects.some((s) => s.id === subjectFilter)) return false;
      if (status && t.status !== status) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [teachers, search, subjectFilter, status]);

  async function onDelete(t: TeacherListItem) {
    if (!window.confirm(`Supprimer « ${t.name} » ?`)) return;
    try {
      await api(`/api/school/teachers/${t.id}`, { method: 'DELETE' });
      setTeachers((prev) => (prev ? prev.filter((x) => x.id !== t.id) : prev));
      toast('Enseignant supprimé.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  async function onDeactivate(t: TeacherListItem) {
    try {
      await api(`/api/school/teachers/${t.id}`, { method: 'PATCH', body: { status: 'INACTIVE' } });
      setTeachers((prev) =>
        prev ? prev.map((x) => (x.id === t.id ? { ...x, status: 'INACTIVE' } : x)) : prev,
      );
      toast('Enseignant désactivé.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  function onExport() {
    exportToCsv(
      'enseignants.csv',
      ['Enseignant', 'Matières', 'Classes', 'Statut', 'Heures/sem.', 'Contact'],
      filtered.map((t) => [
        t.name,
        t.subjects.map((s) => s.name).join('; '),
        t.classes.map((c) => c.name).join('; '),
        STATUS_LABEL[t.status],
        t.weeklyHours,
        t.email ?? '',
      ]),
    );
  }

  function menuItemsFor(t: TeacherListItem) {
    return [
      {
        label: 'Voir le profil',
        icon: <Eye size={14} />,
        onClick: () => toast('Fiche enseignant détaillée — bientôt disponible.', 'info'),
      },
      {
        label: 'Modifier',
        icon: <Pencil size={14} />,
        onClick: () => router.push(`/enseignants/${t.id}/modifier`),
      },
      {
        label: 'Gérer les affectations',
        icon: <LinkIcon size={14} />,
        onClick: () => router.push('/configuration/affectations'),
      },
      {
        label: 'Voir les présences',
        icon: <CalendarCheck size={14} />,
        onClick: () => toast('Disponible avec Epic 8 (Présences).', 'info'),
      },
      {
        label: 'Envoyer un message',
        icon: <Mail size={14} />,
        onClick: () => toast('Aucun système de messagerie pour le moment.', 'info'),
      },
      {
        label: 'Désactiver',
        icon: <UserX size={14} />,
        onClick: () => onDeactivate(t),
        divider: true,
      },
      {
        label: 'Supprimer',
        icon: <Trash2 size={14} />,
        onClick: () => onDelete(t),
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
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Enseignants</h1>
          {teachers ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {teachers.length} enseignants enregistrés
            </p>
          ) : (
            <Skeleton className="mt-1.5 h-3 w-32" />
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
          <Button className="w-fit" onClick={() => router.push('/enseignants/nouveau')}>
            <UserPlus size={14} />
            Ajouter un enseignant
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
              placeholder="Rechercher un enseignant..."
              className="max-w-[300px]"
            />
            <FilterSelect value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectItem value="">Toutes les matières</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={(v) => setStatus(v as '' | TeacherStatus)}>
              <SelectItem value="">Tous les statuts</SelectItem>
              <SelectItem value="ACTIVE">Actif(ve)</SelectItem>
              <SelectItem value="ON_LEAVE">En congé</SelectItem>
              <SelectItem value="INACTIVE">Inactif(ve)</SelectItem>
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
                {teachers.length === 0
                  ? 'Aucun enseignant — ajoute le premier.'
                  : 'Aucun résultat.'}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((t) => (
                <Card key={t.id} className="gap-3 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={t.name} size={36} src={t.photoUrl} />
                      <div>
                        <div className="font-bold text-foreground">{t.name}</div>
                        {t.email && (
                          <div className="text-[11px] text-muted-foreground">{t.email}</div>
                        )}
                      </div>
                    </div>
                    <ActionMenu items={menuItemsFor(t)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {t.subjects.map((s) => {
                      const v = getSubjectVisual(s.name);
                      return (
                        <span
                          key={s.id}
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: v.badgeBg, color: v.badgeFg }}
                        >
                          {s.name}
                        </span>
                      );
                    })}
                    <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                    <span>{t.classes.map((c) => c.name).join(', ') || 'Aucune classe'}</span>
                    <span className="font-semibold text-foreground">{t.weeklyHours}h/sem.</span>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Enseignant</Th>
                    <Th>Matière(s)</Th>
                    <Th>Classes assignées</Th>
                    <Th>Statut</Th>
                    <Th>Heures/sem.</Th>
                    <Th>Contact</Th>
                    <Th className="w-[70px]" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="border-b border-border last:border-none">
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={t.name} size={32} src={t.photoUrl} />
                          <div className="font-semibold text-foreground">{t.name}</div>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {t.subjects.length > 0 ? (
                            t.subjects.map((s) => {
                              const v = getSubjectVisual(s.name);
                              return (
                                <span
                                  key={s.id}
                                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                  style={{ background: v.badgeBg, color: v.badgeFg }}
                                >
                                  {s.name}
                                </span>
                              );
                            })
                          ) : (
                            <span className="italic text-muted-foreground">Aucune</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground">
                        {t.classes.map((c) => c.name).join(', ') || '—'}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold text-foreground">
                        {t.weeklyHours}h
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground">{t.email ?? '—'}</td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1">
                          <IconButton
                            onClick={() => router.push(`/enseignants/${t.id}/modifier`)}
                            label="Modifier"
                          >
                            <Pencil size={14} />
                          </IconButton>
                          <ActionMenu items={menuItemsFor(t)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
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

function IconButton({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
    >
      {children}
    </button>
  );
}
