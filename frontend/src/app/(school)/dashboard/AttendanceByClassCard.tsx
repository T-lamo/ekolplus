import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import type { DashboardData } from './types';

export function AttendanceByClassCard({
  classes,
}: {
  classes: DashboardData['attendanceByClass'];
}) {
  const t = useTranslations('Dashboard.attendanceByClass');
  return (
    <Card className="gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-caption font-semibold text-foreground">{t('title')}</div>
          <div className="text-2xs text-muted-foreground">{t('subtitle')}</div>
        </div>
        <Link href="/pedagogie/presences" className="text-xs font-medium text-primary">
          {t('details')}
        </Link>
      </div>
      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {classes.map((c) => (
            <div key={c.classId} className="flex items-center gap-2.5">
              <span className="w-16 shrink-0 truncate text-xs text-foreground">{c.className}</span>
              <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${c.ratePercent ?? 0}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-xs font-semibold text-foreground">
                {c.ratePercent != null ? `${c.ratePercent}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
