// Sequential heatmap (logins by weekday × time slot) — single violet hue,
// light→dark, monotonic lightness (dataviz skill: sequential = one hue).
// Every cell shows its value as text, so the color is reinforcement, not the
// only encoding — which also serves as the accessible table view.

const BUCKETS = [
  { min: 0.8, cell: 'bg-primary text-primary-foreground' },
  { min: 0.6, cell: 'bg-primary/75 text-primary-foreground' },
  { min: 0.4, cell: 'bg-primary/50 text-foreground' },
  { min: 0.15, cell: 'bg-primary/25 text-foreground' },
  { min: 0, cell: 'bg-primary/8 text-muted-foreground' },
] as const;

function cellClass(value: number, max: number): string {
  if (max <= 0 || value <= 0) return 'bg-muted text-muted-foreground';
  const frac = value / max;
  return (BUCKETS.find((b) => frac >= b.min) ?? BUCKETS[BUCKETS.length - 1]!).cell;
}

export function Heatmap({
  rows,
  cols,
  values,
  legendLow,
  legendHigh,
}: {
  rows: string[];
  cols: string[];
  /** values[rowIndex][colIndex] */
  values: number[][];
  legendLow: string;
  legendHigh: string;
}) {
  const max = Math.max(...values.flat(), 0);
  return (
    <div className="min-w-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-0.5">
          <thead>
            <tr>
              <th aria-hidden className="w-24" />
              {cols.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="pb-1 text-center text-[11px] font-semibold text-muted-foreground"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r}>
                <th
                  scope="row"
                  className="pr-2 text-left text-[11px] font-semibold whitespace-nowrap text-muted-foreground"
                >
                  {r}
                </th>
                {cols.map((c, ci) => {
                  const v = values[ri]?.[ci] ?? 0;
                  return (
                    <td
                      key={c}
                      className={`h-9 rounded-md text-center text-[11px] font-bold tabular-nums ${cellClass(v, max)}`}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        <span>{legendLow}</span>
        <span aria-hidden className="h-2.5 w-4 rounded-sm bg-primary/8" />
        <span aria-hidden className="h-2.5 w-4 rounded-sm bg-primary/25" />
        <span aria-hidden className="h-2.5 w-4 rounded-sm bg-primary/50" />
        <span aria-hidden className="h-2.5 w-4 rounded-sm bg-primary/75" />
        <span aria-hidden className="h-2.5 w-4 rounded-sm bg-primary" />
        <span>{legendHigh}</span>
      </div>
    </div>
  );
}
