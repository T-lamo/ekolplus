'use client';

// Banani « Utilisation du plan » section-card : header + 4 usage cells
// (label · used/total · 5px bar · hint). Only Élèves has a real cap (Starter
// hard 50, Pro soft 1000) ; the other three are uncapped and read « Illimité »
// with a full green bar, like the mockup's « Bulletins générés » cell.
import { useTranslations } from 'next-intl';
import type { BillingSummary } from '@/lib/billing-plans';
import { planLabel } from '@/lib/billing-plan-i18n';
import { usagePct } from './billing-format';

interface Cell {
  label: string;
  used: number;
  limit: number | null;
  /** True when `limit` is a soft ceiling (nudge, not a block). */
  soft?: boolean;
}

export function UsageCard({ billing }: { billing: BillingSummary }) {
  const t = useTranslations('Abonnement.usageCard');
  const tPlan = useTranslations('BillingPlans.label');
  const limit = billing.studentHardLimit ?? billing.studentSoftLimit;
  const cells: Cell[] = [
    {
      label: t('cellStudents'),
      used: billing.usage.students,
      limit,
      soft: billing.studentHardLimit === null && billing.studentSoftLimit !== null,
    },
    { label: t('cellTeachers'), used: billing.usage.teachers, limit: null },
    { label: t('cellClasses'), used: billing.usage.classes, limit: null },
    { label: t('cellAdmins'), used: billing.usage.admins, limit: null },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-[18px] sm:py-[13px]">
        <div>
          <div className="text-caption font-bold text-foreground">{t('title')}</div>
          <div className="mt-px text-xs text-muted-foreground">
            {t('subtitle', { plan: planLabel(billing.plan, tPlan) })}
          </div>
        </div>
        {billing.billedSeats !== null && (
          <div className="text-2xs text-muted-foreground">
            {t(billing.billedSeats > 1 ? 'seatsBilled.other' : 'seatsBilled.one', {
              count: billing.billedSeats,
            })}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {cells.map((c, i) => {
          const pct = usagePct(c.used, c.limit);
          const warn = pct !== null && pct >= 80;
          const remaining = c.limit !== null ? Math.max(0, c.limit - c.used) : null;
          return (
            <div
              key={c.label}
              className={`px-4 py-4 sm:px-[18px] ${i % 2 === 0 ? 'border-r border-border' : ''} ${i < 2 ? 'border-b border-border lg:border-b-0' : ''} lg:border-r lg:last:border-r-0`}
            >
              <div className="mb-1.5 text-[10px] font-bold tracking-[0.7px] text-muted-foreground uppercase">
                {c.label}
              </div>
              <div className="mb-[7px] flex items-baseline gap-1">
                <span className="text-[22px] font-extrabold text-foreground tabular-nums">
                  {c.used}
                </span>
                <span className="text-caption font-medium text-muted-foreground">
                  / {c.limit !== null ? c.limit : t('unlimited')}
                </span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${warn ? 'bg-warning-foreground' : 'bg-success-foreground'}`}
                  style={{ width: `${pct ?? 100}%` }}
                />
              </div>
              <div className="mt-[5px] text-[10px] text-muted-foreground">
                {c.limit === null
                  ? t('unlimitedIncluded')
                  : c.soft
                    ? pct !== null && pct >= 100
                      ? t('enterpriseSuggested')
                      : t('softPct', { pct: pct ?? 0 })
                    : t(remaining === 1 ? 'usedPct.one' : 'usedPct.other', {
                        pct: pct ?? 0,
                        remaining: remaining ?? 0,
                      })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
