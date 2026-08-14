'use client';

import { useState } from 'react';

export interface BarChartPoint {
  label: string;
  value: number;
}

// Single-series bar chart (revenue over months) — SVG, no chart lib.
// Dataviz-skill contract: thin marks with 4px rounded data-ends anchored to
// the baseline, 2px surface gaps, recessive grid, muted axis text, per-bar
// hover tooltip with a hit target wider than the mark, and an sr-only table
// so the values are readable without the graphic. Single series → no legend
// (the surrounding card's title names it).
export function BarChart({
  data,
  formatValue,
  height = 180,
  ariaLabel,
}: {
  data: BarChartPoint[];
  formatValue: (v: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
        Aucune donnée sur la période.
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  // "Nice" ceiling: 1/2/5 × 10^n above max, so gridlines land on round values.
  const pow = 10 ** Math.floor(Math.log10(max));
  const niceMax = [1, 2, 5, 10].map((m) => m * pow).find((m) => m >= max) ?? max;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);

  const W = 100; // viewBox width — bars scale with the container
  const H = height;
  const slot = W / data.length;
  const barW = Math.min(slot * 0.55, 9);

  return (
    <div className="relative">
      <div className="flex gap-2">
        {/* Y axis labels (HTML so the font never scales with the viewBox) */}
        <div className="flex flex-col justify-between text-right" style={{ height }}>
          {[...ticks].reverse().map((t) => (
            <span key={t} className="text-[10px] leading-none text-muted-foreground">
              {formatValue(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block w-full"
            style={{ height }}
            role="img"
            aria-label={ariaLabel}
          >
            {ticks.map((t) => {
              const y = H - (t / niceMax) * (H - 8);
              return (
                <line
                  key={t}
                  x1={0}
                  x2={W}
                  y1={y}
                  y2={y}
                  className="stroke-border"
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {data.map((d, i) => {
              const h = (d.value / niceMax) * (H - 8);
              const x = i * slot + (slot - barW) / 2;
              return (
                <g key={d.label}>
                  {/* data-end rounding only at the top: rect overshoots below the baseline, clipped by the viewBox */}
                  <rect
                    x={x}
                    y={H - h}
                    width={barW}
                    height={h + 4}
                    rx={2}
                    className={
                      hovered === null || hovered === i ? 'fill-primary' : 'fill-primary/40'
                    }
                  />
                  {/* invisible hover hit target — the full column, wider than the mark */}
                  <rect
                    x={i * slot}
                    y={0}
                    width={slot}
                    height={H}
                    fill="transparent"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(i)}
                    onBlur={() => setHovered(null)}
                  />
                </g>
              );
            })}
          </svg>
          {hovered !== null && data[hovered] && (
            <div
              className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2.5 py-1.5 shadow-lg"
              style={{ left: `${((hovered + 0.5) / data.length) * 100}%` }}
            >
              <div className="text-[10px] font-semibold whitespace-nowrap text-muted-foreground">
                {data[hovered].label}
              </div>
              <div className="text-xs font-extrabold whitespace-nowrap text-foreground">
                {formatValue(data[hovered].value)}
              </div>
            </div>
          )}
          <div className="mt-1.5 flex">
            {data.map((d) => (
              <span key={d.label} className="flex-1 text-center text-[10px] text-muted-foreground">
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {/* Table view of the same values for screen readers */}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{formatValue(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
