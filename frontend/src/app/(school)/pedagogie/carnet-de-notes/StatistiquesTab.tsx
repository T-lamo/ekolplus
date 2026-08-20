'use client';

// "Statistiques" tab — was a toast stub ("bientôt disponible"). Everything
// here is derived client-side from the same `unified` notebook data the
// "Vue tableau" tab already has in memory (no new API calls): a grade
// distribution histogram, a per-evaluation average trend, a per-subject
// comparison (combined view only), and 4 KPI tiles not already shown in
// the page's top summary row.
//
// Every raw NotebookGradeCell.score is normalized to a common /20 basis
// via (score / evaluation.maxScore) * 20 before aggregation — same
// convention as src/lib/server/grades.ts (a quick quiz out of 10 and a DS
// out of 20 can't be averaged/binned together otherwise). Draft
// evaluations are included, same as "Vue tableau" itself.

import { useMemo } from 'react';
import { Award, CheckCircle2, TrendingDown, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { BarChart, type BarChartPoint } from '@/components/admin/charts/BarChart';
import type { UnifiedNotebookData } from './types';

const BUCKETS = [
  { label: '0-4', min: 0, max: 4 },
  { label: '4-8', min: 4, max: 8 },
  { label: '8-12', min: 8, max: 12 },
  { label: '12-16', min: 12, max: 16 },
  { label: '16-20', min: 16, max: 20.01 },
];

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

interface EvalStat {
  key: string;
  label: string;
  average: number | null;
  gradedCount: number;
  absentCount: number;
}

export function StatistiquesTab({ unified }: { unified: UnifiedNotebookData }) {
  const t = useTranslations('Gradebook.statistiques');
  const { distribution, evalStats, subjectStats, passRate, absentTotal, bestEval, worstEval } =
    useMemo(() => {
      const normalizedScores: number[] = [];
      let absentTotal = 0;

      const evalStats: EvalStat[] = unified.subjects.flatMap((sub) =>
        sub.evaluations.map((ev) => {
          const scores: number[] = [];
          let absentCount = 0;
          for (const student of unified.students) {
            const cell = student.bySubject[sub.classSubjectId];
            const g = cell?.grades.find((gr) => gr.evaluationId === ev.id);
            if (!g) continue;
            if (g.absent) {
              absentCount++;
              absentTotal++;
              continue;
            }
            if (g.score == null) continue;
            const normalized = ev.maxScore > 0 ? (g.score / ev.maxScore) * 20 : 0;
            scores.push(normalized);
            normalizedScores.push(normalized);
          }
          const average =
            scores.length > 0
              ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
              : null;
          return {
            key: ev.id,
            label: unified.combined ? `${sub.subjectName} · ${ev.label}` : ev.label,
            average,
            gradedCount: scores.length,
            absentCount,
          };
        }),
      );

      const distribution: BarChartPoint[] = BUCKETS.map((b) => ({
        label: b.label,
        value: normalizedScores.filter((s) => s >= b.min && s < b.max).length,
      }));

      const subjectStats: BarChartPoint[] = unified.combined
        ? unified.subjects.map((sub) => {
            const averages = unified.students
              .map((s) => s.bySubject[sub.classSubjectId]?.average)
              .filter((a): a is number => a != null);
            const avg =
              averages.length > 0
                ? Math.round((averages.reduce((s, v) => s + v, 0) / averages.length) * 10) / 10
                : 0;
            return { label: sub.subjectName, value: avg };
          })
        : [];

      const gradedGeneral = unified.students.filter((s) => s.generalAverage != null);
      const passRate =
        gradedGeneral.length > 0
          ? Math.round(
              (gradedGeneral.filter((s) => s.generalAverage! >= 10).length / gradedGeneral.length) *
                100,
            )
          : null;

      const withAverage = evalStats.filter((e) => e.average != null);
      const bestEval = withAverage.reduce<EvalStat | null>(
        (best, e) => (best === null || e.average! > best.average! ? e : best),
        null,
      );
      const worstEval = withAverage.reduce<EvalStat | null>(
        (worst, e) => (worst === null || e.average! < worst.average! ? e : worst),
        null,
      );

      return { distribution, evalStats, subjectStats, passRate, absentTotal, bestEval, worstEval };
    }, [unified]);

  if (unified.totalCount === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <p className="text-sm text-muted-foreground">{t('emptyState')}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={CheckCircle2}
          tone="success"
          label={t('passRate')}
          value={passRate != null ? `${passRate}%` : '—'}
          sub={t('passRateSub')}
        />
        <StatTile
          icon={UserX}
          tone="warning"
          label={t('absencesRecorded')}
          value={String(absentTotal)}
          sub={t('absencesRecordedSub')}
        />
        <StatTile
          icon={Award}
          tone="blue"
          label={t('bestEvaluation')}
          value={bestEval ? fmt(bestEval.average) : '—'}
          sub={bestEval?.label ?? t('noPublishedGrade')}
        />
        <StatTile
          icon={TrendingDown}
          tone="destructive"
          label={t('worstEvaluation')}
          value={worstEval ? fmt(worstEval.average) : '—'}
          sub={worstEval?.label ?? t('noPublishedGrade')}
        />
      </div>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">{t('distributionTitle')}</div>
          <p className="text-2xs text-muted-foreground">
            {t('distributionSub', { count: distribution.reduce((s, d) => s + d.value, 0) })}
          </p>
        </div>
        <BarChart
          data={distribution}
          formatValue={(v) => String(Math.round(v))}
          ariaLabel={t('distributionAriaLabel')}
        />
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">{t('byEvaluationTitle')}</div>
          <p className="text-2xs text-muted-foreground">{t('byEvaluationSub')}</p>
        </div>
        {evalStats.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{t('byEvaluationEmpty')}</p>
        ) : (
          <BarChart
            data={evalStats.map((e) => ({ label: e.label, value: e.average ?? 0 }))}
            formatValue={(v) => fmt(v)}
            ariaLabel={t('byEvaluationAriaLabel')}
          />
        )}
      </Card>

      {unified.combined && (
        <Card className="gap-3 p-4">
          <div>
            <div className="text-caption font-semibold text-foreground">{t('bySubjectTitle')}</div>
            <p className="text-2xs text-muted-foreground">{t('bySubjectSub')}</p>
          </div>
          <BarChart
            data={subjectStats}
            formatValue={(v) => fmt(v)}
            ariaLabel={t('bySubjectAriaLabel')}
          />
        </Card>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: typeof Award;
  tone: 'success' | 'warning' | 'blue' | 'destructive';
  label: string;
  value: string;
  sub: string;
}) {
  const iconBg: Record<string, string> = {
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
    blue: 'bg-info text-info-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[tone]}`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-2xs font-medium text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-foreground">{value}</div>
        <div className="truncate text-2xs text-muted-foreground">{sub}</div>
      </div>
    </Card>
  );
}
