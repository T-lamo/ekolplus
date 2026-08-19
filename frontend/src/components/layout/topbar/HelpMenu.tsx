'use client';

import * as Popover from '@radix-ui/react-popover';
import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function HelpMenu() {
  const t = useTranslations('Shell.helpMenu');
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('ariaLabel')}
          className="hidden h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex"
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
          <p className="font-semibold text-foreground">{t('title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('body')}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
