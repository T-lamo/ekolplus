'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  NotebookPen,
  Users,
  BarChart2,
  TrendingUp,
  TrendingDown,
  Calendar,
  Plus,
  FileSpreadsheet,
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
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { getCache, useApi } from '@/lib/useApi';
import { usePermissions } from '@/lib/usePermissions';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageNumbers } from '@/components/ui/Pager';
import { QualitativeSubjectCard } from '@/components/gradebook/QualitativeSubjectCard';
import { exportToCsv } from '@/lib/csv-export';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
// Code-split: only shown after clicking "Saisir évaluation" — see the
// matching StudentFormModal split in eleves/page.tsx for why.
const NewEvaluationModal = dynamic(
  () => import('./NewEvaluationModal').then((m) => m.NewEvaluationModal),
  { ssr: false },
);
// Code-split: only mounted once the user switches to that tab (default is
// "table") — same reasoning as the StudentFormModal split in eleves/page.tsx.
const StatistiquesTab = dynamic(() => import('./StatistiquesTab').then((m) => m.StatistiquesTab), {
  ssr: false,
});
const ParEvaluationTab = dynamic(
  () => import('./ParEvaluationTab').then((m) => m.ParEvaluationTab),
  { ssr: false },
);
import type {
  ClassSubjectOption,
  CombinedNotebookData,
  NotebookData,
  TermOption,
  UnifiedNotebookData,
  UnifiedStudentRow,
} from './types';

const PAGE_SIZE = 20;

// table-layout: fixed drives column sizing instead of the browser
// auto-sizing to content. Élève/Moyenne/Rang/kebab get an EXPLICIT pixel
// width via <colgroup> — they must never flex, or the sticky-right offsets
// (computed from these same constants) drift out of alignment. Evaluation
// and per-subject "Moy." columns get NO <colgroup> width, only a
// min-width on their actual cells: under table-layout:fixed, an
// unspecified <col> shares any leftover space equally once the table is
// wider than its content — so a sparse table (few subjects/evaluations)
// stretches to fill the screen instead of leaving dead space after
// Moyenne/Rang/kebab — while the min-width still stops them shrinking
// below a readable size when there are enough columns to overflow (5
// subjects × 3-4 evals = ~20 columns used to wrap "Coeff. N" onto its own
// line under table-layout:auto).
const ELEVE_W = 200;
const EVAL_COL_W = 104;
const SUBJECT_AVG_COL_W = 76;
const MOYENNE_W = 92;
const RANG_W = 64;
const KEBAB_W = 44;
const RIGHT_RANG = KEBAB_W;
const RIGHT_MOYENNE = KEBAB_W + RANG_W;

