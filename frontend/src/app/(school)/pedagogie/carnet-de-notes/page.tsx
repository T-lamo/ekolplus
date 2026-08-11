'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  NotebookPen,
  Users,
  BarChart2,
  TrendingUp,
  TrendingDown,
  Calendar,
  Plus,
  Download,
  Printer,
  Search,
  Eye,
  Star,
  History,
  Mail,
  Trash2,
  Pencil,
  FileText,
  Table2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { exportToCsv } from '@/lib/csv-export';
import { NewEvaluationModal } from './NewEvaluationModal';
import type { ClassSubjectOption, NotebookData, NotebookStudentRow, TermOption } from './types';

const PAGE_SIZE = 8;

function tone(avg: number | null): 'excellent' | 'good' | 'average' | 'poor' | 'neutral' {
  if (avg == null) return 'neutral';
  if (avg < 8) return 'poor';
  if (avg < 12) return 'average';
  if (avg < 16) return 'good';
  return 'excellent';
}

const PILL_CLASS: Record<string, string> = {
  excellent: 'bg-success text-success-foreground',
  good: 'bg-[#e0f0ff] text-[#2563eb]',
  average: 'bg-warning text-warning-foreground',
  poor: 'bg-destructive text-destructive-foreground',
  neutral: 'bg-muted text-muted-foreground',
};

const RANK_CLASS: Record<number, string> = {
  1: 'bg-warning text-warning-foreground',
  2: 'bg-muted text-[#6b7280]',
  3: 'bg-[#fdf3ea] text-[#c2612a]',
};

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

