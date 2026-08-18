'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import Link from 'next/link';
import type { NavItem } from './types';

interface SidebarItemProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  variant: 'light' | 'dark';
  onNavigate?: (() => void) | undefined;
}

export function SidebarItem({ item, active, collapsed, variant, onNavigate }: SidebarItemProps) {
  const Icon = item.icon;
  const iconSize = variant === 'light' ? 15 : 14;
  const fontSizeClass = variant === 'light' ? 'text-caption' : 'text-xs';

  // Light shell: the active item is a filled pill (floating-panel look);
  // dark shell keeps its left accent bar.
  const shapeClasses =
    variant === 'light' ? 'rounded-lg transition-colors' : 'rounded-md border-l-2';
  const activeClasses =
    variant === 'light'
      ? 'bg-primary text-primary-foreground'
      : 'border-primary bg-white/10 text-white';
  const inactiveClasses =
    variant === 'light'
      ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
      : 'border-transparent text-white/50';

  const link = (
    <Link
      href={item.href}
      {...(onNavigate && { onClick: onNavigate })}
      aria-label={collapsed ? item.label : undefined}
      className={`mb-px flex min-h-11 items-center gap-2 font-medium ${shapeClasses} ${fontSizeClass} ${
        collapsed ? 'w-11 justify-center px-0' : 'px-2.5'
      } ${active ? activeClasses : inactiveClasses}`}
    >
      <Icon size={iconSize} className="shrink-0" />
      {!collapsed && item.label}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="z-50 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
        >
          {item.label}
          <Tooltip.Arrow className="fill-foreground" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
