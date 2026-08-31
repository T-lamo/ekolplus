'use client';

// Carnet de notes enseignant — the school gradebook's Par évaluation and
// Statistiques views over MY class-subjects only. The heavy lifting is
// reused verbatim from the school module (ParEvaluationTab, StatistiquesTab,
// EvaluationConfigForm are pure, props-driven components); this page only
// swaps the data source for /api/teacher/* and drops the admin-only Vue
// tableau (the per-student entry grid lives on the saisie screen). The
// spec's tab set for this screen is Par évaluation + Statistiques
// (2026-08-31-espace-enseignant-phase3-saisie-design.md).
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart2,
  Calendar,
  ListChecks,
  NotebookPen,
  PieChart,
  Plus,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { LIST_PAGE } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';
import { ParEvaluationTab } from '@/app/(school)/pedagogie/carnet-de-notes/ParEvaluationTab';
import { StatistiquesTab } from '@/app/(school)/pedagogie/carnet-de-notes/StatistiquesTab';
import type {
  ClassSubjectOption,
  NotebookData,
  TermOption,
  UnifiedNotebookData,
} from '@/app/(school)/pedagogie/carnet-de-notes/types';
import { TeacherNewEvaluationModal } from './TeacherNewEvaluationModal';

interface TeacherMeResponse {
  classSubjects: {
    id: string;
    classId: string;
    className: string;
    classLevel: string;
    subjectId: string;
    subjectName: string;
  }[];
  terms: TermOption[];
  currentTermId: string | null;
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

export default function TeacherGradebookPage() {
  const t = useTranslations('TeacherGradebook');
  const tPage = useTranslations('Gradebook.page');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const router = useRouter();
  const [classSubjectId, setClassSubjectId] = useState('');
  const [termId, setTermId] = useState('');
  const [view, setView] = useState<'byEval' | 'stats'>('byEval');
  const [showNew, setShowNew] = useState(false);

  const { data: me, error: meErr } = useApi<TeacherMeResponse>('/api/teacher/me');
  const myClassSubjects = useMemo(() => me?.classSubjects ?? [], [me]);

  useEffect(() => {
    if (!classSubjectId && myClassSubjects.length > 0) {
      setClassSubjectId(myClassSubjects[0]!.id);
    }
  }, [classSubjectId, myClassSubjects]);
  useEffect(() => {
    if (!termId && me?.currentTermId) setTermId(me.currentTermId);
  }, [termId, me]);

  const notebookPath = classSubjectId
    ? `/api/teacher/class-subjects/${classSubjectId}/notebook${termId ? `?termId=${termId}` : ''}`
    : '';
  const { data: rawNotebook, error: notebookErr } = useApi<NotebookData>(notebookPath, {
    skip: !classSubjectId,
  });

  // The notebook response names its own classSubjectId, so a stale response
  // from the previous selection can never render under the new one.
  const unified = useMemo(
    () =>
      rawNotebook && rawNotebook.classSubjectId === classSubjectId
        ? toUnifiedSingle(rawNotebook)
        : null,
    [rawNotebook, classSubjectId],
  );

  const formOptions = useMemo<ClassSubjectOption[]>(
    () =>
      myClassSubjects.map((cs) => ({
        id: cs.id,
        classId: cs.classId,
        subjectId: cs.subjectId,
        class: { id: cs.classId, name: cs.className },
        subject: { id: cs.subjectId, name: cs.subjectName },
        teacher: null,
        coefficient: null,
      })),
    [myClassSubjects],
  );
  const terms = me?.terms ?? [];
  const error = meErr || notebookErr ? t('loadError') : null;

  const fmt = (n: number | null) =>
    n == null
      ? '·'
      : n.toLocaleString(bcp47, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className={`${LIST_PAGE} gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button
          className="w-fit"
          onClick={() => setShowNew(true)}
          disabled={!classSubjectId || !termId}
        >
          <Plus size={14} />
          {tPage('newEvaluation')}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {me && myClassSubjects.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <NotebookPen size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">{t('empty')}</p>
        </Card>
      ) : (
        <>
          <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
            <FilterSelect value={classSubjectId} onValueChange={setClassSubjectId}>
              {myClassSubjects.map((cs) => (
                <SelectItem key={cs.id} value={cs.id}>
                  {cs.className} · {cs.subjectName}
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
          </Card>

          {!unified ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[74px] w-full" />
                ))}
              </div>
              <Skeleton className="h-56 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <SummaryCard
                  icon={Users}
                  tone="secondary"
                  label={tPage('gradedStudents')}
                  value={`${unified.gradedCount}`}
                  sub={tPage('outOfStudents', { count: unified.totalCount })}
                />
                <SummaryCard
                  icon={BarChart2}
                  tone="blue"
                  label={tPage('classAverage')}
                  value={fmt(unified.classAverage)}
                  sub={tPage('outOf20')}
                  help={tPage('help.averageComputation')}
                />
                <SummaryCard
                  icon={TrendingUp}
                  tone="success"
                  label={tPage('bestAverage')}
                  value={fmt(unified.bestScore)}
                  sub=""
                />
                <SummaryCard
                  icon={TrendingDown}
                  tone="destructive"
                  label={tPage('insufficientGrade')}
                  value={`${unified.students.filter((s) => s.generalAverage != null && s.generalAverage < 8).length}`}
                  sub={tPage('belowAverage')}
                  help={tPage('help.insufficientThreshold')}
                />
                <SummaryCard
                  icon={Calendar}
                  tone="warning"
                  label={tPage('period')}
                  value={terms.find((term) => term.id === unified.resolvedTermId)?.label ?? '·'}
                  sub=""
                />
              </div>

              <div role="tablist" className="flex w-fit gap-0 border-b-2 border-border">
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
                  <ListChecks size={13} />
                  {tPage('tabByEval')}
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
                  <PieChart size={13} />
                  {tPage('tabStats')}
                </button>
              </div>

              {view === 'byEval' ? (
                <ParEvaluationTab
                  unified={unified}
                  saisieHrefBase="/espace-enseignant/carnet-de-notes"
                />
              ) : (
                <StatistiquesTab unified={unified} />
              )}
            </>
          )}
        </>
      )}

      {showNew && classSubjectId && termId && (
        <TeacherNewEvaluationModal
          classSubjects={formOptions}
          terms={terms}
          defaultClassSubjectId={classSubjectId}
          defaultTermId={termId}
          onClose={() => setShowNew(false)}
          onCreated={(evaluationId) =>
            router.push(`/espace-enseignant/carnet-de-notes/${evaluationId}/saisie`)
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
