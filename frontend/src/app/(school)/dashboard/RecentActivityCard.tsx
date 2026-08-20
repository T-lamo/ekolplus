'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { ACTIVITY_TYPE_META, relativeTime } from './activity-shared';
import type { DashboardData } from './types';

export function RecentActivityCard({ activity }: { activity: DashboardData['recentActivity'] }) {
  const t = useTranslations('Dashboard.activity');
  const tRelative = useTranslations('Dashboard.activity.relativeTime');
  const locale = useLocale();
  return (
    <Card className="gap-1.5 p-4 sm:p-5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-caption font-semibold text-foreground">{t('title')}</span>
        <Link href="/dashboard/activites" className="text-xs font-medium text-primary">
          {t('seeAll')}
        </Link>
      </div>
      {activity.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <FileText size={16} />
          {t('empty')}
        </div>
      ) : (
        <div className="flex flex-col">
          {activity.map((a, i) => {
            const meta = ACTIVITY_TYPE_META[a.type];
            return (
              <div
                key={`${a.type}-${a.at}-${i}`}
                className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-none"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.iconBg} ${meta.iconFg}`}
                >
                  <meta.icon size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{a.text}</span>
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {relativeTime(a.at, locale, tRelative)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
