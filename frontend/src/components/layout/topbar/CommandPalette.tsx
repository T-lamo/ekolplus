'use client';

import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { NavSection } from '../sidebar/types';

export function CommandPalette({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 min-w-[200px] items-center gap-2 rounded-full border border-border bg-card px-3.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 sm:flex"
      >
        <Search size={13} />
        <span className="flex-1 text-left">Recherche globale...</span>
        <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Recherche globale"
        className="fixed top-[15%] left-1/2 z-50 w-full max-w-md -translate-x-1/2 rounded-lg border border-border bg-card p-2 shadow-xl"
      >
        <Command.Input
          placeholder="Rechercher une page..."
          className="w-full border-b border-border bg-transparent px-2 py-2 text-sm text-foreground outline-none"
        />
        <Command.List className="max-h-80 overflow-y-auto py-2">
          <Command.Empty className="px-2 py-4 text-center text-sm text-muted-foreground">
            Aucun résultat.
          </Command.Empty>
          {sections.map((section) => (
            <Command.Group
              key={section.label}
              heading={section.label}
              className="px-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase [&_[cmdk-group-items]]:mt-1"
            >
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.href}
                    value={`${section.label} ${item.label}`}
                    onSelect={() => go(item.href)}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground normal-case data-[selected=true]:bg-secondary data-[selected=true]:text-primary"
                  >
                    <Icon size={14} />
                    {item.label}
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
