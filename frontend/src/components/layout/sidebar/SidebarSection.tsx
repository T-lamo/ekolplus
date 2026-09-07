'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { ChevronRight } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import type { NavSection } from './types';

interface SidebarSectionProps {
  section: NavSection;
  variant: 'light' | 'dark';
  collapsed: boolean;
  open?: boolean;
  activeHref: string | null;
  onNavigate?: (() => void) | undefined;
}

export function SidebarSection({
  section,
  variant,
  collapsed,
  open,
  activeHref,
  onNavigate,
}: SidebarSectionProps) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 px-2 py-1.5">
        {section.items.map((item) => (
          <SidebarItem
            key={item.href}
            item={item}
            active={item.href === activeHref}
            collapsed
            variant={variant}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    );
  }

  return (
    <Accordion.Item value={section.label} className="px-2.5 pt-3 pb-0.5">
      <Accordion.Header>
        {/* Section heads read as headings, clearly apart from the items under
            them: bolder, wider letter-spacing, full-strength ink, a hairline
            above, and the chevron in a rounded pill. */}
        <Accordion.Trigger
          className={`group flex min-h-9 w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-extrabold tracking-[0.14em] uppercase ${
            variant === 'light'
              ? 'text-foreground hover:bg-muted'
              : 'text-white/85 hover:bg-white/[0.06]'
          }`}
        >
          {section.label}
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-150 ${
              variant === 'light' ? 'bg-muted text-muted-foreground' : 'bg-white/10 text-white/70'
            } ${open ? 'rotate-90' : 'rotate-0'}`}
          >
            <ChevronRight size={12} />
          </span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="accordion-content overflow-hidden">
        <div className="flex flex-col gap-px pt-0.5">
          {section.items.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              active={item.href === activeHref}
              collapsed={false}
              variant={variant}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}
