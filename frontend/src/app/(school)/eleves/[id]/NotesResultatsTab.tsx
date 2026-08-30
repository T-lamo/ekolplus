'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import {
  BarChart2,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  AlertTriangle,
  FileSpreadsheet,
  ListChecks,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { getCache, setCache, useApi } from '@/lib/useApi';
import { ASIDE_GRID } from '@/lib/layout';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { exportToCsv } from '@/lib/csv-export';
import { LOCALE_BCP47 } from '@/lib/locales';
import { formatOrdinal } from '../ordinal';
import { GoalModal } from './GoalModal';
import type { GoalRow, RankingRow, StudentResults } from '../types';

function chipTone(avg: number | null): 'good' | 'medium' | 'low' | 'neutral' {
  if (avg == null) return 'neutral';
  if (avg < 8) return 'low';
  if (avg < 12) return 'medium';
  return 'good';
}

const CHIP_CLASS: Record<string, string> = {
  good: 'bg-success text-success-foreground',
  medium: 'bg-warning text-warning-foreground',
  low: 'bg-destructive text-destructive-foreground',
  neutral: 'bg-muted text-muted-foreground',
};

const BAR_COLOR: Record<string, string> = {
  good: 'var(--color-success-foreground)',
  medium: 'var(--color-warning-foreground)',
  low: '#ef4444',
  neutral: 'var(--color-muted-foreground)',
};

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1);
}

type RankDisplayItem = RankingRow | { gap: true; key: string };

function buildRankingDisplay(ranking: RankingRow[]): RankDisplayItem[] {
  if (ranking.length === 0) return [];
  const shown = new Map<string, RankingRow>();
  ranking.slice(0, 3).forEach((r) => shown.set(r.studentId, r));
  const self = ranking.find((r) => r.isSelf);
  if (self) shown.set(self.studentId, self);
  ranking.slice(-2).forEach((r) => shown.set(r.studentId, r));
  const rows = [...shown.values()].sort((a, b) => a.position - b.position);
  const out: RankDisplayItem[] = [];
  rows.forEach((row, i) => {
    if (i > 0 && row.position - rows[i - 1]!.position > 1) {
      out.push({ gap: true, key: `gap-${row.position}` });
    }
    out.push(row);
  });
  return out;
}

