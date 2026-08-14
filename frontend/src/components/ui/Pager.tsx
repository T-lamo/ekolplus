import { ChevronLeft, ChevronRight } from 'lucide-react';

// Prev/next pager for server-paginated tables. Started life in
// school/fees/Pager.tsx (which now re-exports from here) — promoted to a
// ui/ primitive when the SaaS admin tables became its 3rd+ consumer.
//
// `itemsLabel` switches the left text from "Page X sur Y" to the admin
// screens' "Affichage de A à B sur N <label>" wording; `shownCount` is how
// many rows the current page actually renders (B = offset + shownCount).
export function Pager({
  page,
  pageSize,
  total,
  onChange,
  itemsLabel,
  shownCount,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  itemsLabel?: string | undefined;
  shownCount?: number | undefined;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to =
    (page - 1) * pageSize + (shownCount ?? Math.min(pageSize, total - (page - 1) * pageSize));
  return (
    <div className="flex items-center justify-between px-3.5 py-3">
      <span className="text-xs text-muted-foreground">
        {itemsLabel
          ? `Affichage de ${from} à ${to} sur ${total} ${itemsLabel}`
          : `Page ${page} sur ${totalPages}`}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Page précédente"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Page suivante"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
