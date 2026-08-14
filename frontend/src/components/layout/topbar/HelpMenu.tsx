'use client';

import * as Popover from '@radix-ui/react-popover';
import { CircleHelp } from 'lucide-react';

export function HelpMenu() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Aide"
          className="hidden h-11 w-11 items-center justify-center text-muted-foreground sm:flex"
        >
          <CircleHelp size={17} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-lg border border-border bg-card p-3 text-sm shadow-xl"
        >
          <p className="font-semibold text-foreground">Besoin d&apos;aide ?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Contactez l&apos;administrateur de votre établissement pour toute question sur
            Schoolgesti.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
