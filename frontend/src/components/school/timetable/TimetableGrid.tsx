'use client';

// Banani `.timetable-grid` (emploi-du-temps.md): head row (56px clock column
// + one column per day, today = bg-secondary / primary label), one body row
// per start slot (min-h 72, muted time cell), tinted course cards — gaps
// between slots (including an entirely empty schedule) render as plain blank
// cells, no PAUSE/DÉJEUNER banner. Week view = Mon–Fri (+ Sat when a session
// falls on one), Day view = the same grid with a single column. The card
// scrolls horizontally under 640px so the grid never squeezes.
import { Clock } from 'lucide-react';
import { CourseCard } from './CourseCard';
import type { TimetableSession } from './types';
import {
  buildRows,
  formatDayName,
  formatDayShort,
  formatLong,
  minutesToHHMM,
} from './timetable-utils';
import { cn } from '@/lib/utils';

const COLS: Record<number, string> = {
  1: 'grid-cols-[56px_minmax(0,1fr)]',
  5: 'grid-cols-[56px_repeat(5,minmax(0,1fr))]',
  6: 'grid-cols-[56px_repeat(6,minmax(0,1fr))]',
};

export function TimetableGrid({
  days,
  sessions,
  today,
  showClass,
  onSessionClick,
  onSlotClick,
}: {
  days: string[];
  sessions: TimetableSession[];
  today: string;
  showClass: boolean;
  onSessionClick: (session: TimetableSession) => void;
  /** Click on the empty part of a cell → create a session there. */
  onSlotClick?: (day: string, startMinutes: number) => void;
}) {
  const rows = buildRows(sessions, days);
  const cols = COLS[days.length] ?? COLS[5];
  const single = days.length === 1;

  return (
    // Shrinkable card: the rows scroll inside (x and y) while the day header
    // stays pinned — the page around never scrolls.
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className={cn('min-h-0 overflow-auto', !single && 'min-w-0')}>
        <div className={cn(!single && 'min-w-[640px]')}>
          <div className={cn('sticky top-0 z-20 grid border-b border-border bg-card', cols)}>
            <div className="flex items-center justify-center border-r border-border bg-muted px-2 py-2.5">
              <Clock size={13} className="text-muted-foreground" aria-hidden />
            </div>
            {days.map((day, i) => {
              const isToday = day === today;
              return (
                <div
                  key={day}
                  className={cn(
                    'px-2 py-2.5 text-center',
                    i < days.length - 1 && 'border-r border-border',
                    isToday && 'bg-secondary',
                  )}
                >
                  <div
                    className={cn(
                      'text-caption font-bold',
                      isToday ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {formatDayName(day)}
                  </div>
                  <div className="mt-px text-2xs text-muted-foreground">{formatDayShort(day)}</div>
                </div>
              );
            })}
          </div>

          {rows.map((row) => (
            <div
              key={`slot-${row.start}`}
              className={cn('grid min-h-[72px] border-b border-border last:border-b-0', cols)}
            >
              <div className="flex items-start justify-center border-r border-border bg-muted px-1.5 pt-2.5 pb-2 text-[10px] font-semibold text-muted-foreground">
                {minutesToHHMM(row.start)}
              </div>
              {days.map((day, i) => {
                const cell = row.cells.get(day) ?? [];
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    className={cn(
                      'relative min-h-[72px] px-1.5 py-[5px]',
                      i < days.length - 1 && 'border-r border-border',
                      isToday && 'bg-[#faf8ff]',
                    )}
                  >
                    {onSlotClick && (
                      <button
                        type="button"
                        onClick={() => onSlotClick(day, row.start)}
                        aria-label={`Ajouter un cours ${formatLong(day)} à ${minutesToHHMM(row.start)}`}
                        className="absolute inset-0 rounded-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none focus-visible:ring-inset"
                      />
                    )}
                    {cell.map((s) => (
                      <CourseCard
                        key={s.id}
                        session={s}
                        showClass={showClass}
                        onClick={onSessionClick}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
