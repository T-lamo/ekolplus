import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export interface FeeKpiItem {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string | undefined;
  progressPercent?: number | undefined;
}

// 4-card KPI row shared by Fee Management and Relances Impayés — 2 cards on
// each screen show a thin progress bar under the value (Banani's own
// pattern), the rest are plain number+label.
export function FeeKpiRow({ items }: { items: FeeKpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="gap-2 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            {item.icon}
            <span className="text-xs font-semibold">{item.label}</span>
          </div>
          <div className="text-xl font-extrabold text-foreground">{item.value}</div>
          {item.sub && <div className="text-2xs text-muted-foreground">{item.sub}</div>}
          {item.progressPercent !== undefined && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(Math.max(item.progressPercent, 0), 100)}%` }}
              />
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
