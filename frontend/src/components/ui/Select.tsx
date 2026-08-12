'use client';

import type { ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Radix throws on <SelectPrimitive.Item value="">; this sentinel lets
// callers keep passing '' for a real "no selection" option, same as a
// native <select>. Internal only — never exposed to consumers.
const EMPTY_VALUE = '__empty__';

interface SelectProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  name?: string;
  title?: string;
  children: ReactNode;
}

/** Labeled dropdown matching Banani's `.form-select` shape. Built on Radix
 * Select (modeled after the sibling ekolplus project's select.tsx) rather
 * than a native <select> — natives render their option list with the OS's
 * own unstyled popup (no hover state, no check mark, no rounded corners,
 * ignores the app's theme), which looked out of place next to the rest of
 * the app. */
export function Select({
  label,
  value,
  onValueChange,
  disabled = false,
  required = false,
  className,
  id,
  name,
  title,
  children,
}: SelectProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <SelectPrimitive.Root
        value={value === '' ? EMPTY_VALUE : value}
        onValueChange={(v) => onValueChange(v === EMPTY_VALUE ? '' : v)}
        disabled={disabled}
        required={required}
        {...(name !== undefined ? { name } : {})}
      >
        <SelectPrimitive.Trigger
          id={id}
          title={title}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none transition-colors',
            'focus:border-primary focus:ring-3 focus:ring-primary/10',
            'disabled:cursor-not-allowed disabled:opacity-70',
            '[&>span]:line-clamp-1 [&>span]:text-left',
            className,
          )}
        >
          <SelectPrimitive.Value />
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
            className="z-50 max-h-96 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-card p-1 text-foreground shadow-lg"
          >
            <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </label>
  );
}

/** Item renderer shared by `Select` and `FilterSelect` — same checkmark +
 * hover treatment regardless of which trigger it's mounted under. */
export function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <SelectPrimitive.Item
      value={value === '' ? EMPTY_VALUE : value}
      className="relative flex w-full cursor-pointer scroll-my-1 items-center rounded-md py-2 pr-8 pl-3 text-sm text-foreground outline-none select-none data-[highlighted]:bg-secondary data-[highlighted]:text-primary data-[state=checked]:font-semibold data-[state=checked]:text-primary"
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex items-center">
        <Check size={14} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
