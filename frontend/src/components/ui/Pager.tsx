import { ChevronLeft, ChevronRight } from 'lucide-react';

// Windowed page numbers: all of them up to 7 pages, then first/last/
// current±1 with "…" gaps so the row never overflows on long lists.
function pageItems(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const wanted = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of wanted) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

// Prev/next pager for server-paginated tables. Started life in
// school/fees/Pager.tsx (which now re-exports from here) — promoted to a
// ui/ primitive when the SaaS admin tables became its 3rd+ consumer.
//
// `itemsLabel` switches the left text from "Page X sur Y" to the admin
// screens' "Affichage de A à B sur N <label>" wording; `shownCount` is how
// many rows the current page actually renders (B = offset + shownCount).
// `centered` switches to the school resource pages' layout: chevrons +
// numbered page buttons, centered — no text label.
export function Pager({
  page,
  pageSize,
  total,
  onChange,
  itemsLabel,
  shownCount,
  centered = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  itemsLabel?: string | undefined;
  shownCount?: number | undefined;
  centered?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to =
    (page - 1) * pageSize + (shownCount ?? Math.min(pageSize, total - (page - 1) * pageSize));
  if (centered) {
    return (
      <nav aria-label="Pagination" className="flex items-center justify-center gap-1.5 px-3.5 py-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Page précédente"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={14} />
        </button>
        {pageItems(page, totalPages).map((it, i) =>
          it === '…' ? (
            <span key={`gap-${i}`} className="px-0.5 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => onChange(it)}
              aria-label={`Page ${it}`}
              aria-current={it === page ? 'page' : undefined}
              className={`flex h-8 min-w-8 items-center justify-center rounded-md px-1 text-xs font-semibold ${it === page ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted'}`}
            >
              {it}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Page suivante"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={14} />
        </button>
      </nav>
    );
  }
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
