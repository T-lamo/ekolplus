import { CalendarX, NotebookPen, UserPlus, Wallet, type LucideIcon } from 'lucide-react';
import { LOCALE_BCP47, type LocaleKey } from '@/lib/locales';
import type { DashboardData } from './types';

type ActivityType = DashboardData['recentActivity'][number]['type'];

// Shared between the dashboard's RecentActivityCard preview and the full
// "Tout voir" activity log page (/dashboard/activites) — both render the
// same event shape, just at different depths.
export const ACTIVITY_TYPE_META: Record<
  ActivityType,
  { icon: LucideIcon; iconBg: string; iconFg: string }
> = {
  grade: { icon: NotebookPen, iconBg: 'bg-secondary', iconFg: 'text-primary' },
  absence: { icon: CalendarX, iconBg: 'bg-destructive', iconFg: 'text-destructive-foreground' },
  payment: { icon: Wallet, iconBg: 'bg-warning', iconFg: 'text-warning-foreground' },
  enrollment: { icon: UserPlus, iconBg: 'bg-success', iconFg: 'text-success-foreground' },
};

export type RelativeTimeT = (
  key: 'justNow' | 'hoursAgo' | 'yesterdayAt',
  values?: Record<string, string | number>,
) => string;

/** `t` must be scoped to `Dashboard.activity.relativeTime` (i.e.
 * `useTranslations('Dashboard.activity.relativeTime')`). */
export function relativeTime(iso: string, locale: LocaleKey, t: RelativeTimeT): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffH = Math.round(diffMs / 3_600_000);
  if (diffH < 1) return t('justNow');
  if (diffH < 24) return t('hoursAgo', { hours: diffH });
  const isYesterday = diffH < 48;
  const time = date.toLocaleTimeString(LOCALE_BCP47[locale], {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (isYesterday) return t('yesterdayAt', { time });
  return date.toLocaleDateString(LOCALE_BCP47[locale], { day: '2-digit', month: '2-digit' });
}
