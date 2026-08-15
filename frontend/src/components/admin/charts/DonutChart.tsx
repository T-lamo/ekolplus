'use client';

import type { ReactNode } from 'react';

export interface DonutItem {
  label: string;
  value: number;
  /** Percent share, precomputed by the caller so rounding is consistent with the page. */
  percentLabel: string;
}

// Fixed categorical assignment (dataviz skill): slot order is the identity,
// never cycled — chart-1 = Premium, chart-2 = Essentiel, chart-3 = Starter.
const SLOT_CLASSES = ['stroke-chart-1', 'stroke-chart-2', 'stroke-chart-3'] as const;
const SWATCH_CLASSES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3'] as const;

// Donut with center total + built-in legend (swatch, label, count, %) —
// identity is never color-alone: every slice is named in the legend beside
// the graphic. Max 3 slices by design (the 3 plans); "Expirés" and other
// non-categories render through `footer`, not as a 4th hue.
export function DonutChart({
  items,
  centerValue,
  centerLabel,
  ariaLabel,
  footer,
}: {
  items: DonutItem[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
  footer?: ReactNode;
}) {
  const total = items.reduce((s, it) => s + it.value, 0);
  const R = 42;
  const STROKE = 14;
  const C = 2 * Math.PI * R;
  // 2px surface gap between segments, in circumference units (viewBox is 110 wide ≈ rendered ~160px).
  const GAP = total > 0 && items.filter((it) => it.value > 0).length > 1 ? 3 : 0;

  let offset = -C / 4; // start at 12 o'clock
  const segments = items.map((it, i) => {
    const frac = total > 0 ? it.value / total : 0;
    const len = Math.max(frac * C - GAP, 0);
    const seg = { ...it, slot: i, len, offset };
    offset += frac * C;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg viewBox="0 0 110 110" className="h-40 w-40" role="img" aria-label={ariaLabel}>
          {total === 0 ? (
            <circle
              cx={55}
              cy={55}
              r={R}
              className="stroke-muted"
              strokeWidth={STROKE}
              fill="none"
            />
          ) : (
            segments.map(
              (seg) =>
                seg.len > 0 && (
                  <circle
                    key={seg.label}
                    cx={55}
                    cy={55}
                    r={R}
                    fill="none"
                    strokeWidth={STROKE}
                    strokeDasharray={`${seg.len} ${C - seg.len}`}
                    strokeDashoffset={-seg.offset}
                    strokeLinecap="butt"
                    className={SLOT_CLASSES[seg.slot] ?? 'stroke-chart-1'}
                  />
                ),
            )
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-foreground">{centerValue}</span>
          <span className="text-[10px] text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-2">
        {items.map((it, i) => (
          <div key={it.label} className="flex items-center gap-2 text-caption">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${SWATCH_CLASSES[i] ?? 'bg-chart-1'}`}
            />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{it.label}</span>
            <span className="font-bold text-foreground">{it.value}</span>
            <span className="w-11 text-right text-xs text-muted-foreground">{it.percentLabel}</span>
          </div>
        ))}
        {footer}
      </div>
    </div>
  );
}
