'use client';

import { useId, useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker, type ChevronProps } from 'react-day-picker';
import { fr } from 'react-day-picker/locale';
import { format, isValid, parseISO } from 'date-fns';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Drop-in replacement for `<Field type="date">` — same value contract
// ('YYYY-MM-DD' string, '' when empty) so no calling form/API/zod schema
// needs to change. Renders a fully custom calendar (Radix Popover +
// react-day-picker, headless — no default stylesheet imported) instead of
// the browser's native date picker, whose chrome can't be restyled and
// looks different per OS/browser.
export function DateField({
  label,
  value,
  onChange,
  required,
  disabled,
  id,
  name,
  compact = false,
  icon,
  hint,
  minDate,
  maxDate,
  weekday = false,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  /** 36px / 13px trigger matching the subject & timetable form controls
   * (default is the 40px / 14px generic field). */
  compact?: boolean;
  /** Leading icon override (default: calendar). */
  icon?: ReactNode;
  /** Small muted line under the trigger. */
  hint?: string;
  /** Inclusive bounds ('YYYY-MM-DD') — days outside are disabled. */
  minDate?: string;
  maxDate?: string;
  /** Show the weekday too — « Lundi 16 juin 2025 ». */
  weekday?: boolean;
}) {
  const autoId = useId();
  const inputId = id ?? name ?? autoId;
  const [open, setOpen] = useState(false);

  const parsed = value ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const min = minDate ? parseISO(minDate) : undefined;
  const max = maxDate ? parseISO(maxDate) : undefined;
  const disabledDays = [
    ...(min && isValid(min) ? [{ before: min }] : []),
    ...(max && isValid(max) ? [{ after: max }] : []),
  ];

  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          id={inputId}
          type="button"
          disabled={disabled}
          aria-required={required}
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-border bg-input px-3 text-left outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-primary',
            compact ? 'h-9 text-caption' : 'h-10 text-sm',
          )}
        >
          {icon ?? <Calendar size={15} className="shrink-0 text-muted-foreground" />}
          <span className={cn('flex-1', selected ? 'text-foreground' : 'text-muted-foreground')}>
            {selected
              ? weekday
                ? capitalize(format(selected, 'EEEE d MMMM yyyy', { locale: fr }))
                : format(selected, 'd MMMM yyyy', { locale: fr })
              : 'Sélectionner...'}
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-50 rounded-xl border border-border bg-card p-3 shadow-lg"
          >
            <DayPicker
              mode="single"
              locale={fr}
              {...(selected ? { selected, defaultMonth: selected } : {})}
              onSelect={(date) => {
                onChange(date ? format(date, 'yyyy-MM-dd') : '');
                setOpen(false);
              }}
              {...(disabledDays.length > 0 ? { disabled: disabledDays } : {})}
              captionLayout="dropdown"
              showOutsideDays
              components={{ Chevron: CalendarChevron }}
              classNames={{
                months: 'flex flex-col gap-3',
                month: 'flex flex-col gap-3',
                month_caption: 'relative flex h-8 items-center justify-center',
                caption_label:
                  'pointer-events-none flex items-center gap-1 text-sm font-bold text-foreground',
                dropdowns: 'flex items-center gap-1',
                dropdown_root: 'relative inline-flex items-center',
                dropdown: 'absolute inset-0 z-10 cursor-pointer opacity-0',
                nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
                button_previous:
                  'flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted disabled:pointer-events-none disabled:opacity-30',
                button_next:
                  'flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted disabled:pointer-events-none disabled:opacity-30',
                month_grid: 'w-full border-collapse',
                weekdays: '',
                weekday: 'w-9 pb-1.5 text-2xs font-semibold text-muted-foreground',
                weeks: '',
                week: '',
                day: 'p-0.5 text-center align-middle',
                day_button:
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm text-foreground transition-colors hover:bg-muted',
                today: '[&>button]:font-bold [&>button]:text-primary',
                selected:
                  '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:font-bold [&>button]:hover:bg-primary',
                outside: '[&>button]:text-muted-foreground/40',
                disabled: '[&>button]:text-muted-foreground/30 [&>button]:pointer-events-none',
                hidden: 'invisible',
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {hint && <span className="text-2xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function CalendarChevron({ orientation, className }: ChevronProps) {
  if (orientation === 'right') return <ChevronRight className={className} size={16} />;
  if (orientation === 'down') return <ChevronDown className={className} size={14} />;
  return <ChevronLeft className={className} size={16} />;
}
