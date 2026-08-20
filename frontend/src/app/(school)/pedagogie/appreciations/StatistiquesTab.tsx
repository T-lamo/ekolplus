'use client';

// "Statistiques" tab — was a toast stub ("bientôt disponible"). Everything
// here is derived client-side from the same `data` the "Par élève" and
// "Par matière" tabs already have in memory (no new API calls): a mention
// distribution, a general-average histogram, and a per-subject completion
// chart. Same derivation pattern as carnet-de-notes/StatistiquesTab.tsx.
//
// The mention chart's LABELS are translated, so they are built outside the
// `useMemo` (which stays a pure function of `data`) — 6 entries, cheap
// enough that memoizing them would only add a translator dependency.

import { useMemo } from 'react';
import { Award, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { BarChart, type BarChartPoint } from '@/components/admin/charts/BarChart';
import { fmtAverage } from './format';
import { MENTIONS, type AppreciationsListData, type Mention } from './types';

const AVG_BUCKETS = [
  { label: '0-4', min: 0, max: 4 },
  { label: '4-8', min: 4, max: 8 },
  { label: '8-12', min: 8, max: 12 },
  { label: '12-16', min: 12, max: 16 },
  { label: '16-20', min: 16, max: 20.01 },
];

export function StatistiquesTab({ data }: { data: AppreciationsListData }) {
  const t = useTranslations('Appreciations.statistiques');
  const tMention = useTranslations('Appreciations.mention');
  const locale = useLocale();

  const {
    mentionCounts,
    averageDistribution,
    subjectCompletion,
    completionRate,
    classAverage,
    topMention,
  } = useMemo(() => {
    const mentionCounts = new Map<Mention, number>();
    for (const s of data.students) {
      if (!s.mention) continue;
      mentionCounts.set(s.mention, (mentionCounts.get(s.mention) ?? 0) + 1);
    }

    const averages = data.students.map((s) => s.average).filter((a): a is number => a != null);
    const averageDistribution: BarChartPoint[] = AVG_BUCKETS.map((b) => ({
      label: b.label,
      value: averages.filter((a) => a >= b.min && a < b.max).length,
    }));
    const classAverage =
      averages.length > 0
        ? Math.round((averages.reduce((s, v) => s + v, 0) / averages.length) * 10) / 10
        : null;

    const subjectCompletion: BarChartPoint[] = data.subjects.map((s) => ({
      label: s.subjectName,
      value: s.totalCount > 0 ? Math.round((s.saisieCount / s.totalCount) * 100) : 0,
    }));

    const completionRate =
      data.totalCount > 0 ? Math.round((data.saisieCount / data.totalCount) * 100) : null;

    let topMention: { mention: Mention; count: number } | null = null;
    for (const [mention, count] of mentionCounts) {
      if (!topMention || count > topMention.count) topMention = { mention, count };
    }

    return {
      mentionCounts,
      averageDistribution,
      subjectCompletion,
      completionRate,
      classAverage,
      topMention,
    };
  }, [data]);

  const mentionDistribution: BarChartPoint[] = MENTIONS.map((m) => ({
    label: tMention(m),
    value: mentionCounts.get(m) ?? 0,
  }));

  if (data.totalCount === 0) {
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
          label={t('completionRate')}
          value={completionRate != null ? `${completionRate}%` : '—'}
          sub={t(data.totalCount > 1 ? 'completionRateSub.other' : 'completionRateSub.one', {
            count: data.saisieCount,
            total: data.totalCount,
          })}
        />
        <StatTile
          icon={TrendingUp}
          tone="blue"
          label={t('classAverage')}
          value={fmtAverage(classAverage, locale)}
          sub={t('classAverageSub')}
        />
        <StatTile
          icon={Award}
          tone="success"
          label={t('topMention')}
          value={topMention ? tMention(topMention.mention) : '—'}
          sub={
            topMention
              ? t(topMention.count > 1 ? 'topMentionSub.other' : 'topMentionSub.one', {
                  count: topMention.count,
                })
              : t('noMention')
          }
        />
        <StatTile
          icon={AlertTriangle}
          tone="destructive"
          label={t('toWatch')}
          value={String(data.alertCount)}
          sub={t('toWatchSub')}
        />
      </div>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">{t('mentionChartTitle')}</div>
          <p className="text-2xs text-muted-foreground">{t('mentionChartSub')}</p>
        </div>
        <BarChart
          data={mentionDistribution}
          formatValue={(v) => String(Math.round(v))}
          ariaLabel={t('mentionChartAriaLabel')}
        />
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">{t('averageChartTitle')}</div>
          <p className="text-2xs text-muted-foreground">{t('averageChartSub')}</p>
        </div>
        <BarChart
          data={averageDistribution}
          formatValue={(v) => String(Math.round(v))}
          ariaLabel={t('averageChartAriaLabel')}
        />
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">
            {t('completionChartTitle')}
          </div>
          <p className="text-2xs text-muted-foreground">{t('completionChartSub')}</p>
        </div>
        {subjectCompletion.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {t('completionChartEmpty')}
          </p>
        ) : (
          <BarChart
            data={subjectCompletion}
            formatValue={(v) => `${Math.round(v)}%`}
            ariaLabel={t('completionChartAriaLabel')}
          />
        )}
      </Card>
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
