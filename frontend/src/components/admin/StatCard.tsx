import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  /** Small emphasized chip next to the sub text — "+3", "+18%", "-0.4%"… */
  delta?: string | undefined;
  deltaTone?: 'success' | 'destructive' | 'muted';
  /** Muted text after the delta — "ce mois", "vs mois dernier"… */
  sub?: string | undefined;
}

const DELTA_CLASSES = {
  success: 'text-success-foreground',
  destructive: 'text-destructive-foreground',
  muted: 'text-muted-foreground',
} as const;

// KPI card used across all 8 SaaS admin screens (Banani pattern: label +
// icon row, big value, delta chip + context line). Sibling of the school
// side's FeeKpiRow — kept separate because the admin variant's delta/sub
// pairing differs from the fee cards' progress-bar contract.
export function StatCard({ label, value, icon, delta, deltaTone = 'success', sub }: StatCardProps) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-xs font-semibold">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-extrabold text-foreground">{value}</div>
      {(delta !== undefined || sub !== undefined) && (
        <div className="flex items-baseline gap-1.5 text-2xs">
          {delta !== undefined && (
            <span className={cn('font-bold', DELTA_CLASSES[deltaTone])}>{delta}</span>
          )}
          {sub !== undefined && <span className="text-muted-foreground">{sub}</span>}
        </div>
      )}
    </Card>
  );
}
