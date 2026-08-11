'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { BookOpen, CheckCircle2, AlertCircle, Users, Pencil, Trash2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SubjectFormModal } from './SubjectFormModal';
import type { SubjectData } from './types';

export default function MatieresPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [subjects, setSubjects] = useState<SubjectData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');
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
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [subjects, search, domain]);

  const stats = useMemo(() => {
    const all = subjects ?? [];
    return {
      total: all.length,
      active: all.filter((s) => s.classes.length > 0).length,
      unassigned: all.filter((s) => s.classes.length === 0).length,
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
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Matières</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Gestion des matières enseignées.</p>
        </div>
        <Button className="w-fit" onClick={() => setEditing('new')}>
          <Plus size={14} />
          Ajouter une matière
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {subjects === null && !error && <p className="text-sm text-muted-foreground">Chargement…</p>}

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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une matière..."
              className="min-h-11 max-w-[260px] flex-1 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="min-h-11 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground"
            >
              <option value="">Tous les domaines</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span className="ml-auto text-sm text-muted-foreground">
              {filtered.length} matières
            </span>
          </div>

          <Card className="overflow-x-auto">
            {filtered.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {subjects.length === 0 ? 'Aucune matière — ajoute la première.' : 'Aucun résultat.'}
              </p>
            ) : (
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Matière</Th>
                    <Th>Domaine</Th>
                    <Th>Enseignant assigné</Th>
                    <Th>Classes</Th>
                    <Th>Statut</Th>
                    <Th className="w-[70px]" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-none">
                      <td className="px-3.5 py-2.5">
                        <div className="font-semibold text-foreground">{s.name}</div>
                        {s.code && (
                          <div className="text-[11px] text-muted-foreground">{s.code}</div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {s.domain ? (
                          <Badge>{s.domain}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-foreground">
                        {s.teacherNames.length > 0 ? (
                          s.teacherNames.join(', ')
                        ) : (
                          <span className="italic text-muted-foreground">Non assigné</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {s.classes.length > 0 ? (
                            s.classes.map((c) => <Badge key={c.id}>{c.name}</Badge>)
                          ) : (
                            <span className="italic text-muted-foreground">Aucune classe</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        {s.classes.length > 0 ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge tone="warning">Non affectée</Badge>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1">
                          <IconButton onClick={() => setEditing(s)} label="Modifier">
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton onClick={() => onDelete(s)} label="Supprimer">
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
  value: number;
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
