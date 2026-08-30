'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import { CircleHelp } from 'lucide-react';

// Small "?" affordance for explaining a feature or metric inline, without
// permanently taking up page space. Same Radix Tooltip primitive/classes as
// OverflowTags.tsx's hover list, so both read as the same design language.
export function HelpTooltip({ label, className = '' }: { label: string; className?: string }) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className={`inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-primary focus-visible:text-primary ${className}`}
          >
            <CircleHelp size={14} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={6}
            collisionPadding={8}
            className="z-50 max-w-[260px] origin-[var(--radix-tooltip-content-transform-origin)] animate-[tooltip-in_140ms_ease-out] rounded-lg border border-border bg-card p-2.5 text-xs text-foreground shadow-lg"
          >
            {label}
            <Tooltip.Arrow className="fill-card" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
