'use client';

import { Fragment, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { MoreHorizontal, Search } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
  divider?: boolean;
}

const TRIGGER_CLASS =
  'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted data-[state=open]:bg-muted';

function itemToneClass(
  tone: ActionMenuItem['tone'] | undefined,
  dataAttr: 'highlighted' | 'selected',
) {
  return tone === 'danger'
    ? `text-destructive-foreground data-[${dataAttr}=true]:bg-destructive`
    : `text-foreground data-[${dataAttr}=true]:bg-secondary data-[${dataAttr}=true]:text-primary`;
}

// Kebab button + dropdown menu — shared by Élèves/Enseignants/Classes/
// Matières/Affectations tables (and the Carnet de notes grid), matching
// Banani's `.action-dropdown` pattern. Built on Radix DropdownMenu — Radix's
// own Portal already renders to <body> and repositions on scroll/resize,
// which is what a previous hand-rolled implementation was working around
// for callers that live inside a horizontally-scrolling table wrapper
// (Carnet de notes).
//
// `searchable` swaps to a Popover + cmdk Command combobox instead (same
// primitive CommandPalette already uses for ⌘K) — for callers whose item
// list is dynamic and can grow past what fits on screen (e.g. Carnet de
// notes generates one "Modifier" entry per subject × evaluation), typing
// filters straight to the wanted action instead of scrolling a long list.
export function ActionMenu({
  items,
  searchable = false,
}: {
  items: ActionMenuItem[];
  searchable?: boolean;
}) {
  if (searchable) return <SearchableActionMenu items={items} />;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label="Plus d'actions" className={TRIGGER_CLASS}>
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="z-50 max-h-[min(400px,var(--radix-dropdown-menu-content-available-height))] w-[250px] overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-lg"
        >
          {items.map((item, i) => (
            <Fragment key={item.label}>
              {item.divider && i > 0 && <DropdownMenu.Separator className="my-1 h-px bg-border" />}
              <DropdownMenu.Item
                onSelect={item.onClick}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-caption font-medium outline-none ${itemToneClass(item.tone, 'highlighted')}`}
              >
                {item.icon}
                <span className="break-words">{item.label}</span>
              </DropdownMenu.Item>
            </Fragment>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SearchableActionMenu({ items }: { items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  function select(item: ActionMenuItem) {
    setOpen(false);
    setQuery('');
    item.onClick();
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger asChild>
        <button type="button" aria-label="Plus d'actions" className={TRIGGER_CLASS}>
          <MoreHorizontal size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="z-50 w-[280px] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <Command shouldFilter className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
              <Search size={13} className="shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Rechercher une action..."
                className="w-full bg-transparent text-caption text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[min(320px,var(--radix-popover-content-available-height))] overflow-y-auto p-1.5">
              <Command.Empty className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                Aucune action trouvée.
              </Command.Empty>
              {items.map((item, i) => (
                <Fragment key={item.label}>
                  {item.divider && i > 0 && query.trim() === '' && (
                    <Command.Separator className="my-1 h-px bg-border" />
                  )}
                  <Command.Item
                    value={item.label}
                    onSelect={() => select(item)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-caption font-medium outline-none ${itemToneClass(item.tone, 'selected')}`}
                  >
                    {item.icon}
                    <span className="break-words">{item.label}</span>
                  </Command.Item>
                </Fragment>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
