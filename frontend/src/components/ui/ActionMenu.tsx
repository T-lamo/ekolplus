'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
  divider?: boolean;
}

const MENU_WIDTH = 250;

// Kebab button + popover menu — shared by Classes/Matières/Affectations
// tables (and the Carnet de notes grid), matching Banani's
// `.action-dropdown` pattern. Rendered via a portal to <body> with
// `position: fixed` computed from the button's own bounding rect — some
// callers (Carnet de notes) live inside a horizontally-scrolling table
// wrapper, and an `absolute` popover anchored inside that wrapper gets
// visually clipped by its `overflow` box. Closes on outside click, Escape,
// or any scroll (cheaper and less error-prone than tracking the button's
// position live while the ancestor scrolls).
export function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(rect.right - MENU_WIDTH, 8), window.innerWidth - MENU_WIDTH - 8);
    const top = Math.min(rect.bottom + 4, window.innerHeight - 8);
    setPos({ top, left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="Plus d'actions"
        aria-expanded={open}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted ${open ? 'bg-muted' : ''}`}
      >
        <MoreHorizontal size={14} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="z-50 max-h-[320px] overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-lg"
          >
            {items.map((item, i) => (
              <div key={item.label}>
                {item.divider && i > 0 && <div className="my-1 h-px bg-border" />}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium hover:bg-muted ${
                    item.tone === 'danger' ? 'text-destructive-foreground' : 'text-foreground'
                  }`}
                >
                  {item.icon}
                  <span className="break-words">{item.label}</span>
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
