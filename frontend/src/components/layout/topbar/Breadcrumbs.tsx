import type { ReactNode } from 'react';

interface BreadcrumbsProps {
  root: ReactNode;
  trail: string[];
}

export function Breadcrumbs({ root, trail }: BreadcrumbsProps) {
  return (
    <div className="hidden items-center gap-1.5 text-caption text-muted-foreground sm:flex">
      {root}
      {trail.map((label, i) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="text-border">›</span>
          <span className={i === trail.length - 1 ? 'font-medium text-foreground' : ''}>
            {label}
          </span>
        </span>
      ))}
    </div>
  );
}
