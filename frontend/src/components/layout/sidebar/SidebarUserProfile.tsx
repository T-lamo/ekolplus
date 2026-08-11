'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarUserProfileProps {
  variant: 'light' | 'dark';
  collapsed: boolean;
  roleLabel: string;
  profileHref?: string;
}

export function SidebarUserProfile({
  variant,
  collapsed,
  roleLabel,
  profileHref = '/settings',
}: SidebarUserProfileProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const email = user?.email ?? '';

  const nameClasses = variant === 'light' ? 'text-foreground' : 'text-white';
  const roleClasses = variant === 'light' ? 'text-muted-foreground' : 'text-white/40';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Compte de ${email}`}
          className={`flex w-full items-center gap-2 rounded-md py-1.5 outline-none ${
            collapsed ? 'justify-center px-0' : 'px-2'
          }`}
        >
          <Avatar name={email} size={28} />
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <div className={`truncate text-xs font-semibold ${nameClasses}`}>{email}</div>
              <div className={`text-[11px] ${roleClasses}`}>{roleLabel}</div>
            </div>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-56 rounded-lg border border-border bg-card p-1.5 shadow-xl"
        >
          <div className="truncate px-2 py-1.5 text-xs font-semibold text-foreground">{email}</div>
          <div className="px-2 pb-1.5 text-[11px] text-muted-foreground">{roleLabel}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => router.push(profileHref)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-primary"
          >
            <UserRound size={14} />
            Mon profil
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void logout()}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive-foreground outline-none data-[highlighted]:bg-destructive"
          >
            <LogOut size={14} />
            Déconnexion
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
