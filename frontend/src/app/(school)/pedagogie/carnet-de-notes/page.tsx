'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
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
import type {
  ClassSubjectOption,
  CombinedNotebookData,
  NotebookData,
  TermOption,
  UnifiedNotebookData,
  UnifiedStudentRow,
} from './types';

const PAGE_SIZE = 8;

// Every column gets an EXPLICIT pixel width via <colgroup> + table-layout:
// fixed, instead of letting the browser auto-size them. With table-layout:
// auto, a class with many subjects/evaluations (5 subjects × 3-4 evals =
// ~20 columns) squeezes every column to fit the viewport, wrapping "Coeff.
// N" onto its own line and making the header unreadable. Fixed widths also
// let the sticky-right columns' offsets be computed exactly (no drift
// between what a <th>/<td> claims via a Tailwind min-w utility and what
// the browser actually renders).
const ELEVE_W = 200;
const EVAL_COL_W = 104;
const SUBJECT_AVG_COL_W = 76;
const MOYENNE_W = 92;
const RANG_W = 64;
const KEBAB_W = 44;
const RIGHT_RANG = KEBAB_W;
const RIGHT_MOYENNE = KEBAB_W + RANG_W;

const STICKY_LEFT = 'sticky z-10 border-r-2 border-border bg-card';
const STICKY_KEBAB = 'sticky z-10 bg-card';
const STICKY_RANG = 'sticky z-10 bg-card';
const STICKY_MOYENNE = 'sticky z-10 border-l-2 border-border bg-card';
const stickyLeftStyle = { left: 0 };
const stickyKebabStyle = { right: 0 };
const stickyRangStyle = { right: RIGHT_RANG };
const stickyMoyenneStyle = { right: RIGHT_MOYENNE };

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

function toUnifiedSingle(d: NotebookData): UnifiedNotebookData {
  return {
    combined: false,
    className: d.className,
    terms: d.terms,
    resolvedTermId: d.resolvedTermId,
    subjects: [
      { classSubjectId: d.classSubjectId, subjectName: d.subjectName, evaluations: d.evaluations },
    ],
    students: d.students.map((s) => ({
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      studentNumber: s.studentNumber,
      bySubject: {
        [d.classSubjectId]: {
          classSubjectId: d.classSubjectId,
          grades: s.grades,
          average: s.average,
        },
      },
      generalAverage: s.average,
      rank: s.rank,
    })),
    classAverage: d.classAverage,
    bestScore: d.bestScore,
    worstScore: d.worstScore,
    gradedCount: d.gradedCount,
    totalCount: d.totalCount,
  };
}

function toUnifiedCombined(d: CombinedNotebookData): UnifiedNotebookData {
  return {
    combined: true,
    className: d.className,
    terms: d.terms,
    resolvedTermId: d.resolvedTermId,
    subjects: d.subjects.map((s) => ({
      classSubjectId: s.classSubjectId,
      subjectName: s.subjectName,
      evaluations: s.evaluations,
    })),
    students: d.students.map((s) => ({
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      studentNumber: s.studentNumber,
      bySubject: Object.fromEntries(s.subjects.map((sc) => [sc.classSubjectId, sc])),
      generalAverage: s.generalAverage,
      rank: s.rank,
    })),
    classAverage: d.classAverage,
    bestScore: d.bestScore,
    worstScore: d.worstScore,
    gradedCount: d.gradedCount,
    totalCount: d.totalCount,
  };
}

