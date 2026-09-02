'use client';

// Generic multi-select: a `.form-select`-shaped trigger showing the chosen
// items as chips (× to remove), opening a searchable checklist (Radix
// Popover + cmdk). Extracted from the subject form's PrerequisitesPicker so
// the fiche classe (« Matières de la classe ») and any future multi-choice
// field share one implementation. `locked` options stay checked (a Lock
// icon replaces the ×) — the fiche classe uses it for subjects that already
// carry grades.
import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronDown, Lock, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  id: string;
  label: string;
  /** Short form used on the chip (code / abbreviation) — defaults to `label`. */
  chip?: string;
  /** Muted hint on the right of the list row (code, count…). */
  hint?: string;
  /** Small identity swatch on the chip and the row (subject colour). */
  color?: string | null;
  /** Cannot be removed once selected; `lockedHint` explains why. */
  locked?: boolean;
  lockedHint?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  id,
  placeholder = 'Sélectionner…',
  searchPlaceholder = 'Rechercher…',
  emptyLabel = 'Aucun résultat',
  disabled = false,
  className,
  ariaLabel,
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  id?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.id));

  function toggle(option: MultiSelectOption) {
    if (disabled) return;
    const isOn = value.includes(option.id);
    if (isOn && option.locked) return;
    onChange(isOn ? value.filter((v) => v !== option.id) : [...value, option.id]);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-input px-3 py-1.5 text-left text-caption outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70 data-[state=open]:border-primary',
            className,
          )}
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {selected.map((s) => (
                <span
                  key={s.id}
                  title={s.locked ? (s.lockedHint ?? s.label) : s.label}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-2xs font-semibold text-primary"
                >
                  {s.color && (
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ background: s.color }}
                    />
                  )}
                  {s.chip ?? s.label}
                  {s.locked ? (
                    <Lock size={9} className="opacity-70" aria-label={s.lockedHint} />
                  ) : (
                    <span
                      role="button"
                      aria-label={`Retirer ${s.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(s);
                      }}
                      className="flex"
                    >
                      <X size={10} />
                    </span>
                  )}
                </span>
              ))}
            </span>
          )}
          <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
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
            <Command.List className="max-h-[260px] overflow-y-auto p-1">
              <Command.Empty className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                {emptyLabel}
              </Command.Empty>
              {options.map((o) => {
                const checked = value.includes(o.id);
                const frozen = checked && o.locked;
                return (
                  <Command.Item
                    key={o.id}
                    value={`${o.label} ${o.chip ?? ''} ${o.hint ?? ''}`}
                    onSelect={() => toggle(o)}
                    title={frozen ? o.lockedHint : undefined}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-caption text-foreground data-[selected=true]:bg-secondary data-[selected=true]:text-primary',
                      frozen && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                        checked ? 'border-primary bg-primary text-white' : 'border-border bg-card',
                      )}
                    >
                      {checked && <Check size={9} />}
                    </span>
                    {o.color && (
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                        style={{ background: o.color }}
                      />
                    )}
                    <span className="truncate">{o.label}</span>
                    {frozen && <Lock size={11} className="shrink-0 text-muted-foreground" />}
                    {o.hint && (
                      <span className="ml-auto text-2xs text-muted-foreground">{o.hint}</span>
                    )}
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
