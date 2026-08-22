'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import type { DashboardData } from './types';

// Single-series line chart (school-wide monthly average, /20) — same SVG,
// no-chart-lib approach as BarChart, translated to a line: one continuous
// straight-segment polyline (not Banani's decorative bezier — matches this
// app's existing dataviz language) through every month that has data, in
// chronological order — months with no average are skipped over rather
// than breaking the line, since most months in a real dataset are sparse
// and a line broken at every gap read as arbitrary fragments instead of
// a trend. No area fill: an average has no meaningful "area under the
// curve", and the fill only ever highlighted whichever pair of months
// happened to be calendar-adjacent, which read as an arbitrary box.
//
// Markers are plain HTML dots (not SVG <circle>), positioned by percentage
// over the SVG rather than drawn inside it: the SVG's viewBox is stretched
// non-uniformly (fluid width, fixed height) so a fluent-width visitor's
// browser can render it responsively, but a <circle> caught in that same
// non-uniform scale renders as a squashed ellipse, not a dot — invisible
// for isolated single-month points with no neighbor to draw a line to.
// HTML markers sidestep the distortion entirely and hit the ≥8px dataviz
// mark spec that r=1.6 SVG units never could.
const GRID_VALUES = [0, 10, 20];

export function AveragesTrendCard({
  yearLabel,
  data,
}: {
  yearLabel: string;
  data: DashboardData['averagesTrend'];
}) {
  const t = useTranslations('Dashboard.averagesTrend');
  const [hovered, setHovered] = useState<number | null>(null);

  const W = 100;
  const H = 110;
  const MAX = 20;
  const slot = data.length > 1 ? W / (data.length - 1) : W;
  const yFor = (value: number) => H - (value / MAX) * (H - 10);

  const points = data.map((d, i) => ({
    x: i * slot,
    y: d.average != null ? yFor(d.average) : null,
    ...d,
  }));

  // One continuous line through every month that has data, in order —
  // months with no average are skipped, not treated as a break in the line.
  const linePoints = points
    .filter((p): p is (typeof points)[number] & { y: number } => p.y != null)
    .map((p) => ({ x: p.x, y: p.y }));

  const hasAnyData = points.some((p) => p.y != null);

  return (
    <Card className="gap-1 p-4 sm:p-5 lg:col-span-1">
      <div>
        <div className="text-caption font-semibold text-foreground">{t('title')}</div>
        <div className="mb-2 text-2xs text-muted-foreground">{t('subtitle', { yearLabel })}</div>
      </div>
      {!hasAnyData ? (
        <div className="flex h-[110px] items-center justify-center text-xs text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="flex gap-1.5">
          {/* Y-axis labels — same yFor() mapping as the gridlines below, so
              a "10" always lines up with its own hairline. */}
          <div className="relative w-4 shrink-0" style={{ height: H }} aria-hidden="true">
            {GRID_VALUES.map((v) => (
              <span
                key={v}
                className="absolute right-0 -translate-y-1/2 text-[9px] text-muted-foreground"
                style={{ top: `${(yFor(v) / H) * 100}%` }}
              >
                {v}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            {/* Plot area — SVG and the HTML marker overlay must share this exact
                H-tall box. Without it, "absolute inset-0" on the marker overlay
                would stretch to this column's full height (SVG + month-label row
                below), so a top:${p.y/H*100}% would be a percentage of the WRONG,
                taller box — every dot rendering visibly below where the line
                actually plots that same value. */}
            <div className="relative" style={{ height: H }}>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="block w-full"
                style={{ height: H }}
                role="img"
                aria-label={`${t('title')} — ${t('seriesLabel')}`}
              >
                {GRID_VALUES.map((v) => (
                  <line
                    key={v}
                    x1={0}
                    x2={W}
                    y1={yFor(v)}
                    y2={yFor(v)}
                    stroke="var(--color-border)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {linePoints.length > 1 && (
                  <path
                    d={`M${linePoints.map((p) => `${p.x},${p.y}`).join(' L')}`}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
              <div className="absolute inset-0">
                {points.map(
                  (p, i) =>
                    p.y != null && (
                      <div
                        key={p.month}
                        role="button"
                        tabIndex={0}
                        aria-label={`${p.month} — ${p.average}/20`}
                        className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center"
                        style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(i)}
                        onBlur={() => setHovered(null)}
                        onClick={() => setHovered(hovered === i ? null : i)}
                      >
                        <div
                          aria-hidden="true"
                          className="rounded-full bg-primary transition-[width,height]"
                          style={{
                            width: hovered === i ? '12px' : '9px',
                            height: hovered === i ? '12px' : '9px',
                            boxShadow: '0 0 0 2px var(--color-card)',
                          }}
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -top-3.5 text-[9px] font-semibold whitespace-nowrap text-muted-foreground"
                        >
                          {p.average}
                        </span>
                      </div>
                    ),
                )}
              </div>
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
            </div>
            <div className="mt-1.5 flex">
              {data.map((d) => (
                <span
                  key={d.month}
                  className="flex-1 text-center text-[10px] text-muted-foreground"
                >
                  {d.month}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      <table className="sr-only">
        <caption>{t('title')}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.month}</th>
              <td>{d.average != null ? `${d.average}/20` : t('noData')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
