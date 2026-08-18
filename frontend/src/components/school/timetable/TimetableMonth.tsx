'use client';

// Month view (emploi-du-temps.md): 7-column calendar (Mon → Sun), each day
// shows up to 3 compact course chips + « +N » ; clicking a day opens it in
// the Day view. Outside-month days are dimmed, today gets the primary disc.
import { CourseCard } from './CourseCard';
import type { TimetableSession } from './types';
import { monthGrid, sessionsOn } from './timetable-utils';
import { cn } from '@/lib/utils';

const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MAX_CHIPS = 3;

export function TimetableMonth({
  anchor,
  sessions,
  today,
  onDayClick,
  onSessionClick,
}: {
  anchor: string;
  sessions: TimetableSession[];
  today: string;
  onDayClick: (day: string) => void;
  onSessionClick: (session: TimetableSession) => void;
}) {
  const grid = monthGrid(anchor);
  const month = anchor.slice(0, 7);
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="min-h-0 overflow-auto">
        <div className="min-w-[640px]">
          <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-border bg-muted">
            {WEEKDAY_HEADERS.map((h, i) => (
              <div
                key={h}
                className={cn(
                  'px-2 py-2 text-center text-2xs font-bold text-muted-foreground uppercase',
                  i < 6 && 'border-r border-border',
                )}
              >
                {h}
              </div>
            ))}
          </div>
          {grid.map((week, w) => (
            <div key={w} className="grid grid-cols-7 border-b border-border last:border-b-0">
              {week.map((day, i) => {
                const list = sessionsOn(sessions, day);
                const inMonth = day.slice(0, 7) === month;
                const isToday = day === today;
                const extra = list.length - MAX_CHIPS;
                return (
                  <div
                    key={day}
                    className={cn(
                      'relative flex min-h-[96px] flex-col gap-0.5 px-1 pt-1 pb-1.5',
                      i < 6 && 'border-r border-border',
                      !inMonth && 'bg-background/60',
                      isToday && 'bg-[#faf8ff]',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onDayClick(day)}
                      aria-label={`Voir le ${day}`}
                      className={cn(
                        'mb-0.5 flex h-[22px] w-[22px] items-center justify-center self-start rounded-full text-2xs font-semibold hover:bg-muted',
                        isToday
                          ? 'bg-primary text-primary-foreground hover:bg-primary'
                          : inMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground/60',
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </button>
                    {list.slice(0, MAX_CHIPS).map((s) => (
                      <CourseCard
                        key={s.id}
                        session={s}
                        showClass={false}
                        compact
                        onClick={onSessionClick}
                      />
                    ))}
                    {extra > 0 && (
                      <button
                        type="button"
                        onClick={() => onDayClick(day)}
                        className="self-start px-1 text-[10px] font-semibold text-primary hover:underline"
                      >
                        +{extra} autre{extra > 1 ? 's' : ''}
                      </button>
                    )}
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
