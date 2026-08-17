'use client';

// Banani `.tabs-bar` / `.tab-item` / `.tab-badge` of the subject pages
// (add-matiere.md): 13px items, 9px 16px padding, active = primary text +
// 2px primary underline. Compétences / Évaluations are deliberately absent
// (no screen selected yet — user decision 2026-08-17).
import { BookMarked, Info, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SubjectTab = 'info' | 'programme' | 'affectations';

const TABS: { key: SubjectTab; label: string; Icon: LucideIcon }[] = [
  { key: 'info', label: 'Informations générales', Icon: Info },
  { key: 'programme', label: 'Programme annuel', Icon: BookMarked },
  { key: 'affectations', label: 'Affectations classes', Icon: Users },
];

export function SubjectTabsBar({
  active,
  onChange,
  counts,
  disabledTabs = [],
  disabledHint,
}: {
  active: SubjectTab;
  onChange: (tab: SubjectTab) => void;
  counts?: Partial<Record<SubjectTab, number>>;
  disabledTabs?: SubjectTab[];
  disabledHint?: string;
}) {
  return (
    <div
      role="tablist"
      className="flex items-center overflow-x-auto border-t border-border px-2 sm:px-3"
    >
      {TABS.map(({ key, label, Icon }) => {
        const isActive = key === active;
        const disabled = disabledTabs.includes(key);
        const count = counts?.[key];
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={disabled || undefined}
            title={disabled ? disabledHint : undefined}
            onClick={() => !disabled && onChange(key)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-[9px] text-caption font-medium whitespace-nowrap',
              isActive
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent text-muted-foreground',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <Icon size={14} />
            {label}
            {count !== undefined && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-secondary px-[5px] text-[10px] font-bold text-primary">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
