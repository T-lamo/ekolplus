'use client';

// Banani legend row under the grid: one 10px square swatch per subject
// present in the visible sessions, and the CM · TD · TP · EXAM pills with
// their long labels on the right (wraps under 1024px).
import { useLocale, useTranslations } from 'next-intl';
import type { TimetableSession } from './types';
import { SESSION_TYPES, TYPE_META, legendSubjects } from './timetable-utils';
import { cn } from '@/lib/utils';

export function TimetableLegend({ sessions }: { sessions: TimetableSession[] }) {
  const locale = useLocale();
  const t = useTranslations('Timetable.legend');
  const tType = useTranslations('Timetable.sessionType');
  const subjects = legendSubjects(sessions, locale);
  return (
    <div className="mt-3.5 flex flex-col gap-2 px-0.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
      <div className="flex flex-wrap items-center gap-2" aria-label={t('subjectsAriaLabel')}>
        {subjects.length === 0 && (
          <span className="text-2xs text-muted-foreground">{t('empty')}</span>
        )}
        {subjects.map((s) => (
          <span key={s.id} className="flex items-center gap-[5px]">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: s.color }}
            />
            <span className="text-2xs text-muted-foreground">{s.name}</span>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label={t('typesAriaLabel')}>
        {SESSION_TYPES.map((type) => (
          <span key={type} className="flex items-center gap-1">
            <span
              className={cn(
                'rounded-full px-[7px] py-0.5 text-[10px] font-bold',
                TYPE_META[type].badge,
              )}
            >
              {TYPE_META[type].short}
            </span>
            <span className="text-2xs text-muted-foreground">{tType(type)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
