'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  School as SchoolIcon,
  Pencil,
  Trash2,
  Plus,
  Download,
  Eye,
  UserCog,
  Copy,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { getSubjectVisual } from '@/lib/subject-visuals';
import { exportToCsv } from '@/lib/csv-export';
import type { TeacherOption } from '@/components/school/TeacherPicker';
import { AssignmentFormModal } from './AssignmentFormModal';
import type { AssignmentRow, ClassOption, SubjectOption } from './types';

type StatusFilter = '' | 'active' | 'unassigned' | 'archived';

interface SchoolInfo {
  academicYear: { label: string; startDate: string; endDate: string } | null;
}

function periodLabel(academicYear: SchoolInfo['academicYear']): string {
  if (!academicYear) return '—';
  const start = new Date(academicYear.startDate).toLocaleDateString('fr-FR', {
    month: 'short',
    year: 'numeric',
  });
  const end = new Date(academicYear.endDate).toLocaleDateString('fr-FR', {
    month: 'short',
    year: 'numeric',
  });
  return `${start} – ${end}`;
}

export default function AffectationsPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [rows, setRows] = useState<AssignmentRow[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [editing, setEditing] = useState<AssignmentRow | 'new' | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ classSubjects: AssignmentRow[] }>('/api/school/class-subjects'),
      api<{ classes: ClassOption[] }>('/api/school/classes'),
      api<{ subjects: SubjectOption[] }>('/api/school/subjects'),
      api<{ teachers: TeacherOption[] }>('/api/school/teachers'),
      api<SchoolInfo>('/api/school'),
    ])
      .then(([cs, c, s, t, sc]) => {
        setRows(cs.classSubjects);
        setClasses(c.classes);
        setSubjects(s.subjects);
        setTeachers(t.teachers);
        setSchool(sc);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les affectations.');
      });
  }, [user, router]);

  const filtered = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (classFilter && r.classId !== classFilter) return false;
      if (teacherFilter && r.teacher?.id !== teacherFilter) return false;
      if (status === 'active' && !r.teacher) return false;
      if (status === 'unassigned' && r.teacher) return false;
      if (status === 'archived') return false; // no archival concept on assignments yet
      if (search && !r.subject.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, search, classFilter, teacherFilter, status]);

  const stats = useMemo(() => {
    const all = rows ?? [];
    return {
      total: all.length,
      active: all.filter((r) => r.teacher).length,
      unassigned: all.filter((r) => !r.teacher).length,
      classesCovered: new Set(all.map((r) => r.classId)).size,
    };
  }, [rows]);

  async function onDelete(row: AssignmentRow) {
    if (!window.confirm(`Supprimer l'affectation « ${row.subject.name} — ${row.class.name} » ?`))
      return;
    try {
      await api(`/api/school/class-subjects/${row.id}`, { method: 'DELETE' });
      setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
      toast('Affectation supprimée.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  function onExport() {
    exportToCsv(
      'affectations.csv',
      ['Matière', 'Enseignant', 'Classe', 'Volume horaire', 'Coefficient', 'Période', 'Statut'],
      filtered.map((r) => [
        r.subject.name,
        r.teacher?.name ?? '',
        r.class.name,
        r.weeklyHours ?? '',
        r.coefficient ?? '',
        periodLabel(school?.academicYear ?? null),
        r.teacher ? 'Active' : 'Sans enseignant',
      ]),
    );
  }

  function menuItemsFor(r: AssignmentRow) {
    return [
      { label: 'Voir les détails', icon: <Eye size={14} />, onClick: () => setEditing(r) },
      { label: "Modifier l'affectation", icon: <Pencil size={14} />, onClick: () => setEditing(r) },
      { label: "Changer l'enseignant", icon: <UserCog size={14} />, onClick: () => setEditing(r) },
      {
        label: 'Dupliquer vers une autre classe',
        icon: <Copy size={14} />,
        onClick: () => toast('Duplication vers une autre classe — bientôt disponible.', 'info'),
      },
      {
        label: "Supprimer l'affectation",
        icon: <Trash2 size={14} />,
        onClick: () => onDelete(r),
        tone: 'danger' as const,
        divider: true,
      },
    ];
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    );
  }

  const canCreate = classes.length > 0 && subjects.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Affectations</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Gestion des affectations enseignant–matière–classe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="w-fit border border-border" onClick={onExport}>
            <Download size={14} />
            Exporter
          </Button>
          {canCreate && (
            <Button className="w-fit" onClick={() => setEditing('new')}>
              <Plus size={14} />
              Nouvelle affectation
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {rows === null && !error && <p className="text-sm text-muted-foreground">Chargement…</p>}

      {rows !== null && !canCreate && (
        <p className="text-sm text-muted-foreground">
          Crée d&apos;abord au moins une classe et une matière avant de configurer des affectations.
        </p>
      )}

      {rows !== null && canCreate && (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <SummaryCard icon={LinkIcon} label="Total affectations" value={stats.total} />
            <SummaryCard
              icon={CheckCircle2}
              label="Affectations actives"
              value={stats.active}
              tone="success"
            />
            <SummaryCard
              icon={AlertCircle}
              label="Sans enseignant"
              value={stats.unassigned}
              tone="warning"
            />
            <SummaryCard
              icon={SchoolIcon}
              label="Classes couvertes"
              value={`${stats.classesCovered} / ${classes.length}`}
              tone="blue"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une matière..."
              className="min-h-11 max-w-[260px] flex-1 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="min-h-11 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground"
            >
              <option value="">Toutes les classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="min-h-11 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground"
            >
              <option value="">Tous les enseignants</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="min-h-11 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground"
            >
              <option value="">Tous les statuts</option>
              <option value="active">Active</option>
              <option value="unassigned">Sans enseignant</option>
              <option value="archived">Archivée</option>
            </select>
            <span className="ml-auto text-sm text-muted-foreground">
              {filtered.length} affectations
            </span>
          </div>

          <Card className="overflow-x-auto">
            {filtered.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {rows.length === 0 ? 'Aucune affectation — crée la première.' : 'Aucun résultat.'}
              </p>
            ) : (
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Matière</Th>
                    <Th>Enseignant</Th>
                    <Th>Classe</Th>
                    <Th>Volume horaire</Th>
                    <Th>Coefficient</Th>
                    <Th>Période</Th>
                    <Th>Statut</Th>
                    <Th className="w-[80px]" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const visual = getSubjectVisual(r.subject.name);
                    return (
                      <tr key={r.id} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                              style={{ background: visual.iconBg, color: visual.iconFg }}
                            >
                              <visual.Icon size={15} />
                            </div>
                            <div>
                              <div className="font-semibold text-foreground">{r.subject.name}</div>
                              {r.subject.code && (
                                <div className="text-[11px] text-muted-foreground">
                                  {r.subject.code}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-foreground">
                          {r.teacher ? (
                            <div className="flex items-center gap-1.5">
                              <Avatar name={r.teacher.name} size={22} />
                              <span>{r.teacher.name}</span>
                            </div>
                          ) : (
                            <span className="italic text-muted-foreground">Non assigné</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge>{r.class.name}</Badge>
                        </td>
                        <td className="px-3.5 py-2.5 text-foreground">
                          {r.weeklyHours ? (
                            `${r.weeklyHours}h / semaine`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 font-bold text-foreground">
                          {r.coefficient ?? '—'}
                        </td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground">
                          {periodLabel(school?.academicYear ?? null)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          {r.teacher ? (
                            <Badge tone="success">Active</Badge>
                          ) : (
                            <Badge tone="warning">Sans enseignant</Badge>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-1">
                            <IconButton onClick={() => setEditing(r)} label="Modifier">
                              <Pencil size={14} />
                            </IconButton>
                            <ActionMenu items={menuItemsFor(r)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {editing && (
        <AssignmentFormModal
          assignment={editing === 'new' ? null : editing}
          classes={classes}
          subjects={subjects}
          existingRows={rows ?? []}
          teachers={teachers}
          onTeacherCreated={(t) => setTeachers((prev) => [...prev, t])}
          onClose={() => setEditing(null)}
          onSaved={(saved) =>
            setRows((prev) => {
              if (!prev) return prev;
              const exists = prev.some((r) => r.id === saved.id);
              return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved];
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
    blue: 'bg-[#e0f0ff] text-[#2563eb]',
  } as const;
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconWrap[tone]}`}
      >
        <Icon size={17} />
      </div>
      <div>
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-foreground">{value}</div>
      </div>
    </Card>
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
