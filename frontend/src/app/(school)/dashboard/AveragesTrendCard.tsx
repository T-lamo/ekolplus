'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { DASHBOARD } from '@/lib/constants';
import type { DashboardData } from './types';

const t = DASHBOARD.averagesTrend;

// Single-series line chart (school-wide monthly average, /20) — same SVG,
// no-chart-lib approach as BarChart, translated to a line: straight
// segments (not Banani's decorative bezier — matches this app's existing
// dataviz language), gradient area fill, gaps where a month has no data.
export function AveragesTrendCard({
  yearLabel,
  data,
}: {
  yearLabel: string;
  data: DashboardData['averagesTrend'];
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const W = 100;
  const H = 110;
  const MAX = 20;
  const slot = data.length > 1 ? W / (data.length - 1) : W;

  const points = data.map((d, i) => ({
    x: i * slot,
    y: d.average != null ? H - (d.average / MAX) * (H - 10) : null,
    ...d,
  }));

  // Consecutive runs of non-null points — the line only connects where data exists.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.y == null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push({ x: p.x, y: p.y });
    }
  }
  if (current.length > 0) segments.push(current);

  const hasAnyData = points.some((p) => p.y != null);

  return (
    <Card className="gap-1 p-4 sm:p-5 lg:col-span-1">
      <div>
        <div className="text-caption font-semibold text-foreground">{t.title}</div>
        <div className="mb-2 text-2xs text-muted-foreground">{t.subtitle(yearLabel)}</div>
      </div>
      {!hasAnyData ? (
        <div className="flex h-[110px] items-center justify-center text-xs text-muted-foreground">
          Aucune moyenne publiée sur la période.
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block w-full"
            style={{ height: H }}
            role="img"
            aria-label={`${t.title} — ${t.seriesLabel}`}
          >
            <defs>
              <linearGradient id="dashboardTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {segments.map((seg, si) => (
              <g key={si}>
                {seg.length > 1 && (
                  <path
                    d={`M${seg.map((p) => `${p.x},${p.y}`).join(' L')} L${seg[seg.length - 1]!.x},${H} L${seg[0]!.x},${H} Z`}
                    fill="url(#dashboardTrendGradient)"
                  />
                )}
                <path
                  d={`M${seg.map((p) => `${p.x},${p.y}`).join(' L')}`}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
            {points.map(
              (p, i) =>
                p.y != null && (
                  <circle
                    key={p.month}
                    cx={p.x}
                    cy={p.y}
                    r={hovered === i ? 2.6 : 1.6}
                    fill="var(--color-primary)"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                  />
                ),
            )}
          </svg>
          {hovered !== null && points[hovered]?.y != null && (
            <div
              className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2.5 py-1.5 shadow-lg"
              style={{ left: `${(points[hovered]!.x / W) * 100}%` }}
            >
              <div className="text-[10px] font-semibold whitespace-nowrap text-muted-foreground">
                {points[hovered]!.month}
              </div>
              <div className="text-xs font-extrabold whitespace-nowrap text-foreground">
                {points[hovered]!.average}/20
              </div>
            </div>
          )}
          <div className="mt-1.5 flex">
            {data.map((d) => (
              <span key={d.month} className="flex-1 text-center text-[10px] text-muted-foreground">
                {d.month}
              </span>
            ))}
          </div>
        </div>
      )}
      <table className="sr-only">
        <caption>{t.title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.month}</th>
              <td>{d.average != null ? `${d.average}/20` : 'Aucune donnée'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
