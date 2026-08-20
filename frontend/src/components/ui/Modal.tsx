'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ModalProps {
  title: string;
  /** Optional one-line subtitle under the title — switches the header to
   * Banani's titled variant (16px title, 28px muted close button, 20/24/16
   * padding) used by the timetable's « Nouveau cours » modal. */
  subtitle?: string;
  onClose: () => void;
  /** Two-column forms (school create/edit) get the wide variant. */
  wide?: boolean;
  /** Wizard forms (teacher/student) get the extra-wide variant. */
  xwide?: boolean;
  /** 560px variant (single-column form with sections — timetable modal). */
  medium?: boolean;
  /** Override the scroll area's padding (default p-5). */
  bodyClassName?: string;
  /** Override the fixed footer's padding (default px-5 py-3.5). */
  footerClassName?: string;
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
  subtitle,
  onClose,
  wide = false,
  xwide = false,
  medium = false,
  bodyClassName,
  footerClassName,
  header,
  footer,
  children,
}: ModalProps) {
  const t = useTranslations('Common.modal');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const maxWidth = xwide
    ? 'max-w-[980px]'
    : wide
      ? 'max-w-[760px]'
      : medium
        ? 'max-w-[560px]'
        : 'max-w-[520px]';

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
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-card ${maxWidth}`}
      >
        {subtitle ? (
          <div className="flex items-center justify-between gap-4 border-b border-border px-6 pt-5 pb-4">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground">{title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-caption font-bold text-foreground">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {header && <div className="border-b border-border px-5 py-3">{header}</div>}
        <div className={`flex-1 overflow-y-auto ${bodyClassName ?? 'p-5'}`}>{children}</div>
        {footer && (
          <div className={`border-t border-border ${footerClassName ?? 'px-5 py-3.5'}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
