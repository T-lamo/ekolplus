'use client';

import { LayoutGrid, List as ListIcon } from 'lucide-react';

// Shared cards/list view switch for resource pages (Élèves, Enseignants,
// Classes, Matières, Affectations, Coefficients, Modèles de bulletin).
// Cards are the app-wide default view, so the grid button comes first.
// State lives in the page — this only renders the two buttons.
export function ViewToggle({
  view,
  onChange,
  className = '',
}: {
  view: 'list' | 'grid';
  onChange: (view: 'list' | 'grid') => void;
  className?: string;
}) {
  const btn = (active: boolean) =>
    `flex h-8 w-8 items-center justify-center rounded ${active ? 'bg-secondary text-primary' : 'text-muted-foreground'}`;
  return (
    <div className={`flex items-center gap-1 rounded-md border border-border p-0.5 ${className}`}>
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-label="Vue cartes"
        aria-pressed={view === 'grid'}
        className={btn(view === 'grid')}
      >
        <LayoutGrid size={15} />
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-label="Vue liste"
        aria-pressed={view === 'list'}
        className={btn(view === 'list')}
      >
        <ListIcon size={15} />
      </button>
    </div>
  );
}
