'use client';

// Chip-based multi-picker for the "Enseigne dans l'établissement" profile
// card in the Personnel creation wizard (Banani:
// .planning/banani/fetches/personnel-module/ajouter-personnel.html lines
// ~804-834 — a labeled chip-row of removable pills ending in a dashed
// "+ Ajouter" chip that opens a searchable checklist). Built as its own
// small component rather than reusing MultiSelect as-is: MultiSelect's
// trigger IS the chip row (a full select-mock bar), which would duplicate
// the chips once inside its own trigger and once more if rendered next to
// it — the mockup instead wants the chips inline in the card body with only
// the "+ Ajouter" affordance as a separate dashed pill. Internals (Radix
// Popover + cmdk Command) mirror MultiSelect's own popover/list so both
// pickers feel the same to use.
import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChipPickerOption {
  id: string;
  label: string;
}

export function AssignmentChipPicker({
  label,
  options,
  value,
  onChange,
  addLabel,
  searchPlaceholder,
  emptyLabel,
  chipClassName = 'bg-secondary text-primary',
  disabled = false,
  ariaLabel,
}: {
  label: string;
  options: ChipPickerOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  addLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  /** Tailwind bg/text pair for the selected chips (theme tokens only). */
  chipClassName?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.id));

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((o) => (
          <span
            key={o.id}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-2xs font-semibold',
              chipClassName,
            )}
          >
            {o.label}
            <button
              type="button"
              aria-label={`${o.label} ×`}
              onClick={() => toggle(o.id)}
              className="flex opacity-70 hover:opacity-100"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={ariaLabel ?? addLabel}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-2xs font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={11} />
              {addLabel}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={4}
              className="z-50 w-64 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
            >
              <Command shouldFilter className="flex flex-col">
                <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
                  <Search size={12} className="shrink-0 text-muted-foreground" />
                  <Command.Input
                    autoFocus
                    placeholder={searchPlaceholder}
                    className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <Command.List className="max-h-[240px] overflow-y-auto p-1">
                  <Command.Empty className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                    {emptyLabel}
                  </Command.Empty>
                  {options.map((o) => {
                    const checked = value.includes(o.id);
                    return (
                      <Command.Item
                        key={o.id}
                        value={o.label}
                        onSelect={() => toggle(o.id)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-caption text-foreground data-[selected=true]:bg-secondary data-[selected=true]:text-primary"
                      >
                        <span
                          className={cn(
                            'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                            checked
                              ? 'border-primary bg-primary text-white'
                              : 'border-border bg-card',
                          )}
                        >
                          {checked && <Check size={9} />}
                        </span>
                        <span className="truncate">{o.label}</span>
                      </Command.Item>
                    );
                  })}
                </Command.List>
              </Command>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}
