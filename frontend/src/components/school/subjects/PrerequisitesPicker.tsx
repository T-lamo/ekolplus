'use client';

// "Prérequis" multi-select of the subject form (add-matiere.md): the
// `.form-select` trigger opens a searchable checklist of the school's other
// subjects (Popover + cmdk, same combo as ClassDropdownSelector).
import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PrerequisiteOption {
  id: string;
  name: string;
  code: string | null;
}

export function PrerequisitesPicker({
  options,
  value,
  onChange,
  id,
}: {
  options: PrerequisiteOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.id));

  function toggle(optionId: string) {
    onChange(value.includes(optionId) ? value.filter((v) => v !== optionId) : [...value, optionId]);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-input px-3 py-1.5 text-left text-caption outline-none focus:border-primary focus:ring-3 focus:ring-primary/10"
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">Sélectionner des matières prérequises…</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {selected.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-2xs font-semibold text-primary"
                >
                  {s.code ?? s.name}
                  <span
                    role="button"
                    aria-label={`Retirer ${s.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(s.id);
                    }}
                    className="flex"
                  >
                    <X size={10} />
                  </span>
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
                placeholder="Rechercher une matière…"
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[260px] overflow-y-auto p-1">
              <Command.Empty className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                Aucune matière trouvée
              </Command.Empty>
              {options.map((o) => {
                const checked = value.includes(o.id);
                return (
                  <Command.Item
                    key={o.id}
                    value={`${o.name} ${o.code ?? ''}`}
                    onSelect={() => toggle(o.id)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-caption text-foreground data-[selected=true]:bg-secondary data-[selected=true]:text-primary"
                  >
                    <span
                      className={cn(
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                        checked ? 'border-primary bg-primary text-white' : 'border-border bg-card',
                      )}
                    >
                      {checked && <Check size={9} />}
                    </span>
                    <span className="truncate">{o.name}</span>
                    {o.code && (
                      <span className="ml-auto text-2xs text-muted-foreground">{o.code}</span>
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
