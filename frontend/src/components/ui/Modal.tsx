'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  /** Two-column forms (school create/edit) get the wide variant. */
  wide?: boolean;
  /** Wizard forms (teacher/student) get the extra-wide variant. */
  xwide?: boolean;
  /** Rendered below the title bar, outside the scroll area — stays fixed
   * while the body scrolls (wizard steppers). */
  header?: ReactNode;
  /** Rendered below the scroll area, fixed (wizard navigation). */
  footer?: ReactNode;
  children: ReactNode;
}

/** Centered overlay modal — first real consumer is Epic 4's form modals
 * (Subject/Class/Assignment). Escape + backdrop close; no animation library. */
export function Modal({
  title,
  onClose,
  wide = false,
  xwide = false,
  header,
  footer,
  children,
}: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const maxWidth = xwide ? 'max-w-[980px]' : wide ? 'max-w-[760px]' : 'max-w-[520px]';

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-card ${maxWidth}`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[13px] font-bold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>
        {header && <div className="border-b border-border px-5 py-3">{header}</div>}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-border px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
