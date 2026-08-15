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
  Download,
  Eye,
  Users,
  UserPlus,
  FileText,
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
import {
  Skeleton,
  SkeletonFilters,
  SkeletonStatCards,
  SkeletonTable,
} from '@/components/ui/Skeleton';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { Pager } from '@/components/ui/Pager';
import { getClassDotColor } from '@/lib/subject-visuals';
import { exportToCsv } from '@/lib/csv-export';
import type { TeacherOption } from '@/components/school/TeacherPicker';
import { ClassFormModal } from './ClassFormModal';
import type { ClassData } from './types';

const PAGE_SIZE = 10;

interface SchoolInfo {
  academicYear: { label: string } | null;
}

export default function ClassesPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [classes, setClasses] = useState<ClassData[] | null>(null);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ClassData | 'new' | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ classes: ClassData[] }>('/api/school/classes'),
      api<{ teachers: TeacherOption[] }>('/api/school/teachers'),
      api<SchoolInfo>('/api/school'),
    ])
      .then(([c, t, s]) => {
        setClasses(c.classes);
        setTeachers(t.teachers);
        setSchool(s);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les classes.');
      });
  }, [user, router]);

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
    if (!window.confirm(`Supprimer la classe « ${cls.name} » ?`)) return;
    try {
      await api(`/api/school/classes/${cls.id}`, { method: 'DELETE' });
      setClasses((prev) => (prev ? prev.filter((c) => c.id !== cls.id) : prev));
      toast('Classe supprimée.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  function onExport() {
    exportToCsv(
      'classes.csv',
      ['Classe', 'Niveau', 'Salle', 'Professeur principal', 'Capacité', 'Matières'],
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
        label: 'Voir la classe',
        icon: <Eye size={14} />,
        onClick: () => toast('Fiche classe détaillée — disponible avec Epic 5 (Élèves).', 'info'),
      },
      { label: 'Modifier', icon: <Pencil size={14} />, onClick: () => setEditing(c) },
      {
        label: 'Gérer les élèves',
        icon: <Users size={14} />,
        onClick: () => toast('Disponible avec Epic 5 (Élèves).', 'info'),
      },
      { label: 'Affecter enseignants', icon: <UserPlus size={14} />, onClick: () => setEditing(c) },
      {
        label: 'Voir les matières',
        icon: <BookOpen size={14} />,
        onClick: () => router.push(`/configuration/coefficients?classId=${c.id}`),
      },
      {
        label: 'Bulletins de la classe',
        icon: <FileText size={14} />,
        onClick: () => toast('Disponible avec Epic 7 (Bulletins).', 'info'),
      },
      {
        label: 'Supprimer la classe',
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
    <div className="flex min-h-full flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Classes</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Gestion des classes de l&apos;établissement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="w-fit" onClick={onExport}>
            <Download size={14} />
            Exporter
          </Button>
          <Button className="w-fit" onClick={() => setEditing('new')}>
            <Plus size={14} />
            Ajouter une classe
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
            <SummaryCard icon={SchoolIcon} label="Total classes" value={stats.total} />
            <SummaryCard
              icon={Layers}
              label="Niveaux distincts"
              value={stats.levels}
              tone="success"
            />
            <SummaryCard
              icon={UserCheck}
              label="Prof. principal assigné"
              value={`${stats.withHomeroom} / ${stats.total}`}
              tone="blue"
            />
            <SummaryCard
              icon={BookOpen}
              label="Matières / classe (moy.)"
              value={stats.avgSubjects}
              tone="warning"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une classe..."
              className="max-w-[260px]"
            />
            <FilterSelect value={level} onValueChange={setLevel}>
              <SelectItem value="">Tous niveaux</SelectItem>
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
              title="Sélecteur multi-année à venir — une seule année scolaire active pour l'instant"
            >
              <SelectItem value={school?.academicYear?.label ?? ''}>
                {school?.academicYear?.label ?? 'Aucune année active'}
              </SelectItem>
            </FilterSelect>
            <span className="text-sm text-muted-foreground">{filtered.length} classes</span>
            <ViewToggle view={view} onChange={setView} className="ml-auto" />
          </div>

          {filtered.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">
                {classes.length === 0 ? 'Aucune classe — ajoute la première.' : 'Aucun résultat.'}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {paged.map((c) => (
                <Card key={c.id} className="gap-3 p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-foreground">{c.name}</div>
                      <div className="mt-0.5 truncate text-2xs text-muted-foreground">
                        {c.room ?? 'Salle non renseignée'}
                      </div>
                    </div>
                    <ActionMenu items={menuItemsFor(c)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge>{c.level}</Badge>
                    <Badge tone="success">Active</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-foreground">
                    {c.homeroomTeacher ? (
                      <>
                        <Avatar name={c.homeroomTeacher.name} size={20} />
                        <span className="truncate">{c.homeroomTeacher.name}</span>
                        <span className="shrink-0 text-muted-foreground">· Prof. principal</span>
                      </>
                    ) : (
                      <span className="italic text-muted-foreground">
                        Professeur principal non affecté
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
                    <Link
                      href={`/configuration/coefficients?classId=${c.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {c.subjectCount} matières
                    </Link>
                    <span className="text-muted-foreground">— / {c.capacity ?? '—'} places</span>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex-1">
              <div className="flex-1 overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Classe</Th>
                      <Th>Niveau</Th>
                      <Th>Professeur principal</Th>
                      <Th>Élèves</Th>
                      <Th>Matières</Th>
                      <Th>Moyenne générale</Th>
                      <Th>Statut</Th>
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
                              style={{ background: getClassDotColor(c.id) }}
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
                            <span className="italic text-muted-foreground">Non affecté</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-foreground">
                          <span className="font-semibold">—</span>
                          <span className="text-muted-foreground">
                            {' '}
                            / {c.capacity ?? '—'} places
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Link
                            href={`/configuration/coefficients?classId=${c.id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {c.subjectCount}
                          </Link>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">—</td>
                        <td className="px-3.5 py-2.5">
                          <Badge tone="success">Active</Badge>
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

      {editing && (
        <ClassFormModal
          cls={editing === 'new' ? null : editing}
          teachers={teachers}
          onClose={() => setEditing(null)}
          onSaved={(saved) =>
            setClasses((prev) => {
              if (!prev) return prev;
              const exists = prev.some((c) => c.id === saved.id);
              return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved];
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