export default function GradeNotebookPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [classSubjects, setClassSubjects] = useState<ClassSubjectOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [classId, setClassId] = useState('');
  const [subjectValue, setSubjectValue] = useState(''); // classSubjectId, or 'ALL' for combined view
  const [termId, setTermId] = useState('');
  const [unified, setUnified] = useState<UnifiedNotebookData | null>(null);
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
        if (cs.classSubjects[0]) {
          setClassId(cs.classSubjects[0].classId);
          setSubjectValue(cs.classSubjects[0].id);
        }
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
    if (!classId || !subjectValue) return;
    const qs = termId ? `?termId=${termId}` : '';
    const request =
      subjectValue === 'ALL'
        ? api<CombinedNotebookData>(`/api/school/classes/${classId}/notebook${qs}`).then(
            toUnifiedCombined,
          )
        : api<NotebookData>(`/api/school/class-subjects/${subjectValue}/notebook${qs}`).then(
            toUnifiedSingle,
          );
    request
      .then((u) => {
        setUnified(u);
        setTermId(u.resolvedTermId ?? '');
        setPage(1);
      })
      .catch(() => setError('Impossible de charger le carnet de notes.'));
  }, [classId, subjectValue, termId]);

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const cs of classSubjects) seen.set(cs.classId, cs.class.name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [classSubjects]);

  const subjectsForClass = classSubjects.filter((cs) => cs.classId === classId);
  const combined = subjectValue === 'ALL';

  const tableWidth = unified
    ? ELEVE_W +
      unified.subjects.reduce((n, s) => n + s.evaluations.length, 0) * EVAL_COL_W +
      (unified.combined ? unified.subjects.length * SUBJECT_AVG_COL_W : 0) +
      MOYENNE_W +
      RANG_W +
      KEBAB_W
    : ELEVE_W + MOYENNE_W + RANG_W + KEBAB_W;

  const filteredStudents = useMemo(() => {
    if (!unified) return [];
    const q = search.trim().toLowerCase();
    if (!q) return unified.students;
    return unified.students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
  }, [unified, search]);
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const pageStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function clearStudentGrades(student: UnifiedStudentRow) {
    if (!unified) return;
    const allEvals = unified.subjects.flatMap((s) => s.evaluations);
    if (allEvals.length === 0) return;
    if (
      !confirm(
        `Supprimer toutes les notes de ${student.firstName} ${student.lastName} pour cette période ?`,
      )
    )
      return;
    try {
      await Promise.all(
        allEvals.map((ev) =>
          api(`/api/school/evaluations/${ev.id}/grades`, {
            method: 'PUT',
            body: { grades: [{ studentId: student.studentId, score: null, absent: false }] },
          }),
        ),
      );
      setUnified((prev) =>
        prev
          ? {
              ...prev,
              students: prev.students.map((s) =>
                s.studentId === student.studentId
                  ? {
                      ...s,
                      generalAverage: null,
                      bySubject: Object.fromEntries(
                        Object.entries(s.bySubject).map(([csId, cell]) => [
                          csId,
                          {
                            ...cell,
                            average: null,
                            grades: cell.grades.map((g) => ({ ...g, score: null, absent: false })),
                          },
                        ]),
                      ),
                    }
                  : s,
              ),
            }
          : prev,
      );
      toast('Notes supprimées.', 'success');
    } catch {
      toast('Erreur lors de la suppression.', 'error');
    }
  }

  function menuItemsFor(student: UnifiedStudentRow): ActionMenuItem[] {
    const evalMenuItems: ActionMenuItem[] = unified
      ? unified.subjects
          .flatMap((sub) => sub.evaluations.map((ev) => ({ subjectName: sub.subjectName, ev })))
          .map(({ subjectName, ev }, i) => ({
            label: unified.combined ? `${subjectName} — ${ev.label}` : ev.label,
            icon: <Pencil size={14} />,
            divider: i === 0,
            onClick: () => router.push(`/pedagogie/carnet-de-notes/${ev.id}/saisie`),
          }))
      : [];

    return [
      {
        label: 'Voir le bulletin',
        icon: <Eye size={14} />,
        onClick: () => toast('Disponible avec Epic 7 (Bulletins).', 'info'),
      },
      ...(evalMenuItems.length > 0
        ? evalMenuItems
        : [
            {
              label: 'Modifier les notes',
              icon: <Pencil size={14} />,
              divider: true,
              onClick: () => toast("Crée d'abord une évaluation.", 'info'),
            },
          ]),
      {
        label: 'Historique des notes',
        icon: <History size={14} />,
        divider: true,
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
    if (!unified) return;
    const header = [
      'Élève',
      'N°',
      ...unified.subjects.flatMap((sub) => [
        ...sub.evaluations.map((ev) =>
          unified.combined ? `${sub.subjectName} — ${ev.label}` : ev.label,
        ),
        ...(unified.combined ? [`${sub.subjectName} — Moy.`] : []),
      ]),
      'Moyenne générale',
      'Rang',
    ];
    const rows = filteredStudents.map((s) => [
      `${s.firstName} ${s.lastName}`,
      s.studentNumber,
      ...unified.subjects.flatMap((sub) => {
        const cell = s.bySubject[sub.classSubjectId];
        const gradeVals = sub.evaluations.map((ev) => {
          const g = cell?.grades.find((gr) => gr.evaluationId === ev.id);
          return g?.absent ? 'Abs.' : (g?.score ?? '');
        });
        return unified.combined ? [...gradeVals, cell?.average ?? ''] : gradeVals;
      }),
      s.generalAverage ?? '',
      s.rank ?? '',
    ]);
    exportToCsv(
      `carnet-notes-${unified.className}${unified.combined ? '-toutes-matieres' : `-${unified.subjects[0]!.subjectName}`}.csv`
        .toLowerCase()
        .replace(/\s+/g, '-'),
      header,
      rows,
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
          <Button
            className="w-fit"
            onClick={() => setShowNew(true)}
            disabled={combined || !subjectValue}
          >
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
          {unified && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <SummaryCard
                icon={Users}
                tone="secondary"
                label="Élèves notés"
                value={`${unified.gradedCount}`}
                sub={`sur ${unified.totalCount} élèves`}
              />
              <SummaryCard
                icon={BarChart2}
                tone="blue"
                label={combined ? 'Moyenne générale de classe' : 'Moyenne de classe'}
                value={fmt(unified.classAverage)}
                sub="sur 20 pts"
              />
              <SummaryCard
                icon={TrendingUp}
                tone="success"
                label="Meilleure moyenne"
                value={fmt(unified.bestScore)}
                sub=""
              />
              <SummaryCard
                icon={TrendingDown}
                tone="destructive"
                label="Note insuffisante"
                value={`${unified.students.filter((s) => s.generalAverage != null && s.generalAverage < 8).length}`}
                sub="élèves sous la moyenne"
              />
              <SummaryCard
                icon={Calendar}
                tone="warning"
                label="Période"
                value={terms.find((t) => t.id === unified.resolvedTermId)?.label ?? '—'}
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
              value={classId}
              onChange={(e) => {
                const newClassId = e.target.value;
                setClassId(newClassId);
                const first = classSubjects.find((cs) => cs.classId === newClassId);
                setSubjectValue(first ? first.id : 'ALL');
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
              value={subjectValue}
              onChange={(e) => setSubjectValue(e.target.value)}
            >
              <option value="ALL">Toutes les matières</option>
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
              {unified && unified.subjects.reduce((n, s) => n + s.evaluations.length, 0) > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {unified.subjects.reduce((n, s) => n + s.evaluations.length, 0)}
                </span>
              )}
            </button>
          </div>

          {!unified ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : unified.totalCount === 0 ? (
            <Card className="items-center gap-2 p-10 text-center">
              <Users size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Aucun élève inscrit dans cette classe.
              </p>
            </Card>
          ) : (
            <Card className="gap-0 overflow-visible">
              <div className="overflow-x-auto">
                <table
                  style={{ width: tableWidth, tableLayout: 'fixed' }}
                  className="border-collapse text-sm"
                >
                  <colgroup>
                    <col style={{ width: ELEVE_W }} />
                    {unified.subjects.map((sub) => (
                      <Fragment key={sub.classSubjectId}>
                        {sub.evaluations.map((ev) => (
                          <col key={ev.id} style={{ width: EVAL_COL_W }} />
                        ))}
                        {unified.combined && <col style={{ width: SUBJECT_AVG_COL_W }} />}
                      </Fragment>
                    ))}
                    <col style={{ width: MOYENNE_W }} />
                    <col style={{ width: RANG_W }} />
                    <col style={{ width: KEBAB_W }} />
                  </colgroup>
                  <thead>
                    {unified.combined && (
                      <tr className="border-b border-border">
                        <th
                          rowSpan={2}
                          style={stickyLeftStyle}
                          className={`${STICKY_LEFT} px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                        >
                          Élève
                        </th>
                        {unified.subjects.map((sub) => (
                          <th
                            key={sub.classSubjectId}
                            colSpan={sub.evaluations.length + 1}
                            className="overflow-hidden border-l-2 border-border px-3 py-1.5 text-center text-[11px] font-bold tracking-wide text-ellipsis whitespace-nowrap text-foreground uppercase"
                          >
                            {sub.subjectName}
                          </th>
                        ))}
                        <th
                          rowSpan={2}
                          style={stickyMoyenneStyle}
                          className={`${STICKY_MOYENNE} px-3 py-2.5 text-center text-[10px] font-bold tracking-wide whitespace-nowrap text-primary uppercase`}
                        >
                          Moyenne
                        </th>
                        <th
                          rowSpan={2}
                          style={stickyRangStyle}
                          className={`${STICKY_RANG} px-3 py-2.5 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                        >
                          Rang
                        </th>
                        <th rowSpan={2} style={stickyKebabStyle} className={STICKY_KEBAB} />
                      </tr>
                    )}
                    <tr className="border-b border-border">
                      {!unified.combined && (
                        <th
                          style={stickyLeftStyle}
                          className={`${STICKY_LEFT} px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                        >
                          Élève
                        </th>
                      )}
                      {unified.subjects.map((sub) => (
                        <Fragment key={sub.classSubjectId}>
                          {sub.evaluations.map((ev) => (
                            <th
                              key={ev.id}
                              className="overflow-hidden px-2 py-2.5 text-center"
                              title={`${ev.label} — Coeff. ${ev.coefficient}${ev.status === 'DRAFT' ? ' (brouillon)' : ''}`}
                            >
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="overflow-hidden text-[10px] font-bold tracking-wide text-ellipsis whitespace-nowrap text-muted-foreground uppercase">
                                  {ev.label}
                                </span>
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap text-muted-foreground">
                                  Coeff. {ev.coefficient}
                                </span>
                              </div>
                            </th>
                          ))}
                          {unified.combined && (
                            <th
                              key={`${sub.classSubjectId}-avg`}
                              className="border-r-2 border-border bg-muted/40 px-2 py-2.5 text-center text-[10px] font-bold tracking-wide whitespace-nowrap text-muted-foreground uppercase"
                            >
                              Moy.
                            </th>
                          )}
                        </Fragment>
                      ))}
                      {!unified.combined && (
                        <>
                          <th
                            style={stickyMoyenneStyle}
                            className={`${STICKY_MOYENNE} px-3 py-2.5 text-center text-[10px] font-bold tracking-wide whitespace-nowrap text-primary uppercase`}
                          >
                            Moyenne
                          </th>
                          <th
                            style={stickyRangStyle}
                            className={`${STICKY_RANG} px-3 py-2.5 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                          >
                            Rang
                          </th>
                          <th style={stickyKebabStyle} className={STICKY_KEBAB} />
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageStudents.map((s) => (
                      <tr key={s.studentId} className="border-b border-border last:border-b-0">
                        <td style={stickyLeftStyle} className={`${STICKY_LEFT} px-3.5 py-2.5`}>
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
                        {unified.subjects.map((sub) => {
                          const cell = s.bySubject[sub.classSubjectId];
                          return (
                            <Fragment key={sub.classSubjectId}>
                              {sub.evaluations.map((ev) => {
                                const g = cell?.grades.find((gr) => gr.evaluationId === ev.id);
                                return (
                                  <td key={ev.id} className="px-3 py-2.5 text-center">
                                    {g?.absent ? (
                                      <span
                                        className={`inline-flex min-w-11 items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold ${PILL_CLASS.neutral}`}
                                      >
                                        Abs.
                                      </span>
                                    ) : (
                                      <span
                                        className={`inline-flex min-w-11 items-center justify-center rounded-md px-2 py-1 text-sm font-bold ${PILL_CLASS[tone(g?.score ?? null)]}`}
                                      >
                                        {g?.score != null ? fmt(g.score) : '—'}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                              {unified.combined && (
                                <td
                                  key={`${sub.classSubjectId}-avg`}
                                  className="border-r-2 border-border bg-muted/40 px-3 py-2.5 text-center"
                                >
                                  <span
                                    className={`inline-flex min-w-11 items-center justify-center rounded-md px-2 py-1 text-xs font-bold ${PILL_CLASS[tone(cell?.average ?? null)]}`}
                                  >
                                    {fmt(cell?.average ?? null)}
                                  </span>
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                        <td
                          style={stickyMoyenneStyle}
                          className={`${STICKY_MOYENNE} px-3 py-2.5 text-center`}
                        >
                          <span
                            className={`inline-flex min-w-12 items-center justify-center rounded-md px-2 py-1 text-sm font-bold ${PILL_CLASS[tone(s.generalAverage)]}`}
                          >
                            {fmt(s.generalAverage)}
                          </span>
                        </td>
                        <td
                          style={stickyRangStyle}
                          className={`${STICKY_RANG} px-3 py-2.5 text-center`}
                        >
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${s.rank && RANK_CLASS[s.rank] ? RANK_CLASS[s.rank] : 'bg-muted text-muted-foreground'}`}
                          >
                            {s.rank ?? '—'}
                          </span>
                        </td>
                        <td style={stickyKebabStyle} className={`${STICKY_KEBAB} px-1.5 py-2.5`}>
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
                  {filteredStudents.length} élèves — Moy. {combined ? 'générale' : 'classe'} :{' '}
                  <strong className="text-foreground">{fmt(unified.classAverage)}/20</strong>
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

      {showNew && !combined && subjectValue && termId && (
        <NewEvaluationModal
          classSubjects={classSubjects}
          terms={terms}
          defaultClassSubjectId={subjectValue}
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