export function NotesResultatsTab({
  studentId,
  studentName,
  initial,
}: {
  studentId: string;
  studentName: string;
  initial: StudentResults;
}) {
  const t = useTranslations('Eleves.notesResultats');
  const tFilterBy = useTranslations('Eleves');
  const tOrdinal = useTranslations('Eleves.ordinal');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [yearId, setYearId] = useState(initial.resolvedAcademicYearId ?? '');
  const [termSel, setTermSel] = useState(initial.resolvedTermId ?? 'all');
  const [goalModal, setGoalModal] = useState(false);

  const resultsQs = new URLSearchParams();
  if (yearId) resultsQs.set('academicYearId', yearId);
  if (termSel) resultsQs.set('termId', termSel);
  const resultsPath = `/api/school/students/${studentId}/results?${resultsQs.toString()}`;

  // The parent page already fetched this exact combo (server-resolved
  // defaults) moments ago and handed it down as `initial` — pre-warm the
  // shared cache under the SAME path so useApi serves it instantly below
  // instead of firing a redundant duplicate request on mount.
  useState(() => {
    setCache(resultsPath, initial);
    return true;
  });

  const { data: fetchedData, loading, mutate } = useApi<StudentResults>(resultsPath);
  const data = fetchedData ?? initial;

  // Re-sync `yearId`/`termSel` to the server-resolved values only once the
  // cache entry for the CURRENT `resultsPath` is confirmed to match
  // `fetchedData` (never from a stale sibling combo's leftover response) —
  // e.g. after `onYearChange` clears `termSel` to let the server pick the
  // new year's current term.
  const keyRef = useRef<string | null>(null);
  useEffect(() => {
    if (fetchedData && getCache(resultsPath) === fetchedData && keyRef.current !== resultsPath) {
      keyRef.current = resultsPath;
      setYearId(fetchedData.resolvedAcademicYearId ?? '');
      setTermSel(fetchedData.resolvedTermId ?? (fetchedData.termMode === 'ALL' ? 'all' : ''));
    }
  }, [fetchedData, resultsPath]);

  function onYearChange(id: string) {
    setYearId(id);
    setTermSel(''); // let the server resolve the new year's current term
  }

  function onGoalSaved(goal: GoalRow) {
    mutate({
      ...data,
      goals: data.goals
        ? [...data.goals.filter((g) => g.subjectId !== goal.subjectId), goal]
        : [goal],
    });
  }

  function exportCsv() {
    exportToCsv(
      `notes-${studentName.replace(/\s+/g, '-').toLowerCase()}.csv`,
      [
        t('csv.subject'),
        t('csv.coefficient'),
        t('csv.subjectAverage'),
        t('csv.classAverage'),
        t('csv.appreciation'),
      ],
      data.subjects.map((s) => [
        s.subjectName,
        s.coefficient ?? '',
        s.average ?? '',
        s.classAverage ?? '',
        s.appreciation ?? '',
      ]),
    );
  }

  if (!data.enrolled) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <BarChart2 size={28} className="text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">{t('notEnrolled')}</p>
      </Card>
    );
  }

  const hasAnyGrade = data.subjects.some((s) => s.average != null);
  const maxEvalCount = Math.max(0, ...data.subjects.map((s) => s.evaluations.length));

  const groups: { domain: string; subjects: typeof data.subjects }[] = [];
  for (const s of data.subjects) {
    const last = groups[groups.length - 1];
    if (last && last.domain === s.domain) last.subjects.push(s);
    else groups.push({ domain: s.domain, subjects: [s] });
  }

  const rankingDisplay = buildRankingDisplay(data.ranking);
  const currentTermLabel =
    data.termMode === 'ALL'
      ? t('allTerms')
      : (data.terms.find((term) => term.id === data.resolvedTermId)?.label ?? '—');
  const currentYearLabel =
    data.years.find((y) => y.id === data.resolvedAcademicYearId)?.label ?? '—';

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
        <span className="text-xs font-semibold text-muted-foreground">{tFilterBy('filterBy')}</span>
        <FilterSelect value={yearId} onValueChange={onYearChange}>
          {data.years.map((y) => (
            <SelectItem key={y.id} value={y.id}>
              {t('yearItem', { label: y.label })}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect value={termSel} onValueChange={setTermSel}>
          {data.terms.map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.label}
            </SelectItem>
          ))}
          <SelectItem value="all">{t('allTerms')}</SelectItem>
        </FilterSelect>
        <span className="ml-auto text-xs text-muted-foreground">
          {t('displayLabel')}{' '}
          <strong className="text-foreground">
            {currentTermLabel} — {currentYearLabel}
          </strong>{' '}
          ·{' '}
          {t(data.subjects.length > 1 ? 'subjectCount.other' : 'subjectCount.one', {
            count: data.subjects.length,
          })}
        </span>
      </Card>

      {!hasAnyGrade ? (
        <Card className="items-center gap-2 p-10 text-center">
          <BarChart2 size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">{t('noGrades')}</p>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard
              icon={BarChart2}
              tone="warning"
              label={t('summary.overallAverage')}
              value={fmt(data.overallAverage)}
              sub={t('summary.overallAverageSub', { term: currentTermLabel })}
            />
            <SummaryCard
              icon={Trophy}
              tone="secondary"
              label={t('summary.classRank')}
              value={data.rank ? formatOrdinal(data.rank, bcp47, tOrdinal) : '—'}
              sub={t(
                data.rankedCount > 1 ? 'summary.classRankSub.other' : 'summary.classRankSub.one',
                { count: data.rankedCount },
              )}
            />
            <SummaryCard
              icon={TrendingUp}
              tone="success"
              label={t('summary.bestSubject')}
              value={data.bestSubject ? fmt(data.bestSubject.average) : '—'}
              sub={data.bestSubject?.name ?? '—'}
            />
            <SummaryCard
              icon={TrendingDown}
              tone="destructive"
              label={t('summary.hardestSubject')}
              value={data.worstSubject ? fmt(data.worstSubject.average) : '—'}
              sub={data.worstSubject?.name ?? '—'}
            />
          </div>

          <div className={ASIDE_GRID}>
            {/* Left column */}
            <div className="flex flex-col gap-4">
              <Card className="gap-3.5 p-4.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
                    <ListChecks size={14} className="text-primary" />
                    {t('detailedGrades')}
                  </div>
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="flex items-center gap-1 text-xs font-medium text-primary"
                  >
                    <FileSpreadsheet size={12} />
                    {t('export')}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="border-b border-border py-2 pr-3 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {t('table.subject')}
                        </th>
                        <th className="border-b border-border px-3 py-2 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {t('table.coefficient')}
                        </th>
                        {Array.from({ length: maxEvalCount }, (_, i) => (
                          <th
                            key={i}
                            className="border-b border-border px-3 py-2 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase"
                          >
                            {t('table.evaluation', { index: i + 1 })}
                          </th>
                        ))}
                        <th className="border-b border-border px-3 py-2 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {t('table.subjectAverage')}
                        </th>
                        <th className="border-b border-border px-3 py-2 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {t('table.classAverage')}
                        </th>
                        <th className="border-b border-border px-3 py-2 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {t('table.trend')}
                        </th>
                        <th className="border-b border-border py-2 pl-3 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {t('table.appreciation')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g) => (
                        <Fragment key={g.domain}>
                          <tr className="bg-muted">
                            <td
                              colSpan={5 + maxEvalCount}
                              className="px-3 py-1 text-2xs font-bold tracking-wide text-muted-foreground uppercase"
                            >
                              {g.domain}
                            </td>
                          </tr>
                          {g.subjects.map((s) => (
                            <tr
                              key={s.subjectId}
                              className="border-b border-border last:border-b-0"
                            >
                              <td className="py-2.5 pr-3 font-semibold text-foreground">
                                {s.subjectName}
                              </td>
                              <td className="px-3 py-2.5 font-medium text-muted-foreground">
                                {s.coefficient ?? '—'}
                              </td>
                              {Array.from({ length: maxEvalCount }, (_, i) => {
                                const ev = s.evaluations[i];
                                return (
                                  <td
                                    key={i}
                                    title={ev ? `${ev.label} — /${ev.maxScore}` : undefined}
                                    className="px-3 py-2.5 font-semibold text-foreground"
                                  >
                                    {ev ? fmt(ev.score) : '—'}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2.5">
                                <span
                                  className={`inline-flex min-w-11 items-center justify-center rounded-sm px-2 py-0.5 text-sm font-bold ${CHIP_CLASS[chipTone(s.average)]}`}
                                >
                                  {fmt(s.average)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                {fmt(s.classAverage)}
                              </td>
                              <td className="px-3 py-2.5">
                                <TrendCell direction={s.trend.direction} delta={s.trend.delta} />
                              </td>
                              <td className="py-2.5 pl-3 text-xs text-muted-foreground">
                                {s.appreciation ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-1 flex items-center justify-between border-t-2 border-border pt-3">
                  <span className="text-caption font-bold text-foreground">
                    {t('weightedAverage')}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {t('classAverageLabel', { value: fmt(data.classOverallAverage) })}
                    </span>
                    <span
                      className={`inline-flex min-w-[70px] items-center justify-center rounded-sm px-4 py-1 text-[15px] font-bold ${CHIP_CLASS[chipTone(data.overallAverage)]}`}
                    >
                      {fmt(data.overallAverage)} / 20
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="gap-3.5 p-4.5">
                <div className="text-caption font-semibold text-foreground">
                  {t('trendEvolution')}
                </div>
                <div className="flex flex-col gap-2.5">
                  {data.subjects.map((s) => (
                    <div key={s.subjectId} className="flex items-center gap-2.5">
                      <span className="min-w-[130px] truncate text-xs font-semibold text-foreground">
                        {s.subjectName}
                      </span>
                      <div className="flex flex-1 items-center gap-1">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
                          <div
                            className="h-2.5 rounded-sm"
                            style={{
                              width: `${Math.min(100, ((s.average ?? 0) / 20) * 100)}%`,
                              background: BAR_COLOR[chipTone(s.average)],
                            }}
                          />
                        </div>
                        <span
                          className="min-w-8 text-right text-xs font-semibold"
                          style={{ color: BAR_COLOR[chipTone(s.average)] }}
                        >
                          {fmt(s.average)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex items-center gap-4 border-t border-border pt-3 text-2xs text-muted-foreground">
                  <Legend color="#ef4444" label={t('legend.insufficient')} />
                  <Legend color="var(--color-warning-foreground)" label={t('legend.average')} />
                  <Legend color="var(--color-success-foreground)" label={t('legend.good')} />
                  <span className="ml-auto">{t('legend.max')}</span>
                </div>
              </Card>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              <Card className="gap-2 p-4.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
                    <Trophy size={14} className="text-primary" />
                    {t('ranking', { className: data.className ?? '—' })}
                  </div>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
                    {data.rank
                      ? `${formatOrdinal(data.rank, bcp47, tOrdinal)} / ${data.rankedCount}`
                      : '—'}
                  </span>
                </div>
                {rankingDisplay.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">{t('noRanking')}</p>
                ) : (
                  rankingDisplay.map((row) =>
                    'gap' in row ? (
                      <div
                        key={row.key}
                        className="py-1 text-center text-2xs text-muted-foreground"
                      >
                        · · ·
                      </div>
                    ) : (
                      <div
                        key={row.studentId}
                        className={`flex items-center gap-2.5 py-2 ${row.isSelf ? 'rounded-md bg-secondary px-1.5' : 'border-b border-border last:border-b-0'}`}
                      >
                        <div
                          className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full text-2xs font-bold ${row.isSelf ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}
                        >
                          {row.position}
                        </div>
                        <Avatar name={row.name} size={26} />
                        <div className="min-w-0 flex-1">
                          <div
                            className={`truncate text-caption ${row.isSelf ? 'font-semibold text-primary' : 'font-medium text-foreground'}`}
                          >
                            {row.name}
                          </div>
                          {row.isSelf && (
                            <div className="text-2xs text-muted-foreground">
                              {t('youAreViewing')}
                            </div>
                          )}
                        </div>
                        <span
                          className={`rounded-sm px-2 py-0.5 text-xs font-bold ${CHIP_CLASS[chipTone(row.average)]}`}
                        >
                          {fmt(row.average)}
                        </span>
                      </div>
                    ),
                  )
                )}
                {data.ranking.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1 border-t border-border pt-2.5 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>{t('classAverageShort')}</span>
                      <strong className="text-foreground">
                        {fmt(data.classOverallAverage)} / 20
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('classMax')}</span>
                      <strong className="text-success-foreground">
                        {fmt(data.ranking[0]?.average ?? null)} / 20
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('classMin')}</span>
                      <strong className="text-destructive-foreground">
                        {fmt(data.ranking[data.ranking.length - 1]?.average ?? null)} / 20
                      </strong>
                    </div>
                  </div>
                )}
              </Card>

              {data.alertSubjects.length > 0 && (
                <Card className="flex-row items-start gap-2.5 bg-destructive p-3.5">
                  <AlertTriangle
                    size={18}
                    className="mt-0.5 shrink-0 text-destructive-foreground"
                  />
                  <div>
                    <div className="mb-1 text-caption font-bold text-destructive-foreground">
                      {t('alert.title')}
                    </div>
                    <div className="text-xs leading-relaxed text-destructive-foreground">
                      {t(data.alertSubjects.length > 1 ? 'alert.body.other' : 'alert.body.one', {
                        count: data.alertSubjects.length,
                        names: data.alertSubjects.map((a) => a.name).join(', '),
                      })}
                    </div>
                  </div>
                </Card>
              )}

              {data.termMode === 'SPECIFIC' && (
                <Card className="gap-2.5 p-4.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
                      <Target size={14} className="text-primary" />
                      {t('goals', { term: currentTermLabel })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setGoalModal(true)}
                      className="text-xs font-medium text-primary"
                    >
                      {t('defineGoal')}
                    </button>
                  </div>
                  {!data.goals || data.goals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('noGoals')}</p>
                  ) : (
                    data.goals.map((g) => (
                      <div key={g.id} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-caption font-medium text-foreground">
                            {g.subjectName}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground">
                              {t('current', { value: fmt(g.current) })}
                            </span>
                            <span className="font-bold text-primary">
                              → {g.targetScore.toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{
                              width: `${g.current != null ? Math.min(100, (g.current / g.targetScore) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {goalModal && data.resolvedTermId && (
        <GoalModal
          studentId={studentId}
          termId={data.resolvedTermId}
          subjects={data.subjects.map((s) => ({
            subjectId: s.subjectId,
            subjectName: s.subjectName,
          }))}
          goals={data.goals ?? []}
          onClose={() => setGoalModal(false)}
          onSaved={onGoalSaved}
        />
      )}

      {loading && <Skeleton className="mx-auto h-3 w-24" />}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: typeof BarChart2;
  tone: 'warning' | 'secondary' | 'success' | 'destructive';
  label: string;
  value: string;
  sub: string;
}) {
  const iconBg: Record<string, string> = {
    warning: 'bg-warning text-warning-foreground',
    secondary: 'bg-secondary text-primary',
    success: 'bg-success text-success-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
  };
  const valueColor: Record<string, string> = {
    warning: 'text-warning-foreground',
    secondary: 'text-primary',
    success: 'text-success-foreground',
    destructive: 'text-destructive-foreground',
  };
  return (
    <Card className="gap-1.5 p-4">
      <div className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBg[tone]}`}>
        <Icon size={16} />
      </div>
      <div className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className={`text-[26px] leading-none font-bold ${valueColor[tone]}`}>{value}</div>
      <div className="truncate text-2xs text-muted-foreground">{sub}</div>
    </Card>
  );
}

function TrendCell({
  direction,
  delta,
}: {
  direction: 'up' | 'down' | 'flat' | null;
  delta: number | null;
}) {
  if (direction == null || delta == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (direction === 'flat') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-warning-foreground">
        <Minus size={13} />=
      </span>
    );
  }
  const Icon = direction === 'up' ? TrendingUp : TrendingDown;
  const color = direction === 'up' ? 'text-success-foreground' : 'text-destructive-foreground';
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon size={13} />
      {delta > 0 ? '+' : ''}
      {delta.toFixed(1)}
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-3 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
