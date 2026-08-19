'use client';

import { useId, type ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SelectItem } from './Select';

const EMPTY_VALUE = '__empty__';

interface FilterSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  /** Accessible name of the combobox (e.g. « Filtrer par classe »). When
   * omitted the trigger is labelled by its own current value — a
   * `role="combobox"` cannot take its name from content, so without this
   * axe/Lighthouse flag `button-name`. */
  ariaLabel?: string;
  children: ReactNode;
}

/** Unlabeled dropdown for toolbar filter rows — same Radix Select engine and
 * item styling as `Select`, without the <label> wrapper that component
 * needs for real form fields. Re-exports `SelectItem` so callers use the
 * same `<SelectItem>` for both. */
export function FilterSelect({
  value,
  onValueChange,
  disabled = false,
  className,
  title,
  ariaLabel,
  children,
}: FilterSelectProps) {
  const valueId = useId();
  return (
    <SelectPrimitive.Root
      value={value === '' ? EMPTY_VALUE : value}
      onValueChange={(v) => onValueChange(v === EMPTY_VALUE ? '' : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        title={title}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : valueId}
        className={cn(
          'flex h-10 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition-colors',
          'focus:border-primary focus:ring-3 focus:ring-primary/10',
          'disabled:cursor-not-allowed disabled:opacity-70',
          '[&>span]:line-clamp-1 [&>span]:text-left',
          className,
        )}
      >
        <SelectPrimitive.Value id={valueId} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            size={14}
            className="shrink-0 text-muted-foreground transition-transform duration-200 data-[state=open]:rotate-180"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-96 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-card p-1 text-foreground shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export { SelectItem };
