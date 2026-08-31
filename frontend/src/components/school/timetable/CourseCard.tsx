'use client';

// Banani `.course-card` (emploi-du-temps.md): tinted card with a 3px colour
// band on the left, type pill (9px/700 uppercase), title 11px/700 and a
// 10px meta line « Enseignant · Salle » (+ class name when several classes
// share the grid). Colours come from the session's accent (data-driven →
// inline style, like the subject tiles elsewhere).
import type { TimetableSession } from './types';
import { cardColors, minutesToHHMM, sessionColor, typeMeta } from './timetable-utils';
import { cn } from '@/lib/utils';

export function CourseCard({
  session,
  showClass,
  compact = false,
  onClick,
}: {
  session: TimetableSession;
  /** Prefix the meta line with the class name (grid without a class filter). */
  showClass: boolean;
  /** Month view: one line — « 08:00 Mathématiques ». */
  compact?: boolean;
  /** Absent → read-only rendering (teacher portal): same card, no button semantics. */
  onClick?: (session: TimetableSession) => void;
}) {
  const colors = cardColors(sessionColor(session));
  const meta = [
    showClass ? session.class.name : null,
    session.teacher?.name ?? null,
    session.room,
  ].filter((v): v is string => !!v);
  const label = `${session.subject.name}, ${session.class.name}, ${minutesToHHMM(session.startMinutes)}–${minutesToHHMM(session.endMinutes)}`;

  if (compact) {
    const compactStyle = {
      background: colors.background,
      color: colors.color,
      borderLeftColor: colors.band,
    };
    const compactClass =
      'flex w-full items-center gap-1 truncate rounded-[3px] border-l-2 px-1 py-px text-left text-[10px] leading-[1.35] font-semibold';
    const compactChildren = (
      <>
        <span className="shrink-0 tabular-nums opacity-80">
          {minutesToHHMM(session.startMinutes)}
        </span>
        <span className="truncate">{session.subject.abbreviation ?? session.subject.name}</span>
      </>
    );
    return onClick ? (
      <button
        type="button"
        onClick={() => onClick(session)}
        aria-label={label}
        title={label}
        style={compactStyle}
        className={compactClass}
      >
        {compactChildren}
      </button>
    ) : (
      <div title={label} style={compactStyle} className={compactClass}>
        {compactChildren}
      </div>
    );
  }

  const fullStyle = {
    background: colors.background,
    color: colors.color,
    borderLeftColor: colors.band,
  };
  const fullBaseClass =
    'relative z-10 m-0.5 flex w-[calc(100%-4px)] flex-col items-start overflow-hidden rounded-md border-l-[3px] px-[9px] py-[7px] text-left';
  const fullChildren = (
    <>
      <span
        className={cn(
          'inline-flex items-center rounded-full px-[5px] py-px text-[9px] leading-[1.4] font-bold tracking-[0.4px] uppercase',
          typeMeta(session.type).badge,
        )}
      >
        {typeMeta(session.type).short}
      </span>
      <span className="mt-[3px] w-full truncate text-2xs leading-[1.3] font-bold">
        {session.subject.name}
      </span>
      {meta.length > 0 && (
        <span className="mt-0.5 w-full truncate text-[10px] leading-[1.3] opacity-75">
          {meta.join(' · ')}
        </span>
      )}
    </>
  );

  return onClick ? (
    <button
      type="button"
      onClick={() => onClick(session)}
      aria-label={label}
      style={fullStyle}
      className={cn(
        fullBaseClass,
        'transition-[filter] hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
      )}
    >
      {fullChildren}
    </button>
  ) : (
    <div title={label} style={fullStyle} className={fullBaseClass}>
      {fullChildren}
    </div>
  );
}
