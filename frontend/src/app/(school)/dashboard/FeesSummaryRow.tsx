import Link from 'next/link';
import { AlertCircle, CalendarClock, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { LOCALE_BCP47 } from '@/lib/locales';
import type { DashboardData } from './types';

export function FeesSummaryRow({ fees }: { fees: DashboardData['fees'] }) {
  const t = useTranslations('Dashboard.fees');
  const locale = useLocale();
  const noData =
    fees.tranchesTotal === 0 && fees.nextTranche == null && fees.overdueStudentCount === 0;

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-caption font-semibold text-foreground">{t('title')}</span>
        <Link href="/scolarite/paiements" className="text-xs font-medium text-primary">
          {t('seeDetails')}
        </Link>
      </div>
      {noData ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">{t('noFeeData')}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <Card className="gap-1.5 p-4">
            <CardHeader
              icon={TrendingUp}
              iconBg="bg-success"
              iconFg="text-success-foreground"
              title={t('collected')}
            />
            <CircularStat
              percent={fees.collectedPercent}
              color="var(--color-success-foreground)"
              centerLabel={t('collectedLabel')}
              rows={[
                {
                  label: t('paid'),
                  value: `${fees.collectedPercent}%`,
                  dot: 'var(--color-success-foreground)',
                },
                {
                  label: t('remaining'),
                  value: `${100 - fees.collectedPercent}%`,
                  dot: 'var(--color-muted-foreground)',
                },
              ]}
            />
            <ProgressBar percent={fees.collectedPercent} color="var(--color-success-foreground)" />
          </Card>

          <Card className="gap-1.5 p-4">
            <CardHeader
              icon={AlertCircle}
              iconBg="bg-destructive"
              iconFg="text-destructive-foreground"
              title={t('overdueStudents')}
            />
            <CircularStat
              percent={fees.overdueStudentPercent}
              color="var(--color-destructive-foreground)"
              centerLabel={t('overdueLabel')}
              rows={[
                {
                  label: t('overdueStudents'),
                  value: `${fees.overdueStudentPercent}%`,
                  dot: 'var(--color-destructive-foreground)',
                },
                {
                  label: t('upToDate'),
                  value: `${100 - fees.overdueStudentPercent}%`,
                  dot: 'var(--color-success-foreground)',
                },
              ]}
              footer={t(
                fees.overdueStudentCount > 1 ? 'studentsConcerned.other' : 'studentsConcerned.one',
                { n: fees.overdueStudentCount },
              )}
            />
            <ProgressBar
              percent={fees.overdueStudentPercent}
              color="var(--color-destructive-foreground)"
            />
          </Card>

          <Card className="gap-1.5 p-4">
            <CardHeader
              icon={CalendarClock}
              iconBg="bg-secondary"
              iconFg="text-primary"
              title={t('nextDue')}
            />
            {fees.nextTranche ? (
              <>
                <div className="mt-1 text-xl font-bold text-foreground">
                  {new Date(fees.nextTranche.dueDate).toLocaleDateString(LOCALE_BCP47[locale], {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
                <div className="text-2xs text-muted-foreground">
                  {fees.nextTranche.label} —{' '}
                  {t(
                    fees.nextTranche.studentsConcerned > 1
                      ? 'studentsConcerned.other'
                      : 'studentsConcerned.one',
                    { n: fees.nextTranche.studentsConcerned },
                  )}
                </div>
                {fees.daysUntilNextTranche != null && (
                  <span className="mt-1 w-fit rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-warning-foreground">
                    {fees.daysUntilNextTranche <= 0
                      ? t('daysUntil.today')
                      : fees.daysUntilNextTranche === 1
                        ? t('daysUntil.tomorrow')
                        : t('daysUntil.inNDays', { n: fees.daysUntilNextTranche })}
                  </span>
                )}
                {fees.tranchesTotal > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {t('trancheProgress')}
                      </span>
                      <span className="text-[10px] font-bold text-primary">
                        {fees.tranchesElapsed} / {fees.tranchesTotal}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: fees.tranchesTotal }, (_, i) => (
                        <span
                          key={i}
                          className={`h-[5px] flex-1 rounded-full ${i < fees.tranchesElapsed ? 'bg-success-foreground' : 'bg-muted'}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{t('noFeeData')}</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function CardHeader({
  icon: Icon,
  iconBg,
  iconFg,
  title,
}: {
  icon: typeof TrendingUp;
  iconBg: string;
  iconFg: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
      <span className={`flex h-6 w-6 items-center justify-center rounded-md ${iconBg} ${iconFg}`}>
        <Icon size={13} />
      </span>
      {title}
    </div>
  );
}

function CircularStat({
  percent,
  color,
  centerLabel,
  rows,
  footer,
}: {
  percent: number;
  color: string;
  centerLabel: string;
  rows: { label: string; value: string; dot: string }[];
  footer?: string;
}) {
  const R = 28;
  const C = 2 * Math.PI * R;
  const filled = (percent / 100) * C;

  return (
    <div className="mt-1 flex items-center gap-3.5">
      <svg
        viewBox="0 0 72 72"
        className="h-[68px] w-[68px] shrink-0"
        role="img"
        aria-label={`${percent}%`}
      >
        <circle cx={36} cy={36} r={R} fill="none" stroke="var(--color-muted)" strokeWidth={8} />
        <circle
          cx={36}
          cy={36}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={`${filled} ${C - filled}`}
          strokeLinecap="butt"
          transform="rotate(-90 36 36)"
        />
        <text
          x={36}
          y={33}
          textAnchor="middle"
          fill="var(--color-foreground)"
          fontSize={11}
          fontWeight={700}
        >
          {percent}%
        </text>
        <text x={36} y={44} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize={6.5}>
          {centerLabel}
        </text>
      </svg>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5 text-2xs text-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.dot }} />
            <span>
              {r.label} : <strong>{r.value}</strong>
            </span>
          </div>
        ))}
        {footer && <span className="mt-0.5 text-[10px] text-muted-foreground">{footer}</span>}
      </div>
    </div>
  );
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}
