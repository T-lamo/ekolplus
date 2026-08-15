import type { ReactNode } from 'react';

// Page title band shared by the 8 SaaS admin screens — Banani pattern:
// bold title + muted subtitle on the left, action buttons on the right,
// stacking to full-width column on mobile.
export function AdminPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-[22px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-caption text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>
      )}
    </div>
  );
}
