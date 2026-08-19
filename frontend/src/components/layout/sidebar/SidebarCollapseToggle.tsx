'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('Shell.collapseToggle');
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const colorClasses =
    variant === 'light'
      ? 'text-muted-foreground hover:text-foreground'
      : 'text-white/50 hover:text-white';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? t('expand') : t('collapse')}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colorClasses}`}
    >
      <Icon size={16} />
    </button>
  );
}
