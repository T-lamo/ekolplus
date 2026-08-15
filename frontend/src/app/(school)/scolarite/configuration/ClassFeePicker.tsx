'use client';

import { School } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { FEES } from '@/lib/constants';

export interface FeeClassOption {
  id: string;
  name: string;
  level: string;
  studentCount: number;
  configured: boolean;
  trancheCount: number;
}

export type ClassFilter = 'all' | 'configured' | 'pending';

// Progress summary card — Banani's "Classes de l'école" card: header with a
// live N/total configured count, a fill bar, and 3 filter pills. Each pill
// keeps its own semantic tint (not just active/inactive) per the Banani
// source — "Configurées"/"En attente" are always green/amber, "Toutes" is
// the neutral default; the currently active pill gets the bold/solid
// treatment.
export function ClassFeeSummaryCard({
  classes,
  filter,
  onFilterChange,
}: {
  classes: FeeClassOption[];
  filter: ClassFilter;
  onFilterChange: (filter: ClassFilter) => void;
}) {
  const t = FEES.configuration;
  const configuredCount = classes.filter((c) => c.configured).length;
  const pct = classes.length > 0 ? Math.round((configuredCount / classes.length) * 100) : 0;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-border p-3.5">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <School size={13} className="text-primary" />
            {t.classListTitle}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.classListSubtitle}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">
            {t.filterConfigured}
          </span>
          <span className="text-[17px] font-bold text-primary">
            {configuredCount}
            <span className="text-xs font-medium text-muted-foreground"> / {classes.length}</span>
          </span>
        </div>
      </div>

      <div className="px-3.5 pt-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex gap-1.5 p-2.5">
        <FilterPill
          active={filter === 'all'}
          activeClass="bg-primary text-primary-foreground"
          onClick={() => onFilterChange('all')}
        >
          {t.filterAll}
        </FilterPill>
        <FilterPill
          active={filter === 'configured'}
          activeClass="bg-success text-success-foreground ring-2 ring-success-foreground/30"
          baseClass="bg-success text-success-foreground"
          onClick={() => onFilterChange('configured')}
        >
          {t.filterConfigured}
        </FilterPill>
        <FilterPill
          active={filter === 'pending'}
          activeClass="bg-warning text-warning-foreground ring-2 ring-warning-foreground/30"
          baseClass="bg-warning text-warning-foreground"
          onClick={() => onFilterChange('pending')}
        >
          {t.filterPending}
        </FilterPill>
      </div>
    </Card>
  );
}

function FilterPill({
  active,
  activeClass,
  baseClass = 'bg-muted text-muted-foreground',
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  baseClass?: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-2xs font-semibold whitespace-nowrap ${active ? activeClass : baseClass}`}
    >
      {children}
    </button>
  );
}

export function filterClasses(classes: FeeClassOption[], filter: ClassFilter): FeeClassOption[] {
  return classes.filter((c) => {
    if (filter === 'configured') return c.configured;
    if (filter === 'pending') return !c.configured;
    return true;
  });
}
