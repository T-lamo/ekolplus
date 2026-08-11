'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface SidebarCollapseToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  variant: 'light' | 'dark';
}

export function SidebarCollapseToggle({
  collapsed,
  onToggle,
  variant,
}: SidebarCollapseToggleProps) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const colorClasses =
    variant === 'light'
      ? 'text-muted-foreground hover:text-foreground'
      : 'text-white/50 hover:text-white';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Étendre la barre latérale' : 'Réduire la barre latérale'}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colorClasses}`}
    >
      <Icon size={16} />
    </button>
  );
}
