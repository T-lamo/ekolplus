import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// Base pulsing block — compose page-local skeleton layouts from this the
// same way pages compose their own SummaryCard from Card.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

// A skeleton row shaped like the avatar+name / badge / text cells this
// codebase's list tables use (Élèves, Enseignants, Présences, ...).
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex min-w-[140px] flex-col gap-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      {Array.from({ length: Math.max(cols - 1, 0) }).map((_, i) => (
        <Skeleton key={i} className="h-3.5 w-16 last:ml-auto" />
      ))}
    </div>
  );
}

// A table/list-shaped skeleton: N rows of SkeletonRow, meant to sit where
// the real <table> or list would render once data resolves — usually
// inside the page's Card wrapper.
export function SkeletonTable({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}

// Matches this codebase's page-local SummaryCard shape (icon chip + label
// + value) used in the stat-card row at the top of most list pages.
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}

// The filter bar (search + selects) most list pages show above their
// table/grid.
export function SkeletonFilters() {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Skeleton className="h-9 w-[300px] max-w-full" />
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-9 w-40" />
    </div>
  );
}
