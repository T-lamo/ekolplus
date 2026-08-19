'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Star,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  AlertTriangle,
  Plus,
  Download,
  Eye,
  Pencil,
  Trash2,
  Table2,
  BookOpen,
  BarChart2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { SelectItem } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageNumbers } from '@/components/ui/Pager';
import { exportToCsv } from '@/lib/csv-export';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { MENTION_LABEL, type AppreciationsListData, type Mention, type TermOption } from './types';
import { ParMatiereTab } from './ParMatiereTab';
import { StatistiquesTab } from './StatistiquesTab';

const PAGE_SIZE = 20;

function mentionClass(m: Mention | null): string {
  switch (m) {
    case 'TRES_BIEN':
      return 'bg-success text-success-foreground';
    case 'BIEN':
      return 'bg-info text-info-foreground';
    case 'ASSEZ_BIEN':
      return 'bg-warning text-warning-foreground';
    case 'PASSABLE':
      return 'bg-muted text-muted-foreground';
    case 'INSUFFISANT':
    case 'FAIBLE':
      return 'bg-destructive text-destructive-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function moyColor(avg: number | null): string {
  if (avg == null) return 'text-muted-foreground';
  if (avg < 8) return 'text-destructive-foreground';
  if (avg < 12) return 'text-warning-foreground';
  if (avg < 16) return 'text-info-foreground';
  return 'text-success-foreground';
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

export default function AppreciationsListPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  // Class picker = the ACTIVE year's classes (`/api/school/classes`), not
  // the classes that happen to have subject affectations — a brand-new class
  // must show up here immediately, and archived-year classes never.
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [data, setData] = useState<AppreciationsListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mentionFilter, setMentionFilter] = useState('');
  const [tab, setTab] = useState<'eleve' | 'matiere' | 'stats' | 'attente'>('eleve');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!user) return;
    api<{ classes: Array<{ id: string; name: string }> }>('/api/school/classes')
      .then((res) => {
        setClasses(res.classes.map((c) => ({ id: c.id, name: c.name })));
        if (res.classes[0]) setClassId(res.classes[0].id);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les appréciations.');
      });
  }, [user, router]);

  useEffect(() => {
    if (!classId) return;
    const qs = termId ? `?termId=${termId}` : '';
    api<AppreciationsListData>(`/api/school/classes/${classId}/appreciations${qs}`)
      .then((d) => {
        setData(d);
        setTerms(d.terms);
        setTermId(d.resolvedTermId ?? '');
        setPage(1);
      })
      .catch(() => setError('Impossible de charger les appréciations.'));
  }, [classId, termId]);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    let rows = data.students;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
    if (mentionFilter) rows = rows.filter((s) => s.mention === mentionFilter);
    if (tab === 'attente') rows = rows.filter((s) => s.status !== 'PUBLISHED');
    return rows;
  }, [data, search, mentionFilter, tab]);
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const pageStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const enAttenteCount = data ? data.students.filter((s) => s.status !== 'PUBLISHED').length : 0;

  async function deleteAppreciation(studentId: string, name: string) {
    if (
      !(await confirm({ message: `Supprimer l'appréciation générale de ${name} ?`, danger: true }))
    )
      return;
    try {
      await api(`/api/school/students/${studentId}/appreciations?termId=${termId}`, {
        method: 'DELETE',
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              students: prev.students.map((s) =>
                s.studentId === studentId
                  ? { ...s, mention: null, text: null, status: 'NONE', authorName: null }
                  : s,
              ),
            }
          : prev,
      );
      toast('Appréciation supprimée.', 'success');
    } catch {
      toast('Erreur lors de la suppression.', 'error');
    }
  }

  function menuItemsFor(s: AppreciationsListData['students'][number]): ActionMenuItem[] {
    return [
      {
        label: "Voir l'appréciation",
        icon: <Eye size={14} />,
        onClick: () => router.push(`/pedagogie/appreciations/${s.studentId}?termId=${termId}`),
      },
      {
        label: "Modifier l'appréciation",
        icon: <Pencil size={14} />,
        onClick: () =>
          router.push(`/pedagogie/appreciations/${s.studentId}/saisie?termId=${termId}`),
      },
      {
        label: "Supprimer l'appréciation",
        icon: <Trash2 size={14} />,
        tone: 'danger',
        divider: true,
        onClick: () => deleteAppreciation(s.studentId, `${s.firstName} ${s.lastName}`),
      },
    ];
  }

  function onExport() {
    if (!data) return;
    exportToCsv(
      `appreciations-${data.className}.csv`.toLowerCase().replace(/\s+/g, '-'),
      [
        'Élève',
        'N°',
        'Moyenne',
        'Mention',
        'Appréciation générale',
        'Enseignant principal',
        'Statut',
      ],
      filteredStudents.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.studentNumber,
        s.average ?? '',
        s.mention ? MENTION_LABEL[s.mention] : '',
        s.text ?? '',
        data.homeroomTeacherName ?? '',
        s.status === 'PUBLISHED' ? 'Saisie' : 'En attente',
      ]),
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className={`${LIST_PAGE} gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Appréciations</h1>
          <p className="text-sm text-muted-foreground">
            Saisie et gestion des appréciations — Année scolaire {terms[0]?.label ?? ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="w-fit border border-border" onClick={onExport}>
            <Download size={14} />
            Exporter
          </Button>
          <Button
            className="w-fit"
            disabled={!data || data.students.length === 0}
            onClick={() =>
              data?.students[0] &&
              router.push(
                `/pedagogie/appreciations/${data.students[0].studentId}/saisie?termId=${termId}`,
              )
            }
          >
            <Plus size={14} />
            Saisir appréciations
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classes.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <Star size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Configure d&apos;abord des classes et des élèves avant de saisir des appréciations.
          </p>
        </Card>
      ) : (
        <>
          {data && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <SummaryCard
                icon={Users}
                tone="secondary"
                label="Total élèves"
                value={`${data.totalCount}`}
                sub={`${data.className} — ${terms[0]?.label ?? ''}`}
              />
              <SummaryCard
                icon={CheckCircle2}
                tone="success"
                label="Appréciations saisies"
                value={`${data.saisieCount}`}
                sub={`sur ${data.totalCount} élèves`}
              />
              <SummaryCard
                icon={Clock}
                tone="warning"
                label="En attente"
                value={`${data.totalCount - data.saisieCount}`}
                sub="à compléter"
              />
              <SummaryCard
                icon={TrendingUp}
                tone="success"
                label="Très bien / Bien"
                value={`${data.positiveCount}`}
                sub="mentions positives"
              />
              <SummaryCard
                icon={AlertTriangle}
                tone="destructive"
                label="À surveiller"
                value={`${data.alertCount}`}
                sub="mentions insuffisant"
              />
            </div>
          )}

          <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
            <SearchInput
              placeholder="Rechercher un élève..."
              className="min-w-[200px] max-w-[280px] flex-1"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <FilterSelect value={classId} onValueChange={setClassId}>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={termId} onValueChange={setTermId}>
              {terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={mentionFilter}
              onValueChange={(v) => {
                setMentionFilter(v);
                setPage(1);
              }}
            >
              <SelectItem value="">Toutes mentions</SelectItem>
              {Object.entries(MENTION_LABEL).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </FilterSelect>
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredStudents.length} élèves
            </span>
          </Card>

          <div role="tablist" className="flex w-fit gap-0 border-b-2 border-border">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'eleve'}
              onClick={() => {
                setTab('eleve');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'eleve' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <Table2 size={13} />
              Par élève
              {data && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {data.totalCount}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'matiere'}
              onClick={() => {
                setTab('matiere');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'matiere' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <BookOpen size={13} />
              Par matière
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'stats'}
              onClick={() => {
                setTab('stats');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'stats' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <BarChart2 size={13} />
              Statistiques
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'attente'}
              onClick={() => {
                setTab('attente');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'attente' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <Clock size={13} />
              En attente
              <span className="rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground">
                {enAttenteCount}
              </span>
            </button>
          </div>

          {!data ? (
            <Card className="gap-0 overflow-visible p-4">
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </Card>
          ) : tab === 'matiere' ? (
            <ParMatiereTab data={data} />
          ) : tab === 'stats' ? (
            <StatistiquesTab data={data} />
          ) : data.totalCount === 0 ? (
            <Card className="items-center gap-2 p-10 text-center">
              <Users size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Aucun élève inscrit dans cette classe.
              </p>
            </Card>
          ) : (
            <Card className="min-h-0 flex-1 gap-0 overflow-visible">
              <div className={cn('hidden md:block', TABLE_SCROLL)}>
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <th className="px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Élève
                      </th>
                      <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Moyenne
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Mention
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Appréciation générale
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Enseignant principal
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Statut
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
                              <div className="text-caption font-semibold text-foreground">
                                {s.firstName} {s.lastName}
                              </div>
                              <div className="text-2xs text-muted-foreground">
                                #{s.studentNumber}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-sm font-bold ${moyColor(s.average)}`}>
                            {fmt(s.average)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {s.mention ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-bold ${mentionClass(s.mention)}`}
                            >
                              {MENTION_LABEL[s.mention]}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              Non renseigné
                            </span>
                          )}
                        </td>
                        <td className="max-w-[280px] px-3 py-2.5">
                          <span className="block truncate text-xs text-foreground">
                            {s.text ?? (
                              <span className="text-muted-foreground italic">
                                Aucune appréciation saisie pour cet élève.
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs font-medium text-foreground">
                            {data.homeroomTeacherName ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {s.status === 'PUBLISHED' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-2xs font-semibold text-success-foreground">
                              <CheckCircle2 size={10} />
                              Saisie
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                              <Clock size={10} />
                              En attente
                            </span>
                          )}
                        </td>
                        <td className="px-1.5 py-2.5">
                          <ActionMenu items={menuItemsFor(s)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* < md: cards */}
              <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
                {pageStudents.map((s) => (
                  <div key={s.studentId} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size={28} />
                        <div className="min-w-0">
                          <div className="truncate text-caption font-semibold text-foreground">
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="truncate text-2xs text-muted-foreground">
                            #{s.studentNumber}
                          </div>
                        </div>
                      </div>
                      <div className="-mt-1 -mr-1 shrink-0">
                        <ActionMenu items={menuItemsFor(s)} />
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                      {s.status === 'PUBLISHED' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-2xs font-semibold text-success-foreground">
                          <CheckCircle2 size={10} />
                          Saisie
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                          <Clock size={10} />
                          En attente
                        </span>
                      )}
                      <span className={`text-sm font-bold ${moyColor(s.average)}`}>
                        {fmt(s.average)}
                        {s.mention && (
                          <span
                            className={`ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold ${mentionClass(s.mention)}`}
                          >
                            {MENTION_LABEL[s.mention]}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-border px-3.5 py-2.5">
                <span className="text-xs text-muted-foreground">
                  Affichage de {(page - 1) * PAGE_SIZE + 1} à{' '}
                  {Math.min(page * PAGE_SIZE, filteredStudents.length)} sur{' '}
                  {filteredStudents.length} élèves —{' '}
                  <strong className="text-foreground">
                    {data.saisieCount} appréciations saisies
                  </strong>
                  , {data.totalCount - data.saisieCount} en attente
                </span>
                <div className="flex items-center gap-1">
                  <PageNumbers page={page} totalPages={pageCount} onChange={setPage} />
                </div>
              </div>
            </Card>
          )}
        </>
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
  tone: 'secondary' | 'success' | 'warning' | 'destructive';
  label: string;
  value: string;
  sub: string;
}) {
  const iconBg: Record<string, string> = {
    secondary: 'bg-secondary text-primary',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
  };
  const valueColor: Record<string, string> = {
    secondary: 'text-foreground',
    success: 'text-success-foreground',
    warning: 'text-warning-foreground',
    destructive: 'text-destructive-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[t]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-2xs font-medium text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold ${valueColor[t]}`}>{value}</div>
        {sub && <div className="truncate text-2xs text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}