// `[&_tr:not(:last-child)_&]`-style row dividers don't paint on sticky cells
// under border-collapse (same issue STICKY_THEAD already works around — see
// layout.ts) — an inset shadow substitutes for the <tr>'s border-b here too.
const STICKY_ROW_DIVIDER = 'shadow-[inset_0_-1px_0_0_var(--color-border)]';
const STICKY_LEFT = `sticky z-10 border-r-2 border-border bg-card ${STICKY_ROW_DIVIDER}`;
const STICKY_KEBAB = `sticky z-10 bg-card ${STICKY_ROW_DIVIDER}`;
const STICKY_RANG = `sticky z-10 bg-card ${STICKY_ROW_DIVIDER}`;
const STICKY_MOYENNE = `sticky z-10 border-l-2 border-border bg-card ${STICKY_ROW_DIVIDER}`;
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
  good: 'bg-info text-info-foreground',
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
  const t = useTranslations('Gradebook.page');
  const tEvalStatus = useTranslations('Gradebook.evaluationStatus');
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [classId, setClassId] = useState('');
  const [subjectValue, setSubjectValue] = useState(''); // classSubjectId, or 'ALL' for combined view
  const [termId, setTermId] = useState('');
  const [unified, setUnified] = useState<UnifiedNotebookData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [view, setView] = useState<'table' | 'stats' | 'byEval'>('table');

  const onNoSchool = (err: unknown) => {
    if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
      router.replace('/');
      return true;
    }
    setLoadError(t('loadError'));
    return true;
  };
  const { data: classesData, error: classesErr } = useApi<{
    classes: Array<{ id: string; name: string }>;
  }>('/api/school/classes', { skip: !user, onError: onNoSchool });
  const { data: classSubjectsData, error: classSubjectsErr } = useApi<{
    classSubjects: ClassSubjectOption[];
  }>('/api/school/class-subjects', { skip: !user, onError: onNoSchool });
  const { data: schoolData, error: schoolErr } = useApi<{
    academicYear: { terms: TermOption[] } | null;
  }>('/api/school', { skip: !user, onError: onNoSchool });
  // Class picker = the ACTIVE year's classes (`/api/school/classes`), not
  // just the classes that have subject affectations — a brand-new class must
  // show up here immediately (its notebook is simply empty until subjects
  // are assigned), and archived-year classes never.
  const classes = classesData?.classes ?? [];
  const classSubjects = classSubjectsData?.classSubjects ?? [];
  const terms = schoolData?.academicYear?.terms ?? [];
  const error = loadError ?? (classesErr || classSubjectsErr || schoolErr ? t('loadError') : null);
  const qualitative =
    classSubjects.find((cs) => cs.id === subjectValue)?.subject.evaluationMode === 'QUALITATIVE';

  // Initial class/subject selection — derived once, the first time this
  // data is available, never again (so a later background revalidation of
  // the same cached lists doesn't stomp on a selection the user already made).
  const initialSelectionDone = useRef(false);
  useEffect(() => {
    if (!initialSelectionDone.current && classes.length > 0) {
      initialSelectionDone.current = true;
      const firstClass = classes[0]!;
      setClassId(firstClass.id);
      const firstSubject = classSubjects.find((x) => x.classId === firstClass.id);
      setSubjectValue(firstSubject ? firstSubject.id : 'ALL');
    }
  }, [classes, classSubjects]);

  const qs = termId ? `?termId=${termId}` : '';
  const notebookPath =
    subjectValue === 'ALL'
      ? `/api/school/classes/${classId}/notebook${qs}`
      : `/api/school/class-subjects/${subjectValue}/notebook${qs}`;
  const { data: rawNotebook } = useApi<CombinedNotebookData | NotebookData>(notebookPath, {
    skip: !classId || !subjectValue || qualitative,
    onError: () => setLoadError(t('loadError')),
  });

  // Re-derive `unified` (and seed `termId`/reset `page`) only when the
  // notebook's fetch key changes — not on every background revalidation of
  // the SAME key, which would otherwise silently bounce the user back to
  // page 1 mid-browsing. `classId`/`subjectValue`/`termId` are local state,
  // not URL params, so this component never remounts on selection change —
  // useApi's `data` can still hold the PREVIOUS selection's response for one
  // render while the new fetch is in flight. Gate on
  // `getCache(notebookPath) === rawNotebook` (only true once the cache entry
  // actually written for THIS path matches what we're holding) so this
  // effect can't fire early on stale data and permanently skip the real
  // update once it lands.
  const notebookKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      rawNotebook &&
      getCache(notebookPath) === rawNotebook &&
      notebookKeyRef.current !== notebookPath
    ) {
      notebookKeyRef.current = notebookPath;
      const u =
        subjectValue === 'ALL'
          ? toUnifiedCombined(rawNotebook as CombinedNotebookData)
          : toUnifiedSingle(rawNotebook as NotebookData);
      setUnified(u);
      setTermId(u.resolvedTermId ?? '');
      setPage(1);
      // A prior transient failure (e.g. a class/subject/term switch that
      // raced ahead of the notebook fetch) leaves `loadError` set; this run
      // successfully landed, so the stale banner must not keep showing over
      // fresh, correct data.
      setLoadError(null);
    }
  }, [rawNotebook, notebookPath, subjectValue]);

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

  const { can, canSee } = usePermissions();
  if (!canSee('notes')) return <AccessDenied />;

  async function clearStudentGrades(student: UnifiedStudentRow) {
    if (!unified) return;
    const allEvals = unified.subjects.flatMap((s) => s.evaluations);
    if (allEvals.length === 0) return;
    if (
      !(await confirm({
        message: t('clearGradesConfirm', { name: `${student.firstName} ${student.lastName}` }),
        danger: true,
      }))
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
      toast(t('gradesDeletedToast'), 'success');
    } catch {
      toast(t('deleteErrorToast'), 'error');
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
        label: t('menuViewReportCard'),
        icon: <Eye size={14} />,
        onClick: () => router.push(`/bulletins/${student.studentId}/${termId}`),
      },
      ...(evalMenuItems.length > 0
        ? evalMenuItems
        : [
            {
              label: t('menuEditGrades'),
              icon: <Pencil size={14} />,
              divider: true,
              onClick: () => toast(t('menuEditGradesToast'), 'info'),
            },
          ]),
      {
        label: t('menuHistory'),
        icon: <History size={14} />,
        divider: true,
        onClick: () => toast(t('menuHistoryToast'), 'info'),
      },
      {
        label: t('menuAddAppreciation'),
        icon: <Star size={14} />,
        onClick: () => toast(t('menuAddAppreciationToast'), 'info'),
      },
      {
        label: t('menuContactGuardian'),
        icon: <Mail size={14} />,
        onClick: () => toast(t('menuContactGuardianToast'), 'info'),
      },
      {
        label: t('menuDeleteGrades'),
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
      t('colStudent'),
      t('csv.colNumber'),
      ...unified.subjects.flatMap((sub) => [
        ...sub.evaluations.map((ev) =>
          unified.combined ? `${sub.subjectName} — ${ev.label}` : ev.label,
        ),
        ...(unified.combined ? [t('csv.subjectAvgColumn', { subject: sub.subjectName })] : []),
      ]),
      t('csv.colGeneralAverage'),
      t('colRank'),
    ];
    const rows = filteredStudents.map((s) => [
      `${s.firstName} ${s.lastName}`,
      s.studentNumber,
      ...unified.subjects.flatMap((sub) => {
        const cell = s.bySubject[sub.classSubjectId];
        const gradeVals = sub.evaluations.map((ev) => {
          const g = cell?.grades.find((gr) => gr.evaluationId === ev.id);
          return g?.absent ? t('cellAbsent') : (g?.score ?? '');
        });
        return unified.combined ? [...gradeVals, cell?.average ?? ''] : gradeVals;
      }),
      s.generalAverage ?? '',
      s.rank ?? '',
    ]);
    const subjectSlug = unified.combined
      ? t('csv.allSubjectsSuffix')
      : unified.subjects[0]!.subjectName;
    exportToCsv(
      `${t('csv.filenamePrefix')}-${unified.className}-${subjectSlug}.csv`
        .toLowerCase()
        .replace(/\s+/g, '-'),
      header,
      rows,
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
          <h1 className="flex items-center gap-1.5 text-lg font-bold text-foreground">
            {t('title')}
            <HelpTooltip label={t('help.pageOverview')} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('subtitle', { year: terms[0]?.label ?? '' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can('notes', 'export') && (
            <Button variant="outline" className="w-fit" onClick={onExport}>
              <FileSpreadsheet size={14} />
              {t('export')}
            </Button>
          )}
          {can('notes', 'create') && (
            <Button
              className="w-fit"
              onClick={() => setShowNew(true)}
              disabled={combined || !subjectValue || qualitative}
            >
              <Plus size={14} />
              {t('newEvaluation')}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classes.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <NotebookPen size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">{t('noClasses')}</p>
        </Card>
      ) : (
        <>
          {unified && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <SummaryCard
                icon={Users}
                tone="secondary"
                label={t('gradedStudents')}
                value={`${unified.gradedCount}`}
                sub={t('outOfStudents', { count: unified.totalCount })}
              />
              <SummaryCard
                icon={BarChart2}
                tone="blue"
                label={combined ? t('generalClassAverage') : t('classAverage')}
                value={fmt(unified.classAverage)}
                sub={t('outOf20')}
                help={t('help.averageComputation')}
              />
              <SummaryCard
                icon={TrendingUp}
                tone="success"
                label={t('bestAverage')}
                value={fmt(unified.bestScore)}
                sub=""
              />
              <SummaryCard
                icon={TrendingDown}
                tone="destructive"
                label={t('insufficientGrade')}
                value={`${unified.students.filter((s) => s.generalAverage != null && s.generalAverage < 8).length}`}
                sub={t('belowAverage')}
                help={t('help.insufficientThreshold')}
              />
              <SummaryCard
                icon={Calendar}
                tone="warning"
                label={t('period')}
                value={terms.find((term) => term.id === unified.resolvedTermId)?.label ?? '—'}
                sub=""
              />
            </div>
          )}

          <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('searchPlaceholder')}
              className="min-w-[200px] max-w-[280px]"
            />
            <FilterSelect
              value={classId}
              onValueChange={(newClassId) => {
                setClassId(newClassId);
                const first = classSubjects.find((cs) => cs.classId === newClassId);
                setSubjectValue(first ? first.id : 'ALL');
              }}
            >
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={subjectValue} onValueChange={setSubjectValue}>
              <SelectItem value="ALL">{t('allSubjects')}</SelectItem>
              {subjectsForClass.map((cs) => (
                <SelectItem key={cs.id} value={cs.id}>
                  {cs.subject.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={termId} onValueChange={setTermId}>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.label}
                </SelectItem>
              ))}
            </FilterSelect>
            <span className="ml-auto text-xs text-muted-foreground">
              {t('studentCount', { count: filteredStudents.length })}
            </span>
          </Card>

          <div role="tablist" className="flex w-fit gap-0 border-b-2 border-border">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'table'}
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${
                view === 'table'
                  ? 'border-primary text-primary'
                  : 'border-transparent font-medium text-muted-foreground'
              }`}
            >
              <Table2 size={13} />
              {t('tabTable')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'stats'}
              onClick={() => setView('stats')}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${
                view === 'stats'
                  ? 'border-primary text-primary'
                  : 'border-transparent font-medium text-muted-foreground'
              }`}
            >
              <BarChart2 size={13} />
              {t('tabStats')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'byEval'}
              onClick={() => setView('byEval')}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${
                view === 'byEval'
                  ? 'border-primary text-primary'
                  : 'border-transparent font-medium text-muted-foreground'
              }`}
            >
              <FileText size={13} />
              {t('tabByEval')}
              {unified && unified.subjects.reduce((n, s) => n + s.evaluations.length, 0) > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {unified.subjects.reduce((n, s) => n + s.evaluations.length, 0)}
                </span>
              )}
            </button>
          </div>

          {qualitative ? (
            <QualitativeSubjectCard href={`/pedagogie/carnet-de-notes/criteres/${subjectValue}`} />
          ) : !unified ? (
            <Card className="gap-0 overflow-visible p-4">
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </Card>
          ) : unified.totalCount === 0 ? (
            <Card className="items-center gap-2 p-10 text-center">
              <Users size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('noStudentsInClass')}</p>
            </Card>
          ) : view === 'stats' ? (
            <StatistiquesTab unified={unified} />
          ) : view === 'byEval' ? (
            <ParEvaluationTab unified={unified} />
          ) : (
            <Card className="gap-0 overflow-visible">
              <div className={TABLE_SCROLL}>
                <table
                  style={{ width: '100%', minWidth: tableWidth, tableLayout: 'fixed' }}
                  className="border-collapse text-sm"
                >
                  <colgroup>
                    <col style={{ width: ELEVE_W }} />
                    {/* No explicit width here on purpose — these are the
                        flexible columns. Under table-layout:fixed, every
                        <col> WITHOUT a width shares any leftover space
                        equally once the table is wider than its content
                        (so a sparse table fills the screen instead of
                        leaving dead space after Moyenne/Rang/le kebab).
                        Each cell still carries a min-width below so they
                        never shrink under many-column layouts — that's
                        what keeps "Coeff. N" from wrapping. */}
                    {unified.subjects.map((sub) => (
                      <Fragment key={sub.classSubjectId}>
                        {sub.evaluations.map((ev) => (
                          <col key={ev.id} />
                        ))}
                        {unified.combined && <col />}
                      </Fragment>
                    ))}
                    <col style={{ width: MOYENNE_W }} />
                    <col style={{ width: RANG_W }} />
                    <col style={{ width: KEBAB_W }} />
                  </colgroup>
                  <thead className={STICKY_THEAD}>
                    {unified.combined && (
                      <tr className="border-b border-border">
                        <th
                          rowSpan={2}
                          style={stickyLeftStyle}
                          className={`${STICKY_LEFT} px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                        >
                          {t('colStudent')}
                        </th>
                        {unified.subjects.map((sub) => (
                          <th
                            key={sub.classSubjectId}
                            colSpan={sub.evaluations.length + 1}
                            className="overflow-hidden border-l-2 border-border px-3 py-1.5 text-center text-2xs font-bold tracking-wide text-ellipsis whitespace-nowrap text-foreground uppercase"
                          >
                            {sub.subjectName}
                          </th>
                        ))}
                        <th
                          rowSpan={2}
                          style={stickyMoyenneStyle}
                          className={`${STICKY_MOYENNE} px-3 py-2.5 text-center text-[10px] font-bold tracking-wide whitespace-nowrap text-primary uppercase`}
                        >
                          {t('colAverage')}
                        </th>
                        <th
                          rowSpan={2}
                          style={stickyRangStyle}
                          className={`${STICKY_RANG} px-3 py-2.5 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                        >
                          {t('colRank')}
                        </th>
                        <th rowSpan={2} style={stickyKebabStyle} className={STICKY_KEBAB} />
                      </tr>
                    )}
                    <tr className="border-b border-border">
                      {!unified.combined && (
                        <th
                          style={stickyLeftStyle}
                          className={`${STICKY_LEFT} px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                        >
                          {t('colStudent')}
                        </th>
                      )}
                      {unified.subjects.map((sub) => (
                        <Fragment key={sub.classSubjectId}>
                          {sub.evaluations.map((ev) => (
                            <th
                              key={ev.id}
                              style={{ minWidth: EVAL_COL_W }}
                              className="overflow-hidden px-2 py-2.5 text-center"
                              title={
                                ev.status === 'DRAFT'
                                  ? t('evalTooltipDraft', {
                                      label: ev.label,
                                      coefficient: ev.coefficient,
                                    })
                                  : t('evalTooltip', {
                                      label: ev.label,
                                      coefficient: ev.coefficient,
                                    })
                              }
                            >
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="overflow-hidden text-[10px] font-bold tracking-wide text-ellipsis whitespace-nowrap text-muted-foreground uppercase">
                                  {ev.label}
                                </span>
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap text-muted-foreground">
                                  {t('colCoefficient', { n: ev.coefficient })}
                                </span>
                                {ev.status === 'DRAFT' && (
                                  <span className="rounded-full bg-warning px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap text-warning-foreground">
                                    {tEvalStatus('DRAFT')}
                                  </span>
                                )}
                              </div>
                            </th>
                          ))}
                          {unified.combined && (
                            <th
                              key={`${sub.classSubjectId}-avg`}
                              style={{ minWidth: SUBJECT_AVG_COL_W }}
                              className="border-r-2 border-border bg-muted/40 px-2 py-2.5 text-center text-[10px] font-bold tracking-wide whitespace-nowrap text-muted-foreground uppercase"
                            >
                              {t('colAverageAbbr')}
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
                            {t('colAverage')}
                          </th>
                          <th
                            style={stickyRangStyle}
                            className={`${STICKY_RANG} px-3 py-2.5 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                          >
                            {t('colRank')}
                          </th>
                          <th style={stickyKebabStyle} className={STICKY_KEBAB} />
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageStudents.map((s) => (
                      <tr
                        key={s.studentId}
                        className="border-b border-border last:border-b-0 last:[&>td]:shadow-none"
                      >
                        <td style={stickyLeftStyle} className={`${STICKY_LEFT} px-3.5 py-2.5`}>
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
                        {unified.subjects.map((sub) => {
                          const cell = s.bySubject[sub.classSubjectId];
                          return (
                            <Fragment key={sub.classSubjectId}>
                              {sub.evaluations.map((ev) => {
                                const g = cell?.grades.find((gr) => gr.evaluationId === ev.id);
                                return (
                                  <td
                                    key={ev.id}
                                    style={{ minWidth: EVAL_COL_W }}
                                    className="px-3 py-2.5 text-center"
                                  >
                                    {g?.absent ? (
                                      <span
                                        className={`inline-flex min-w-11 items-center justify-center rounded-md px-2 py-1 text-2xs font-semibold ${PILL_CLASS.neutral}`}
                                      >
                                        {t('cellAbsent')}
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
                                  style={{ minWidth: SUBJECT_AVG_COL_W }}
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
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-2xs font-bold ${s.rank && RANK_CLASS[s.rank] ? RANK_CLASS[s.rank] : 'bg-muted text-muted-foreground'}`}
                          >
                            {s.rank ?? '—'}
                          </span>
                        </td>
                        <td style={stickyKebabStyle} className={`${STICKY_KEBAB} px-1.5 py-2.5`}>
                          <ActionMenu items={menuItemsFor(s)} searchable />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-3.5 py-2.5">
                <span className="text-xs text-muted-foreground">
                  {t('paginationSummary', {
                    from: (page - 1) * PAGE_SIZE + 1,
                    to: Math.min(page * PAGE_SIZE, filteredStudents.length),
                    total: filteredStudents.length,
                    kind: combined ? t('avgKindGeneral') : t('avgKindClass'),
                    value: fmt(unified.classAverage),
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <PageNumbers page={page} totalPages={pageCount} onChange={setPage} />
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
  help,
}: {
  icon: typeof Users;
  tone: 'secondary' | 'blue' | 'success' | 'destructive' | 'warning';
  label: string;
  value: string;
  sub: string;
  help?: string;
}) {
  const iconBg: Record<string, string> = {
    secondary: 'bg-secondary text-primary',
    blue: 'bg-info text-info-foreground',
    success: 'bg-success text-success-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
  };
  const valueColor: Record<string, string> = {
    secondary: 'text-foreground',
    blue: 'text-info-foreground',
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
        <div className="flex items-center gap-1 text-2xs font-medium text-muted-foreground">
          <span className="truncate">{label}</span>
          {help && <HelpTooltip label={help} />}
        </div>
        <div className={`text-lg font-bold ${valueColor[t]}`}>{value}</div>
        {sub && <div className="truncate text-2xs text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}
