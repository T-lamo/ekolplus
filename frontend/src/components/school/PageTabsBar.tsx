'use client';

// Banani `.tabs-bar` / `.tab-item` / `.tab-badge` shared by the entity pages
// (fiche matière, fiche classe): 13px items, 9px 16px padding, active =
// primary text + 2px primary underline. Badge = count (secondary/primary) or
// « done » (success + ✓) — add-class.md.
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageTab<K extends string> {
  key: K;
  label: string;
  Icon: LucideIcon;
}

export function PageTabsBar<K extends string>({
  tabs,
  active,
  onChange,
  counts,
  done = [],
  disabledTabs = [],
  disabledHint,
  ariaLabel,
}: {
  tabs: readonly PageTab<K>[];
  active: K;
  onChange: (tab: K) => void;
  counts?: Partial<Record<K, number>>;
  /** Tabs whose section is complete — badge becomes a green ✓. */
  done?: readonly K[];
  disabledTabs?: readonly K[];
  disabledHint?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center overflow-x-auto border-t border-border px-2 sm:px-3"
    >
      {tabs.map(({ key, label, Icon }) => {
        const isActive = key === active;
        const disabled = disabledTabs.includes(key);
        const isDone = done.includes(key);
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
            {isDone ? (
              <span
                aria-label="Section complète"
                className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-success text-success-foreground"
              >
                <Check size={10} strokeWidth={3} />
              </span>
            ) : count !== undefined ? (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-secondary px-[5px] text-[10px] font-bold text-primary">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
