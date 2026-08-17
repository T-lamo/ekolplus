'use client';

// Banani `.filter-select` of the timetable filter bar: compact bordered
// trigger (12px, 5px 10px) with a leading lucide icon, label and chevron —
// deliberately tighter than the app-wide ui/FilterSelect (h-10, 14px) which
// is sized for resource-list toolbars. Same Radix engine + SelectItem so the
// open list looks identical.
import type { ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import { SelectItem } from '@/components/ui/Select';
import { cn } from '@/lib/utils';

const EMPTY = '__empty__';

export function TimetableFilterSelect({
  icon,
  value,
  onValueChange,
  ariaLabel,
  className,
  children,
}: {
  icon: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <SelectPrimitive.Root
      value={value === '' ? EMPTY : value}
      onValueChange={(v) => onValueChange(v === EMPTY ? '' : v)}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'flex h-[30px] max-w-full items-center gap-1.5 rounded-md border border-border bg-input px-2.5 text-xs text-foreground outline-none transition-colors',
          'focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/10 data-[state=open]:border-primary',
          '[&>span]:truncate',
          className,
        )}
      >
        <span className="flex shrink-0 text-muted-foreground [&>svg]:h-3 [&>svg]:w-3">{icon}</span>
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={11} className="shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-card p-1 text-foreground shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export { SelectItem };
