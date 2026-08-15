'use client';

// /admin/statistics — Admin Statistics (Banani nSYPhOOZgccA).
// Plan: .planning/banani/admin-statistics.md. All figures computed from
// real data, including the Q2-decision analytics (retention/churn/LTV/
// heatmap from LoginEvent + SubscriptionStatusChange). "Bulletins générés"
// from the mockup has no backing table — replaced by the real "Notes
// saisies" + "Appréciations rédigées" counters (plan's open question).

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Download,
  GraduationCap,
  School as SchoolIcon,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { ADMIN_STATS as T } from '@/lib/constants';
import { fmtUsd, fmtUsdRound } from '@/lib/admin-format';
import { exportToCsv } from '@/lib/csv-export';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonStatCards } from '@/components/ui/Skeleton';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { BarChart } from '@/components/admin/charts/BarChart';
import { DonutChart } from '@/components/admin/charts/DonutChart';
import { Heatmap } from '@/components/admin/charts/Heatmap';

interface StatsResponse {
  period: string;
  kpis: {
    totalSchools: number;
    schoolsDeltaMonth: number;
    totalStudents: number;
    studentsDeltaMonth: number;
    retentionPct: number | null;
    arrCents: number;
    revPerStudentCents: number | null;
  };
  revenue: {
    series: { label: string; cents: number }[];
    totalCents: number;
    avgCents: number;
    peakCents: number;
    yoyPct: number | null;
  };
  plans: {
    total: number;
    expired: number;
    items: { key: string; name: string; count: number; pct: number }[];
  };
  growth: {
    newSchools: number;
    newStudents: number;
    gradesThisMonth: number;
    appreciationsThisMonth: number;
    churnPct: number | null;
    ltvCents: number | null;
  };
  geo: { country: string; schools: number; cents: number }[];
  heatmap: { rows: string[]; cols: string[]; values: number[][] };
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function GrowthTile({
  label,
  sub,
  value,
  accent,
}: {
  label: string;
  sub: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3.5">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <span className="text-2xs text-muted-foreground">{sub}</span>
      <span
        className={`mt-1 text-lg font-extrabold ${accent ? 'text-success-foreground' : 'text-foreground'}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function AdminStatisticsPage() {
  const [period, setPeriod] = useState('12m');
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setData(await api<StatsResponse>(`/api/admin/stats/detailed?period=${period}`));
    } catch {
      setError(T.loadError);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  function onExport() {
    if (!data) return;
    exportToCsv(
      'statistiques.csv',
      ['Indicateur', 'Valeur'],
      [
        [T.kpi.totalSchools, String(data.kpis.totalSchools)],
        [T.kpi.totalStudents, String(data.kpis.totalStudents)],
        [T.kpi.retention, data.kpis.retentionPct !== null ? `${data.kpis.retentionPct}%` : '—'],
        [T.kpi.arr, fmtUsdRound(data.kpis.arrCents)],
        [T.growth.churn, data.growth.churnPct !== null ? `${data.growth.churnPct}%` : '—'],
        [T.growth.ltv, data.growth.ltvCents !== null ? fmtUsdRound(data.growth.ltvCents) : '—'],
        ...data.revenue.series.map((m) => [`Revenus ${m.label}`, fmtUsd(m.cents)]),
        ...data.geo.map((g) => [`Écoles ${g.country}`, String(g.schools)]),
      ],
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button className="w-auto" onClick={() => void load()}>
          {T.retry}
        </Button>
      </div>
    );
  }

  const maxGeoSchools = data ? Math.max(...data.geo.map((g) => g.schools), 1) : 1;
  const heatmapHasData = data ? data.heatmap.values.flat().some((v) => v > 0) : false;

  return (
    <div className="w-full">
      <AdminPageHeader
        title={T.title}
        subtitle={T.subtitle}
        actions={
          <>
            <div
              role="tablist"
              aria-label="Période"
              className="flex gap-0.5 self-start rounded-md bg-muted p-1"
            >
              {T.periods.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={period === p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`rounded px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                    period === p.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button variant="outline" className="sm:w-auto" onClick={onExport} disabled={!data}>
              <Download size={14} />
              {T.export}
            </Button>
          </>
        }
      />

      {loading || !data ? (
        <div className="flex flex-col gap-4">
          <SkeletonStatCards count={5} />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label={T.kpi.totalSchools}
              value={String(data.kpis.totalSchools)}
              icon={<SchoolIcon size={15} />}
              delta={`+${data.kpis.schoolsDeltaMonth}`}
              sub={T.kpi.thisMonth}
            />
            <StatCard
              label={T.kpi.totalStudents}
              value={data.kpis.totalStudents.toLocaleString('fr-FR')}
              icon={<GraduationCap size={15} />}
              delta={`+${data.kpis.studentsDeltaMonth}`}
              sub={T.kpi.thisMonth}
            />
            <StatCard
              label={T.kpi.retention}
              value={data.kpis.retentionPct !== null ? `${data.kpis.retentionPct}%` : '—'}
              icon={<Users size={15} />}
              deltaTone="muted"
              sub={data.kpis.retentionPct !== null ? T.kpi.retentionSub : T.kpi.notEnoughData}
            />
            <StatCard
              label={T.kpi.arr}
              value={fmtUsdRound(data.kpis.arrCents)}
              icon={<TrendingUp size={15} />}
              deltaTone="muted"
              sub={T.kpi.arrSub}
            />
            <StatCard
              label={T.kpi.revPerStudent}
              value={
                data.kpis.revPerStudentCents !== null ? fmtUsd(data.kpis.revPerStudentCents) : '—'
              }
              icon={<Wallet size={15} />}
              deltaTone="muted"
              sub={
                data.kpis.revPerStudentCents !== null ? T.kpi.revPerStudentSub : T.kpi.notEnoughData
              }
            />
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-[2fr_1fr]">
            <SectionCard title={T.revenue.title} subtitle={T.revenue.subtitle}>
              <div className="px-4 py-4">
                <BarChart
                  data={data.revenue.series.map((m) => ({ label: m.label, value: m.cents }))}
                  formatValue={(v) => fmtUsdRound(v)}
                  ariaLabel={T.revenue.title}
                />
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
                  {(
                    [
                      [T.revenue.total, fmtUsdRound(data.revenue.totalCents)],
                      [T.revenue.avg, fmtUsdRound(data.revenue.avgCents)],
                      [T.revenue.peak, fmtUsdRound(data.revenue.peakCents)],
                      [
                        T.revenue.yoy,
                        data.revenue.yoyPct !== null
                          ? `${data.revenue.yoyPct >= 0 ? '+' : ''}${data.revenue.yoyPct}%`
                          : '—',
                      ],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <div className="text-2xs text-muted-foreground">{label}</div>
                      <div className="text-sm font-extrabold text-foreground">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard title={T.plans.title} subtitle={T.plans.subtitle(data.plans.total)}>
              <div className="px-4 py-4">
                {data.plans.total === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">{T.plans.empty}</p>
                ) : (
                  <DonutChart
                    items={data.plans.items.map((p) => ({
                      label: p.name,
                      value: p.count,
                      percentLabel: `${p.pct}%`,
                    }))}
                    centerValue={String(data.plans.total)}
                    centerLabel={T.plans.center}
                    ariaLabel={T.plans.title}
                    footer={
                      data.plans.expired > 0 ? (
                        <div className="mt-1 flex items-center gap-2 border-t border-border pt-2 text-caption">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40"
                          />
                          <span className="text-muted-foreground">
                            {T.plans.expired(data.plans.expired)}
                          </span>
                        </div>
                      ) : undefined
                    }
                  />
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard title={T.growth.title} subtitle={T.growth.subtitle}>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <GrowthTile
                label={T.growth.newSchools}
                sub={T.growth.newSchoolsSub}
                value={String(data.growth.newSchools)}
                accent
              />
              <GrowthTile
                label={T.growth.newStudents}
                sub={T.growth.newStudentsSub}
                value={String(data.growth.newStudents)}
                accent
              />
              <GrowthTile
                label={T.growth.grades}
                sub={T.growth.gradesSub}
                value={data.growth.gradesThisMonth.toLocaleString('fr-FR')}
              />
              <GrowthTile
                label={T.growth.appreciations}
                sub={T.growth.appreciationsSub}
                value={data.growth.appreciationsThisMonth.toLocaleString('fr-FR')}
              />
              <GrowthTile
                label={T.growth.churn}
                sub={T.growth.churnSub}
                value={data.growth.churnPct !== null ? `${data.growth.churnPct}%` : '—'}
              />
              <GrowthTile
                label={T.growth.ltv}
                sub={T.growth.ltvSub}
                value={data.growth.ltvCents !== null ? fmtUsdRound(data.growth.ltvCents) : '—'}
              />
            </div>
          </SectionCard>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <SectionCard title={T.geo.title} subtitle={T.geo.subtitle}>
              {data.geo.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">{T.geo.empty}</p>
              ) : (
                <div className="flex flex-col gap-3 p-4">
                  {data.geo.map((g) => (
                    <div key={g.country} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-caption font-semibold text-foreground">
                        {g.country}
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(g.schools / maxGeoSchools) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                        {T.geo.schools(g.schools)}
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs font-bold text-foreground">
                        {fmtUsdRound(g.cents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title={T.heatmap.title} subtitle={T.heatmap.subtitle}>
              <div className="p-4">
                {heatmapHasData ? (
                  <Heatmap
                    rows={data.heatmap.rows}
                    cols={data.heatmap.cols}
                    values={data.heatmap.values}
                    legendLow={T.heatmap.low}
                    legendHigh={T.heatmap.high}
                  />
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    {T.heatmap.empty}
                  </p>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
