'use client';

// "Statistiques" tab — was a toast stub ("bientôt disponible"). Everything
// here is derived client-side from the same `data` the "Par élève" and
// "Par matière" tabs already have in memory (no new API calls): a mention
// distribution, a general-average histogram, and a per-subject completion
// chart. Same derivation pattern as carnet-de-notes/StatistiquesTab.tsx.

import { useMemo } from 'react';
import { Award, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { BarChart, type BarChartPoint } from '@/components/admin/charts/BarChart';
import { MENTION_LABEL, type AppreciationsListData, type Mention } from './types';

const AVG_BUCKETS = [
  { label: '0-4', min: 0, max: 4 },
  { label: '4-8', min: 4, max: 8 },
  { label: '8-12', min: 8, max: 12 },
  { label: '12-16', min: 12, max: 16 },
  { label: '16-20', min: 16, max: 20.01 },
];

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

export function StatistiquesTab({ data }: { data: AppreciationsListData }) {
  const {
    mentionDistribution,
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
    const mentionDistribution: BarChartPoint[] = (Object.keys(MENTION_LABEL) as Mention[]).map(
      (m) => ({ label: MENTION_LABEL[m], value: mentionCounts.get(m) ?? 0 }),
    );

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
      mentionDistribution,
      averageDistribution,
      subjectCompletion,
      completionRate,
      classAverage,
      topMention,
    };
  }, [data]);

  if (data.totalCount === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <p className="text-sm text-muted-foreground">Aucune donnée pour cette classe.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={CheckCircle2}
          tone="success"
          label="Taux de complétion"
          value={completionRate != null ? `${completionRate}%` : '—'}
          sub={`${data.saisieCount} sur ${data.totalCount} élèves`}
        />
        <StatTile
          icon={TrendingUp}
          tone="blue"
          label="Moyenne de classe"
          value={fmt(classAverage)}
          sub="toutes appréciations confondues"
        />
        <StatTile
          icon={Award}
          tone="success"
          label="Mention la plus fréquente"
          value={topMention ? MENTION_LABEL[topMention.mention] : '—'}
          sub={
            topMention
              ? `${topMention.count} élève${topMention.count > 1 ? 's' : ''}`
              : 'Aucune mention saisie'
          }
        />
        <StatTile
          icon={AlertTriangle}
          tone="destructive"
          label="À surveiller"
          value={String(data.alertCount)}
          sub="mentions insuffisant"
        />
      </div>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">Répartition des mentions</div>
          <p className="text-2xs text-muted-foreground">
            Nombre d&apos;élèves par mention, sur les appréciations saisies.
          </p>
        </div>
        <BarChart
          data={mentionDistribution}
          formatValue={(v) => String(Math.round(v))}
          ariaLabel="Répartition des élèves par mention"
        />
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">Répartition des moyennes</div>
          <p className="text-2xs text-muted-foreground">Moyennes générales des élèves, sur 20.</p>
        </div>
        <BarChart
          data={averageDistribution}
          formatValue={(v) => String(Math.round(v))}
          ariaLabel="Répartition des moyennes générales"
        />
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">Complétion par matière</div>
          <p className="text-2xs text-muted-foreground">
            Pourcentage d&apos;appréciations saisies par matière.
          </p>
        </div>
        {subjectCompletion.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Aucune matière configurée pour cette classe.
          </p>
        ) : (
          <BarChart
            data={subjectCompletion}
            formatValue={(v) => `${Math.round(v)}%`}
            ariaLabel="Pourcentage d'appréciations saisies par matière"
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
