'use client';

import { type ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

// Generic overflow-safe badge list for table/card cells that render a
// variable-length array as pills (subjects, classes, other-class
// coefficients, ...). A row with 5-6 badges wraps to multiple lines and
// breaks row alignment — this caps the visible count and moves the rest
// behind a hover tooltip instead.
//
// Truncation rule (deliberately a single `maxVisible` prop, not two):
// items.length <= maxVisible → render everything, no truncation at all.
// items.length >  maxVisible → render the first (maxVisible - 1) items,
// then a "+N" indicator for the remainder. So the default maxVisible=3
// means "3 or fewer stays untouched, 4+ shows 2 + a +N badge" — clipping
// only kicks in when it actually saves space (showing 2 + "+1" for a
// 3-item list would be pointless).
export interface OverflowTagsProps<T> {
  items: T[];
  /** Renders one visible pill — also reused (unchanged) for each row in
   * the hover tooltip's full list, just laid out vertically there. */
  renderItem: (item: T) => ReactNode;
  /** Stable React key per item. Defaults to array index. */
  keyOf?: (item: T, index: number) => string;
  /** See truncation rule above. Default 3. */
  maxVisible?: number;
  /** Shown in italic muted text when items.length === 0. */
  emptyLabel?: string;
  className?: string;
}

export function OverflowTags<T>({
  items,
  renderItem,
  keyOf,
  maxVisible = 3,
  emptyLabel = 'Non configuré',
  className = '',
}: OverflowTagsProps<T>) {
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground italic">{emptyLabel}</span>;
  }

  const getKey = keyOf ?? ((_item: T, index: number) => String(index));
  const truncated = items.length > maxVisible;
  const visibleCount = truncated ? maxVisible - 1 : items.length;
  const visible = items.slice(0, visibleCount);
  const hidden = items.slice(visibleCount);

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {visible.map((item, i) => (
        <span key={getKey(item, i)}>{renderItem(item)}</span>
      ))}
      {truncated && (
        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                aria-label={`${hidden.length} de plus`}
                className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold whitespace-nowrap text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-primary focus-visible:bg-secondary focus-visible:text-primary"
              >
                +{hidden.length}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="top"
                align="start"
                sideOffset={6}
                collisionPadding={8}
                className="z-50 max-w-[280px] origin-[var(--radix-tooltip-content-transform-origin)] animate-[tooltip-in_140ms_ease-out] rounded-lg border border-border bg-card p-2.5 shadow-lg"
              >
                <div className="flex flex-col gap-1.5">
                  {items.map((item, i) => (
                    <span key={getKey(item, i)}>{renderItem(item)}</span>
                  ))}
                </div>
                <Tooltip.Arrow className="fill-card" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      )}
    </div>
  );
}
