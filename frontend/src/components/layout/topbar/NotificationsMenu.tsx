'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { invalidateCache, useApi } from '@/lib/useApi';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}
interface NotificationsListResponse {
  items: NotificationItem[];
  nextCursor: string | null;
}
interface NotificationsCountResponse {
  count: number;
}

const COUNT_PATH = '/api/notifications/count';
const LIST_PATH = '/api/notifications?unread=true&limit=5';

export function NotificationsMenu() {
  const t = useTranslations('Shell.notifications');
  const [open, setOpen] = useState(false);
  const { data: countData, refresh: refreshCount } = useApi<NotificationsCountResponse>(COUNT_PATH);
  const {
    data: listData,
    loading,
    refresh: refreshList,
  } = useApi<NotificationsListResponse>(LIST_PATH, { skip: !open });
  const unreadCount = countData?.count ?? 0;

  async function markRead(ids: string[] | 'all') {
    await api(LIST_PATH.split('?')[0]!, { method: 'PATCH', body: { ids } });
    invalidateCache(COUNT_PATH);
    invalidateCache(LIST_PATH);
    await Promise.all([refreshCount(), refreshList()]);
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t('ariaLabel')}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive-foreground px-1 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-border bg-card p-2 shadow-xl"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold text-foreground">{t('heading')}</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markRead('all')}
                className="text-xs font-medium text-primary"
              >
                {t('markAllRead')}
              </button>
            )}
          </div>
          {loading && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {t('loading')}
            </div>
          )}
          {!loading && (listData?.items.length ?? 0) === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">{t('empty')}</div>
          )}
          {listData?.items.map((n) => (
            <DropdownMenu.Item
              key={n.id}
              onSelect={(e) => {
                e.preventDefault();
                void markRead([n.id]);
              }}
              className="flex flex-col gap-0.5 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-secondary"
            >
              <span className="font-medium text-foreground">{n.title}</span>
              <span className="text-xs text-muted-foreground">{n.body}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
