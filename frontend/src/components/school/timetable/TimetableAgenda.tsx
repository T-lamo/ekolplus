'use client';

// Agenda view (emploi-du-temps.md): the week's sessions as a list grouped
// by day — time range, colour band, subject + « Classe · Enseignant · Salle »,
// type pill. Same data as the grid; reads better on a phone.
import { CalendarX2 } from 'lucide-react';
import type { TimetableSession } from './types';
import {
  cardColors,
  formatDayShort,
  formatDayName,
  minutesToHHMM,
  sessionColor,
  sessionsOn,
  typeMeta,
} from './timetable-utils';
import { cn } from '@/lib/utils';

export function TimetableAgenda({
  days,
  sessions,
  today,
  onSessionClick,
}: {
  days: string[];
  sessions: TimetableSession[];
  today: string;
  onSessionClick: (session: TimetableSession) => void;
}) {
  const total = days.reduce((n, d) => n + sessionsOn(sessions, d).length, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-4 py-10 text-center">
        <CalendarX2 size={22} className="text-muted-foreground" />
        <p className="text-caption font-semibold text-foreground">
          Aucune séance sur cette période
        </p>
        <p className="text-xs text-muted-foreground">
          Ajoute un cours ou change de semaine avec les flèches.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card">
      {days.map((day) => {
        const list = sessionsOn(sessions, day);
        if (list.length === 0) return null;
        const isToday = day === today;
        return (
          <section key={day} className="border-b border-border last:border-b-0">
            <h3
              className={cn(
                'sticky top-0 z-20 flex items-baseline gap-2 border-b border-border px-4 py-2',
                isToday ? 'bg-secondary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'text-caption font-bold',
                  isToday ? 'text-primary' : 'text-foreground',
                )}
              >
                {formatDayName(day)}
              </span>
              <span className="text-2xs text-muted-foreground">{formatDayShort(day)}</span>
              {isToday && (
                <span className="ml-auto rounded-full bg-card px-2 py-px text-[10px] font-semibold text-primary">
                  Aujourd’hui
                </span>
              )}
            </h3>
            <ul>
              {list.map((s) => {
                const colors = cardColors(sessionColor(s));
                const meta = [s.class.name, s.teacher?.name, s.room].filter(Boolean).join(' · ');
                return (
                  <li key={s.id} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onSessionClick(s)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-background"
                    >
                      <span className="w-[92px] shrink-0 text-xs font-semibold text-foreground tabular-nums">
                        {minutesToHHMM(s.startMinutes)} – {minutesToHHMM(s.endMinutes)}
                      </span>
                      <span
                        aria-hidden
                        className="h-8 w-[3px] shrink-0 rounded-full"
                        style={{ background: colors.band }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-caption font-semibold text-foreground">
                          {s.subject.name}
                        </span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {meta}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-[7px] py-0.5 text-[10px] font-bold',
                          typeMeta(s.type).badge,
                        )}
                      >
                        {typeMeta(s.type).short}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
