'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
  divider?: boolean;
}

// Kebab button + popover menu — shared by Classes/Matières/Affectations
// tables, matching Banani's `.action-dropdown` pattern (opens under the
// kebab, closes on outside click or Escape).
export function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Plus d'actions"
        aria-expanded={open}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted ${open ? 'bg-muted' : ''}`}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute top-9 right-0 z-20 max-h-[320px] min-w-[210px] overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-lg">
          {items.map((item, i) => (
            <div key={item.label}>
              {item.divider && i > 0 && <div className="my-1 h-px bg-border" />}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium whitespace-nowrap hover:bg-muted ${
                  item.tone === 'danger' ? 'text-destructive-foreground' : 'text-foreground'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
