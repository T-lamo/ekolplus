'use client';

import { Minus, Plus } from 'lucide-react';

const MIN = 1;
const MAX = 10;

export function CoefficientStepper({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  const current = value ?? MIN;

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border">
      <button
        type="button"
        disabled={current <= MIN}
        onClick={() => onChange(Math.max(MIN, current - 1))}
        aria-label="Diminuer"
        className="flex h-8 w-8 items-center justify-center text-muted-foreground disabled:opacity-30"
      >
        <Minus size={13} />
      </button>
      <span
        className={`w-4 text-center text-sm font-bold ${value === null ? 'text-warning-foreground' : 'text-foreground'}`}
      >
        {value ?? '—'}
      </span>
      <button
        type="button"
        disabled={current >= MAX}
        onClick={() => onChange(Math.min(MAX, current + 1))}
        aria-label="Augmenter"
        className="flex h-8 w-8 items-center justify-center text-muted-foreground disabled:opacity-30"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
