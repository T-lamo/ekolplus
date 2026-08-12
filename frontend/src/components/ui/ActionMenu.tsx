'use client';

import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
  divider?: boolean;
}

// Kebab button + dropdown menu — shared by Élèves/Enseignants/Classes/
// Matières/Affectations tables (and the Carnet de notes grid), matching
// Banani's `.action-dropdown` pattern. Built on Radix DropdownMenu (same
// primitive already used by SidebarUserProfile/CommandPalette) rather than
// hand-rolled position tracking — Radix's own Portal already renders to
// <body> and repositions on scroll/resize, which is what the previous
// manual implementation was working around for callers that live inside a
// horizontally-scrolling table wrapper (Carnet de notes).
export function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Plus d'actions"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted data-[state=open]:bg-muted"
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 w-[250px] rounded-lg border border-border bg-card p-1.5 shadow-lg"
        >
          {items.map((item, i) => (
            <div key={item.label}>
              {item.divider && i > 0 && <DropdownMenu.Separator className="my-1 h-px bg-border" />}
              <DropdownMenu.Item
                onSelect={item.onClick}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium outline-none ${
                  item.tone === 'danger'
                    ? 'text-destructive-foreground data-[highlighted]:bg-destructive'
                    : 'text-foreground data-[highlighted]:bg-secondary data-[highlighted]:text-primary'
                }`}
              >
                {item.icon}
                <span className="break-words">{item.label}</span>
              </DropdownMenu.Item>
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
