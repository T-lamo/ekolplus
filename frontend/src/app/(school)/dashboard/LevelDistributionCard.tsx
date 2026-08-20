import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import type { DashboardData } from './types';

// Graduated donut (5 tints of --color-primary) — kept separate from the
// shared admin DonutChart, whose 3-slot palette is semantically pinned to
// the 3 subscription plans elsewhere; a level breakdown has a variable,
// school-defined number of levels and needs its own open-ended palette.
// Tints are mixed from the live primary token so the chart follows the
// user's colour theme (Paramètres › Apparence) instead of staying purple.
const TINTS = [100, 70, 45, 25, 14].map(
  (pct) => `color-mix(in srgb, var(--color-primary) ${pct}%, white)`,
);

export function LevelDistributionCard({ levels }: { levels: DashboardData['levelDistribution'] }) {
  const t = useTranslations('Dashboard.levelDistribution');
  const total = levels.reduce((s, l) => s + l.count, 0);
  const R = 36;
  const STROKE = 16;
  const C = 2 * Math.PI * R;
  const GAP = total > 0 && levels.length > 1 ? 3 : 0;

  let offset = -C / 4;
  const segments = levels.map((l, i) => {
    const frac = total > 0 ? l.count / total : 0;
    const len = Math.max(frac * C - GAP, 0);
    const seg = { ...l, color: TINTS[i % TINTS.length]!, len, offset };
    offset += frac * C;
    return seg;
  });

  return (
    <Card className="gap-1 p-4 sm:p-5">
      <div className="text-caption font-semibold text-foreground">{t('title')}</div>
      <div className="mb-1.5 text-2xs text-muted-foreground">{t('subtitle')}</div>
      {total === 0 ? (
        <div className="flex h-[100px] items-center justify-center text-xs text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative shrink-0">
            <svg viewBox="0 0 100 100" className="h-24 w-24" role="img" aria-label={t('title')}>
              {segments.map(
                (seg) =>
                  seg.len > 0 && (
                    <circle
                      key={seg.level}
                      cx={50}
                      cy={50}
                      r={R}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={STROKE}
                      strokeDasharray={`${seg.len} ${C - seg.len}`}
                      strokeDashoffset={-seg.offset}
                      strokeLinecap="butt"
                      transform="rotate(-90 50 50)"
                    />
                  ),
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-extrabold text-foreground">{total}</span>
              <span className="text-[9px] text-muted-foreground">{t('centerLabel')}</span>
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-1.5">
            {segments.map((seg) => (
              <div key={seg.level} className="flex items-center gap-2 text-[12px]">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {seg.level}
                </span>
                <span className="font-bold text-foreground">{seg.count}</span>
                <span className="w-9 text-right text-2xs text-muted-foreground">
                  {total > 0 ? Math.round((seg.count / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
