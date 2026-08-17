'use client';

// White header card of the entity pages (fiche matière / fiche classe):
// « ← Retour » · chip · title/meta · actions, then an optional tabs bar —
// inside the page padding like every other page title, never flush against
// the sidebar/topbar. Body goes below with `pt-4`.
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeaderCard({
  backHref,
  backLabel = 'Retour',
  chip,
  title,
  meta,
  actions,
  tabs,
}: {
  backHref: string;
  backLabel?: string;
  chip?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href={backHref}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-[7px] text-caption font-medium text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft size={15} />
            {backLabel}
          </Link>
          <div className="flex min-w-0 items-center gap-2.5">
            {chip}
            <div className="min-w-0">
              <div className="truncate text-[17px] leading-tight font-bold text-foreground">
                {title}
              </div>
              {meta !== undefined && (
                <div className="truncate text-xs text-muted-foreground">{meta}</div>
              )}
            </div>
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        )}
      </div>
      {tabs}
    </header>
  );
}
