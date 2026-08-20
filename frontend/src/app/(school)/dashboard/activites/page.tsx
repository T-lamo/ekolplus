'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Pager } from '@/components/ui/Pager';
import { Skeleton, SkeletonFilters, SkeletonTable } from '@/components/ui/Skeleton';
import { LIST_PAGE, TABLE_SCROLL } from '@/lib/layout';
import { ACTIVITY_TYPE_META, relativeTime } from '../activity-shared';

type ActivityType = 'grade' | 'absence' | 'payment' | 'enrollment';

interface ActivityItem {
  type: ActivityType;
  text: string;
  at: string;
}

interface ActivityResponse {
  items: ActivityItem[];
  total: number;
  page: number;
  pageSize: number;
}

export default function ActivityLogPage() {
  const user = useUser();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<'' | ActivityType>('');
  const [page, setPage] = useState(1);
  const t = useTranslations('Dashboard.activityLog');
  const tRelative = useTranslations('Dashboard.activity.relativeTime');
  const locale = useLocale();

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    params.set('page', String(page));
    api<ActivityResponse>(`/api/school/activity?${params.toString()}`)
      .then(setData)
      .catch(() => setError(t('loadError')));
  }, [type, page, t]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  function updateType(value: string) {
    setPage(1);
    setType(value as '' | ActivityType);
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <div className="flex flex-col gap-3">
        <Link
          href="/dashboard"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('back')}
        </Link>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={2} />
          </Card>
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <FilterSelect value={type} onValueChange={updateType}>
              <SelectItem value="">{t('filterAll')}</SelectItem>
              {(['grade', 'absence', 'payment', 'enrollment'] as const).map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`typeLabel.${key}`)}
                </SelectItem>
              ))}
            </FilterSelect>
            <span className="text-sm text-muted-foreground">
              {t(data.total > 1 ? 'resultCount.other' : 'resultCount.one', { n: data.total })}
            </span>
          </div>

          {data.items.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">{t('empty')}</p>
            </Card>
          ) : (
            <Card>
              <div className={TABLE_SCROLL}>
                <div className="flex flex-col divide-y divide-border">
                  {data.items.map((item, i) => {
                    const meta = ACTIVITY_TYPE_META[item.type];
                    return (
                      <div
                        key={`${item.type}-${item.at}-${i}`}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${meta.iconBg} ${meta.iconFg}`}
                        >
                          <meta.icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {item.text}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {relativeTime(item.at, locale, tRelative)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <Pager
                centered
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onChange={setPage}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
