'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { motion } from 'framer-motion';
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
    <Accordion.Item value={section.label} className="px-2.5 pt-3.5 pb-0.5">
      <Accordion.Header>
        <Accordion.Trigger
          className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide uppercase ${
            variant === 'light' ? 'text-muted-foreground' : 'text-white/28'
          }`}
        >
          {section.label}
          <motion.span
            className="inline-flex items-center"
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight size={12} />
          </motion.span>
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
