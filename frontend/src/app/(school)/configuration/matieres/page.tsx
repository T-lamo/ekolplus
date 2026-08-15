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
  Download,
  Eye,
  UserPlus,
  Link as LinkIcon,
  Percent,
  Copy,
  Archive,
  ArchiveRestore,
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
import {
  Skeleton,
  SkeletonFilters,
  SkeletonStatCards,
  SkeletonTable,
} from '@/components/ui/Skeleton';
import { OverflowTags } from '@/components/ui/OverflowTags';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { Pager } from '@/components/ui/Pager';
import { getSubjectVisual } from '@/lib/subject-visuals';
import { exportToCsv } from '@/lib/csv-export';
import { SubjectFormModal } from './SubjectFormModal';
import type { SubjectData } from './types';

const PAGE_SIZE = 10;

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
  const [subjects, setSubjects] = useState<SubjectData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<SubjectData | 'new' | null>(null);

  useEffect(() => {
    if (!user) return;
    api<{ subjects: SubjectData[] }>('/api/school/subjects')
      .then((res) => setSubjects(res.subjects))
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les matières.');
      });
  }, [user, router]);

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

  async function onDelete(subject: SubjectData) {
    if (!window.confirm(`Supprimer la matière « ${subject.name} » ?`)) return;
    try {
      await api(`/api/school/subjects/${subject.id}`, { method: 'DELETE' });
      setSubjects((prev) => (prev ? prev.filter((s) => s.id !== subject.id) : prev));
      toast('Matière supprimée.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  async function onToggleArchive(subject: SubjectData) {
    try {
      const res = await api<{ subject: { isActive: boolean } }>(
        `/api/school/subjects/${subject.id}`,
        {
          method: 'PATCH',
          body: { isActive: !subject.isActive },
        },
      );
      setSubjects((prev) =>
        prev
          ? prev.map((s) => (s.id === subject.id ? { ...s, isActive: res.subject.isActive } : s))
          : prev,
      );
      toast(res.subject.isActive ? 'Matière désarchivée.' : 'Matière archivée.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  function onExport() {
    exportToCsv(
      'matieres.csv',
      ['Matière', 'Code', 'Domaine', 'Coefficient', 'Enseignants', 'Classes', 'Statut'],
      filtered.map((s) => [
        s.name,
        s.code ?? '',
        s.domain ?? '',
        coefficientLabel(s.coefficients),
        s.teacherNames.join('; '),
        s.classes.map((c) => c.name).join('; '),
        !s.isActive ? 'Archivée' : s.classes.length > 0 ? 'Active' : 'Non affectée',
      ]),
    );
  }

  function menuItemsFor(s: SubjectData) {
    return [
      { label: 'Voir les détails', icon: <Eye size={14} />, onClick: () => setEditing(s) },
      { label: 'Modifier la matière', icon: <Pencil size={14} />, onClick: () => setEditing(s) },
      {
        label: 'Assigner un enseignant',
        icon: <UserPlus size={14} />,
        onClick: () => router.push('/configuration/affectations'),
      },
      {
        label: 'Gérer les affectations',
        icon: <LinkIcon size={14} />,
        onClick: () => router.push('/configuration/affectations'),
      },
      {
        label: 'Modifier le coefficient',
        icon: <Percent size={14} />,
        onClick: () => router.push('/configuration/coefficients'),
      },
      {
        label: 'Dupliquer',
        icon: <Copy size={14} />,
        onClick: () => toast('Duplication de matière — bientôt disponible.', 'info'),
        divider: true,
      },
      {
        label: s.isActive ? 'Archiver la matière' : 'Désarchiver la matière',
        icon: s.isActive ? <Archive size={14} /> : <ArchiveRestore size={14} />,
        onClick: () => onToggleArchive(s),
      },
      {
        label: 'Supprimer la matière',
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
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Matières</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Gestion des matières enseignées.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="w-fit" onClick={onExport}>
            <Download size={14} />
            Exporter
          </Button>
          <Button className="w-fit" onClick={() => setEditing('new')}>
            <Plus size={14} />
            Ajouter une matière
          </Button>
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
            <SummaryCard icon={BookOpen} label="Total matières" value={stats.total} />
            <SummaryCard
              icon={CheckCircle2}
              label="Matières actives"
              value={stats.active}
              tone="success"
            />
            <SummaryCard
              icon={AlertCircle}
              label="Non affectées"
              value={stats.unassigned}
              tone="warning"
            />
            <SummaryCard
              icon={Users}
              label="Enseignants assignés"
              value={stats.teachers}
              tone="blue"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une matière..."
              className="max-w-[260px]"
            />
            <FilterSelect value={domain} onValueChange={setDomain}>
              <SelectItem value="">Tous les domaines</SelectItem>
              {domains.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectItem value="">Tous les statuts</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="unassigned">Non affectée</SelectItem>
              <SelectItem value="archived">Archivée</SelectItem>
            </FilterSelect>
            <span className="text-sm text-muted-foreground">{filtered.length} matières</span>
            <ViewToggle view={view} onChange={setView} className="ml-auto" />
          </div>

          {filtered.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">
                {subjects.length === 0 ? 'Aucune matière — ajoute la première.' : 'Aucun résultat.'}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {paged.map((s) => {
                const visual = getSubjectVisual(s.name);
                return (
                  <Card key={s.id} className="gap-3 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                          style={{ background: visual.iconBg, color: visual.iconFg }}
                        >
                          <visual.Icon size={17} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-bold text-foreground">{s.name}</div>
                          {s.code && <div className="text-2xs text-muted-foreground">{s.code}</div>}
                        </div>
                      </div>
                      <ActionMenu items={menuItemsFor(s)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.domain && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap"
                          style={{ background: visual.badgeBg, color: visual.badgeFg }}
                        >
                          {s.domain}
                        </span>
                      )}
                      {!s.isActive ? (
                        <Badge>Archivée</Badge>
                      ) : s.classes.length > 0 ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="warning">Non affectée</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-foreground">
                      {s.teacherNames.length > 0 ? (
                        <>
                          <Avatar name={s.teacherNames[0]!} size={20} />
                          <span className="truncate">
                            {s.teacherNames[0]}
                            {s.teacherNames.length > 1 && ` +${s.teacherNames.length - 1}`}
                          </span>
                        </>
                      ) : (
                        <span className="italic text-muted-foreground">Non assigné</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                      <OverflowTags
                        items={s.classes}
                        keyOf={(c) => c.id}
                        renderItem={(c) => <Badge>{c.name}</Badge>}
                        emptyLabel="Aucune classe"
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Coef.{' '}
                        <span className="font-bold text-foreground">
                          {coefficientLabel(s.coefficients)}
                        </span>
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="flex-1">
              <div className="flex-1 overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Matière</Th>
                      <Th>Domaine</Th>
                      <Th>Coefficient</Th>
                      <Th>Enseignant assigné</Th>
                      <Th>Classes</Th>
                      <Th>Nb. évaluations</Th>
                      <Th>Statut</Th>
                      <Th className="w-[80px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => {
                      const visual = getSubjectVisual(s.name);
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
                              <span className="italic text-muted-foreground">Non assigné</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <OverflowTags
                              items={s.classes}
                              keyOf={(c) => c.id}
                              renderItem={(c) => <Badge>{c.name}</Badge>}
                              emptyLabel="Aucune classe"
                            />
                          </td>
                          <td className="px-3.5 py-2.5 text-muted-foreground">—</td>
                          <td className="px-3.5 py-2.5">
                            {!s.isActive ? (
                              <Badge>Archivée</Badge>
                            ) : s.classes.length > 0 ? (
                              <Badge tone="success">Active</Badge>
                            ) : (
                              <Badge tone="warning">Non affectée</Badge>
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

      {editing && (
        <SubjectFormModal
          subject={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) =>
            setSubjects((prev) => {
              if (!prev) return prev;
              const exists = prev.some((s) => s.id === saved.id);
              return exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved];
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
