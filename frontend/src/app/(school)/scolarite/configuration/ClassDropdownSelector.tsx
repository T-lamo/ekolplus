'use client';

import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { ChevronDown, ChevronUp, Search, Users } from 'lucide-react';
import { FEES } from '@/lib/constants';
import type { FeeClassOption } from './ClassFeePicker';

// Replaces an always-visible class list with a searchable dropdown, matching
// Banani's collapsed-trigger + popover-search pattern (same Popover+cmdk
// combo already used by ActionMenu's searchable variant). Grouped by
// `Class.level` ("3ème", "4ème", …) — the real field closest to Banani's
// mock groupings ("Secondaire"/"Fondamental"/"Primaire"), which map to a
// school-cycle concept this app's Class model doesn't have; level is real
// data, not fabricated.
export function ClassDropdownSelector({
  classes,
  selectedId,
  onSelect,
}: {
  classes: FeeClassOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = FEES.configuration;
  const [open, setOpen] = useState(false);
  const selected = classes.find((c) => c.id === selectedId) ?? null;

  const groups = useMemo(() => {
    const byLevel = new Map<string, FeeClassOption[]>();
    for (const c of classes) {
      const list = byLevel.get(c.level) ?? [];
      list.push(c);
      byLevel.set(c.level, list);
    }
    return Array.from(byLevel.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [classes]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-md border border-primary bg-card px-3 py-2 text-sm font-semibold text-primary"
        >
          <span className="flex items-center gap-2 truncate">
            <Users size={13} className="shrink-0" />
            <span className="truncate">{selected?.name ?? '—'}</span>
          </span>
          {open ? (
            <ChevronUp size={13} className="shrink-0" />
          ) : (
            <ChevronDown size={13} className="shrink-0" />
          )}
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
                placeholder={t.classSearchPlaceholder}
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[320px] overflow-y-auto p-1">
              <Command.Empty className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                {t.noClassFound}
              </Command.Empty>
              {groups.map(([level, items]) => (
                <Command.Group
                  key={level}
                  heading={level}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
                >
                  {items.map((c) => (
                    <Command.Item
                      key={c.id}
                      value={`${c.name} ${level}`}
                      onSelect={() => {
                        onSelect(c.id);
                        setOpen(false);
                      }}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border-l-2 p-1.5 outline-none data-[selected=true]:bg-secondary ${
                        c.id === selectedId
                          ? 'border-l-primary bg-[#faf9ff]'
                          : 'border-l-transparent'
                      }`}
                    >
                      <span
                        className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md ${
                          c.id === selectedId
                            ? 'bg-secondary'
                            : c.configured
                              ? 'bg-success'
                              : 'bg-muted'
                        }`}
                      >
                        <Users
                          size={12}
                          className={
                            c.id === selectedId
                              ? 'text-primary'
                              : c.configured
                                ? 'text-success-foreground'
                                : 'text-muted-foreground'
                          }
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {c.name}
                        </span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {c.configured
                            ? `${c.studentCount} élèves · ${c.trancheCount} tranches`
                            : `${c.studentCount} élèves`}
                        </span>
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${
                          c.configured
                            ? 'bg-success text-success-foreground'
                            : 'bg-warning text-warning-foreground'
                        }`}
                      >
                        {c.configured ? t.editorConfigured : t.editorPending}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
