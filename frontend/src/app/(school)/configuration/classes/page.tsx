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
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { TeacherOption } from '@/components/school/TeacherPicker';
import { ClassFormModal } from './ClassFormModal';
import type { ClassData } from './types';

export default function ClassesPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [classes, setClasses] = useState<ClassData[] | null>(null);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [editing, setEditing] = useState<ClassData | 'new' | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ classes: ClassData[] }>('/api/school/classes'),
      api<{ teachers: TeacherOption[] }>('/api/school/teachers'),
    ])
      .then(([c, t]) => {
        setClasses(c.classes);
        setTeachers(t.teachers);
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

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Classes</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Gestion des classes de l&apos;établissement.
          </p>
        </div>
        <Button className="w-fit" onClick={() => setEditing('new')}>
          <Plus size={14} />
          Ajouter une classe
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classes === null && !error && <p className="text-sm text-muted-foreground">Chargement…</p>}

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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une classe..."
              className="min-h-11 max-w-[260px] flex-1 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="min-h-11 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground"
            >
              <option value="">Tous niveaux</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <span className="ml-auto text-sm text-muted-foreground">{filtered.length} classes</span>
          </div>

          <Card className="overflow-x-auto">
            {filtered.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {classes.length === 0 ? 'Aucune classe — ajoute la première.' : 'Aucun résultat.'}
              </p>
            ) : (
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Classe</Th>
                    <Th>Niveau</Th>
                    <Th>Professeur principal</Th>
                    <Th>Matières</Th>
                    <Th className="w-[70px]" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-none">
                      <td className="px-3.5 py-2.5">
                        <div className="font-semibold text-foreground">{c.name}</div>
                        {c.room && (
                          <div className="text-[11px] text-muted-foreground">{c.room}</div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Badge>{c.level}</Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-foreground">
                        {c.homeroomTeacher ? (
                          c.homeroomTeacher.name
                        ) : (
                          <span className="italic text-muted-foreground">Non affecté</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Link
                          href={`/configuration/coefficients?classId=${c.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {c.subjectCount}
                        </Link>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1">
                          <IconButton onClick={() => setEditing(c)} label="Modifier">
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton onClick={() => onDelete(c)} label="Supprimer">
                            <Trash2 size={14} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {editing && (
        <ClassFormModal
          cls={editing === 'new' ? null : editing}
          teachers={teachers}
          onTeacherCreated={(t) => setTeachers((prev) => [...prev, t])}
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
      className={`px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-secondary-foreground">
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