export default function GradeNotebookPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [classSubjects, setClassSubjects] = useState<ClassSubjectOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [classSubjectId, setClassSubjectId] = useState('');
  const [termId, setTermId] = useState('');
  const [data, setData] = useState<NotebookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ classSubjects: ClassSubjectOption[] }>('/api/school/class-subjects'),
      api<{ academicYear: { terms: TermOption[] } | null }>('/api/school'),
    ])
      .then(([cs, school]) => {
        setClassSubjects(cs.classSubjects);
        setTerms(school.academicYear?.terms ?? []);
        if (cs.classSubjects[0]) setClassSubjectId(cs.classSubjects[0].id);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger le carnet de notes.');
      });
  }, [user, router]);

  useEffect(() => {
    if (!classSubjectId) return;
    const qs = termId ? `?termId=${termId}` : '';
    api<NotebookData>(`/api/school/class-subjects/${classSubjectId}/notebook${qs}`)
      .then((d) => {
        setData(d);
        setTermId(d.resolvedTermId ?? '');
        setPage(1);
      })
      .catch(() => setError('Impossible de charger le carnet de notes.'));
  }, [classSubjectId, termId]);

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const cs of classSubjects) seen.set(cs.classId, cs.class.name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [classSubjects]);

  const current = classSubjects.find((cs) => cs.id === classSubjectId) ?? null;
  const subjectsForClass = classSubjects.filter((cs) => cs.classId === current?.classId);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.students;
    return data.students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
  }, [data, search]);
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const pageStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function clearStudentGrades(student: NotebookStudentRow) {
    if (!data || data.evaluations.length === 0) return;
    if (
      !confirm(
        `Supprimer toutes les notes de ${student.firstName} ${student.lastName} pour cette période ?`,
      )
    )
      return;
    try {
      await Promise.all(
        data.evaluations.map((ev) =>
          api(`/api/school/evaluations/${ev.id}/grades`, {
            method: 'PUT',
            body: { grades: [{ studentId: student.studentId, score: null, absent: false }] },
          }),
        ),
      );
      setData({
        ...data,
        students: data.students.map((s) =>
          s.studentId === student.studentId
            ? {
                ...s,
                average: null,
                grades: s.grades.map((g) => ({ ...g, score: null, absent: false })),
              }
            : s,
        ),
      });
      toast('Notes supprimées.', 'success');
    } catch {
      toast('Erreur lors de la suppression.', 'error');
    }
  }

  function menuItemsFor(student: NotebookStudentRow): ActionMenuItem[] {
    const lastEval = data?.evaluations[data.evaluations.length - 1];
    return [
      {
        label: 'Voir le bulletin',
        icon: <Eye size={14} />,
        onClick: () => toast('Disponible avec Epic 7 (Bulletins).', 'info'),
      },
      {
        label: 'Modifier les notes',
        icon: <Pencil size={14} />,
        onClick: () =>
          lastEval
            ? router.push(`/pedagogie/carnet-de-notes/${lastEval.id}/saisie`)
            : toast("Crée d'abord une évaluation.", 'info'),
      },
      {
        label: 'Historique des notes',
        icon: <History size={14} />,
        onClick: () => toast('Historique — bientôt disponible.', 'info'),
      },
      {
        label: 'Ajouter appréciation',
        icon: <Star size={14} />,
        onClick: () => toast('Disponible avec le module Appréciations.', 'info'),
      },
      {
        label: 'Contacter le tuteur',
        icon: <Mail size={14} />,
        onClick: () => toast('Messagerie — bientôt disponible.', 'info'),
      },
      {
        label: 'Supprimer les notes',
        icon: <Trash2 size={14} />,
        tone: 'danger',
        divider: true,
        onClick: () => clearStudentGrades(student),
      },
    ];
  }

  function onExport() {
    if (!data) return;
    exportToCsv(
      `carnet-notes-${data.className}-${data.subjectName}.csv`.toLowerCase().replace(/\s+/g, '-'),
      ['Élève', 'N°', ...data.evaluations.map((e) => e.label), 'Moyenne', 'Rang'],
      filteredStudents.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.studentNumber,
        ...s.grades.map((g) => (g.absent ? 'Abs.' : (g.score ?? ''))),
        s.average ?? '',
        s.rank ?? '',
      ]),
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Carnet de notes</h1>
          <p className="text-sm text-muted-foreground">
            Saisie et consultation des notes — Année scolaire {terms[0]?.label ?? ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="w-fit border border-border" onClick={onExport}>
            <Download size={14} />
            Exporter
          </Button>
          <Button
            variant="ghost"
            className="w-fit border border-border"
            onClick={() => window.print()}
          >
            <Printer size={14} />
            Imprimer
          </Button>
          <Button className="w-fit" onClick={() => setShowNew(true)} disabled={!classSubjectId}>
            <Plus size={14} />
            Saisir des notes
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classSubjects.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <NotebookPen size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Configure d&apos;abord des classes, matières et affectations avant de saisir des notes.
          </p>
        </Card>
      ) : (
        <>
          {data && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <SummaryCard
                icon={Users}
                tone="secondary"
                label="Élèves notés"
                value={`${data.gradedCount}`}
                sub={`sur ${data.totalCount} élèves`}
              />
              <SummaryCard
                icon={BarChart2}
                tone="blue"
                label="Moyenne de classe"
                value={fmt(data.classAverage)}
                sub="sur 20 pts"
              />
              <SummaryCard
                icon={TrendingUp}
                tone="success"
                label="Meilleure note"
                value={fmt(data.bestScore)}
                sub=""
              />
              <SummaryCard
                icon={TrendingDown}
                tone="destructive"
                label="Note insuffisante"
                value={`${data.students.filter((s) => s.average != null && s.average < 8).length}`}
                sub="élèves sous la moyenne"
              />
              <SummaryCard
                icon={Calendar}
                tone="warning"
                label="Période"
                value={terms.find((t) => t.id === data.resolvedTermId)?.label ?? '—'}
                sub=""
              />
            </div>
          )}

          <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
            <div className="flex min-w-[200px] max-w-[280px] flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Rechercher un élève..."
                className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Select
              label=""
              className="min-h-9 py-1.5"
              value={current?.classId ?? ''}
              onChange={(e) => {
                const first = classSubjects.find((cs) => cs.classId === e.target.value);
                if (first) setClassSubjectId(first.id);
              }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label=""
              className="min-h-9 py-1.5"
              value={classSubjectId}
              onChange={(e) => setClassSubjectId(e.target.value)}
            >
              {subjectsForClass.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  {cs.subject.name}
                </option>
              ))}
            </Select>
            <Select
              label=""
              className="min-h-9 py-1.5"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredStudents.length} élèves
            </span>
          </Card>

          <div role="tablist" className="flex w-fit gap-0 border-b-2 border-border">
            <button
              type="button"
              role="tab"
              aria-selected
              className="flex items-center gap-1.5 border-b-2 border-primary px-4 py-2.5 text-[13px] font-semibold text-primary"
            >
              <Table2 size={13} />
              Vue tableau
            </button>
            <button
              type="button"
              role="tab"
              onClick={() => toast('Statistiques — bientôt disponible.', 'info')}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-muted-foreground"
            >
              <BarChart2 size={13} />
              Statistiques
            </button>
            <button
              type="button"
              role="tab"
              onClick={() => toast('Vue par évaluation — bientôt disponible.', 'info')}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-muted-foreground"
            >
              <FileText size={13} />
              Par évaluation
              {data && data.evaluations.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {data.evaluations.length}
                </span>
              )}
            </button>
          </div>

          {!data ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : data.totalCount === 0 ? (
            <Card className="items-center gap-2 p-10 text-center">
              <Users size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Aucun élève inscrit dans cette classe.
              </p>
            </Card>
          ) : (
            <Card className="gap-0 overflow-visible">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        Élève
                      </th>
                      {data.evaluations.map((ev) => (
                        <th
                          key={ev.id}
                          className="px-3 py-2.5 text-center"
                          title={`${ev.label} — Coeff. ${ev.coefficient}${ev.status === 'DRAFT' ? ' (brouillon)' : ''}`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                              {ev.label}
                            </span>
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                              Coeff. {ev.coefficient}
                            </span>
                          </div>
                        </th>
                      ))}
                      <th className="border-l-2 border-border px-3 py-2.5 text-center text-[10px] font-bold tracking-wide text-primary uppercase">
                        Moyenne
                      </th>
                      <th className="px-3 py-2.5 text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                        Rang
                      </th>
                      <th className="w-11" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageStudents.map((s) => (
                      <tr key={s.studentId} className="border-b border-border last:border-b-0">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${s.firstName} ${s.lastName}`} size={28} />
                            <div>
                              <div className="text-[13px] font-semibold text-foreground">
                                {s.firstName} {s.lastName}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                #{s.studentNumber}
                              </div>
                            </div>
                          </div>
                        </td>
                        {s.grades.map((g) => (
                          <td key={g.evaluationId} className="px-3 py-2.5 text-center">
                            {g.absent ? (
                              <span
                                className={`inline-flex min-w-11 items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold ${PILL_CLASS.neutral}`}
                              >
                                Abs.
                              </span>
                            ) : (
                              <span
                                className={`inline-flex min-w-11 items-center justify-center rounded-md px-2 py-1 text-sm font-bold ${PILL_CLASS[tone(g.score)]}`}
                              >
                                {g.score != null ? fmt(g.score) : '—'}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="border-l-2 border-border px-3 py-2.5 text-center">
                          <span
                            className={`inline-flex min-w-12 items-center justify-center rounded-md px-2 py-1 text-sm font-bold ${PILL_CLASS[tone(s.average)]}`}
                          >
                            {fmt(s.average)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${s.rank && RANK_CLASS[s.rank] ? RANK_CLASS[s.rank] : 'bg-muted text-muted-foreground'}`}
                          >
                            {s.rank ?? '—'}
                          </span>
                        </td>
                        <td className="px-1.5 py-2.5">
                          <ActionMenu items={menuItemsFor(s)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-3.5 py-2.5">
                <span className="text-xs text-muted-foreground">
                  Affichage de {(page - 1) * PAGE_SIZE + 1} à{' '}
                  {Math.min(page * PAGE_SIZE, filteredStudents.length)} sur{' '}
                  {filteredStudents.length} élèves — Moy. classe :{' '}
                  <strong className="text-foreground">{fmt(data.classAverage)}/20</strong>
                </span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium ${p === page ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {showNew && classSubjectId && termId && (
        <NewEvaluationModal
          classSubjects={classSubjects}
          terms={terms}
          defaultClassSubjectId={classSubjectId}
          defaultTermId={termId}
          onClose={() => setShowNew(false)}
          onCreated={(evaluationId) =>
            router.push(`/pedagogie/carnet-de-notes/${evaluationId}/saisie`)
          }
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tone: t,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  tone: 'secondary' | 'blue' | 'success' | 'destructive' | 'warning';
  label: string;
  value: string;
  sub: string;
}) {
  const iconBg: Record<string, string> = {
    secondary: 'bg-secondary text-primary',
    blue: 'bg-[#e0f0ff] text-[#2563eb]',
    success: 'bg-success text-success-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
  };
  const valueColor: Record<string, string> = {
    secondary: 'text-foreground',
    blue: 'text-[#2563eb]',
    success: 'text-success-foreground',
    destructive: 'text-destructive-foreground',
    warning: 'text-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[t]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold ${valueColor[t]}`}>{value}</div>
        {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}
