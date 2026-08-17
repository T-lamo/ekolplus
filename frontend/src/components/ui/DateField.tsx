'use client';

import {
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker, type ChevronProps } from 'react-day-picker';
import { fr } from 'react-day-picker/locale';
import {
  addYears,
  format,
  isValid,
  parseISO,
  setMonth as setMonthOf,
  setYear as setYearOf,
  startOfMonth,
} from 'date-fns';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTyped, maskDateInput, parseTypedDate } from './date-field-parse';

// Drop-in replacement for `<Field type="date">` — same value contract
// ('YYYY-MM-DD' string, '' when empty) so no calling form/API/zod schema
// needs to change.
//
// User decision 2026-08-17: the previous picker (react-day-picker with
// `captionLayout="dropdown"` and no `endMonth`) silently capped navigation
// at the END OF THE CURRENT YEAR (and 100 years back) — « il arrive
// seulement à 2026 ». This version has no cap unless `minDate`/`maxDate`
// say so, and is « beaucoup plus complet » while staying on the app's
// design language (Field-like control, Card-like popover, primary accents):
//   • the control is a real text input — type `jj/mm/aaaa` (progressive
//     mask; also accepts 16-06-2025, 16.06.2025, 16062025, 2025-06-16),
//     shown as « 16 juin 2025 » (« Lundi 16 juin 2025 » with `weekday`)
//     when not editing; invalid text turns the border red with a hint;
//   • the calendar popover: ‹ › month arrows without limit, click the
//     caption « août 2026 » → year grid (12 per page, ‹ › by 12 years) →
//     month grid → days — no native <select> (OS-styled, off-design);
//   • footer « Aujourd'hui » / « Effacer ».
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
  /** 36px / 13px control matching the subject & timetable form controls
   * (default is the 40px / 14px generic field). */
  compact?: boolean;
  /** Leading icon override (default: calendar). */
  icon?: ReactNode;
  /** Small muted line under the control. */
  hint?: string;
  /** Inclusive bounds ('YYYY-MM-DD') — days outside are disabled, typed
   * dates outside are refused, navigation stops at the bound. */
  minDate?: string;
  maxDate?: string;
  /** Show the weekday too — « Lundi 16 juin 2025 ». */
  weekday?: boolean;
}) {
  const autoId = useId();
  const inputId = id ?? name ?? autoId;
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  // `text !== null` = the user is editing the raw jj/mm/aaaa string.
  const [text, setText] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');

  const parsed = value ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const min = minDate ? parseISO(minDate) : undefined;
  const max = maxDate ? parseISO(maxDate) : undefined;
  const minOk = min && isValid(min) ? min : undefined;
  const maxOk = max && isValid(max) ? max : undefined;
  const bounds = { min: minOk ? minDate : undefined, max: maxOk ? maxDate : undefined };
  const disabledDays = [
    ...(minOk ? [{ before: minOk }] : []),
    ...(maxOk ? [{ after: maxOk }] : []),
  ];

  // Visible month of the calendar (controlled so the year/month grids can
  // jump anywhere) and the first year of the 12-year page.
  const [month, setMonth] = useState<Date>(() => startOfMonth(selected ?? new Date()));
  const [yearPage, setYearPage] = useState<number>(() =>
    pageStart((selected ?? new Date()).getFullYear()),
  );

  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const todayAllowed = parseTypedDate(formatTyped(todayIso), bounds) !== null;

  function commit(iso: string) {
    onChange(iso);
    setText(null);
    setInvalid(false);
    if (iso) {
      const d = parseISO(iso);
      if (isValid(d)) {
        setMonth(startOfMonth(d));
        setYearPage(pageStart(d.getFullYear()));
      }
    }
  }

  function openCalendar() {
    if (disabled) return;
    setView('days');
    const base = selected ?? new Date();
    setMonth(startOfMonth(base));
    setYearPage(pageStart(base.getFullYear()));
    setOpen(true);
  }

  // ── typed input ────────────────────────────────────────────────────────
  const displayText =
    text !== null
      ? text
      : selected
        ? weekday
          ? capitalize(format(selected, 'EEEE d MMMM yyyy', { locale: fr }))
          : format(selected, 'd MMMM yyyy', { locale: fr })
        : '';

  function handleFocus() {
    if (text === null) setText(formatTyped(value));
    // Select the raw text so typing replaces it.
    requestAnimationFrame(() => inputRef.current?.select());
  }
  function handleInput(raw: string) {
    const masked = maskDateInput(raw);
    setText(masked);
    setInvalid(false);
    if (masked.trim() === '') {
      onChange('');
      return;
    }
    // A complete valid date is committed as you type so the calendar and
    // the form follow immediately; incomplete text waits for blur.
    const iso = parseTypedDate(masked, bounds);
    if (iso) {
      onChange(iso);
      const d = parseISO(iso);
      setMonth(startOfMonth(d));
      setYearPage(pageStart(d.getFullYear()));
    }
  }
  function handleBlur() {
    if (text === null) return;
    if (text.trim() === '') {
      commit('');
      return;
    }
    const iso = parseTypedDate(text, bounds);
    if (iso) commit(iso);
    else setInvalid(true); // keep the raw text visible so it can be fixed
  }
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBlur();
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Escape' && (text !== null || open)) {
      // Cancel the edit / close the calendar — and swallow the key so a
      // parent Modal (document-level Escape listener) doesn't close too.
      // stopImmediatePropagation: React's own listener sits on `document`
      // (App Router hydrates the document), same node as the Modal's.
      e.nativeEvent.stopImmediatePropagation();
      setText(null);
      setInvalid(false);
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown' && !open) {
      openCalendar();
    }
  }

  // ── calendar caption → year grid (stable component reading a ref) ─────
  const setViewRef = useRef(setView);
  setViewRef.current = setView;
  const CaptionButton = useMemo(
    () =>
      function CaptionButton({ children, className }: HTMLAttributes<HTMLSpanElement>) {
        return (
          <button
            type="button"
            onClick={() => setViewRef.current('years')}
            className={cn(
              className,
              'rounded-md px-2 py-0.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/10 focus-visible:outline-none',
            )}
            aria-label="Choisir le mois et l'année"
          >
            <span className="capitalize">{children}</span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>
        );
      },
    [],
  );

  const yearDisabled = (y: number) =>
    (minOk !== undefined && y < minOk.getFullYear()) ||
    (maxOk !== undefined && y > maxOk.getFullYear());
  const monthDisabled = (d: Date) =>
    (minOk !== undefined && d < startOfMonth(minOk)) ||
    (maxOk !== undefined && startOfMonth(d) > maxOk);

  const NAV_BTN =
    'flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/10 disabled:pointer-events-none disabled:opacity-30';
  const GRID_BTN =
    'flex h-9 items-center justify-center rounded-md text-sm text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/10 focus-visible:outline-none disabled:pointer-events-none disabled:text-muted-foreground/30';

  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          if (next) openCalendar();
          else setOpen(false);
        }}
      >
        <Popover.Anchor asChild>
          <div
            ref={anchorRef}
            className={cn(
              'flex w-full items-center gap-2 rounded-md border border-border bg-input px-3 transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10',
              compact ? 'h-9 text-caption' : 'h-10 text-sm',
              open && 'border-primary',
              invalid && 'border-destructive-foreground focus-within:border-destructive-foreground',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {icon ?? <Calendar size={15} className="shrink-0 text-muted-foreground" />}
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              aria-required={required}
              aria-invalid={invalid || undefined}
              placeholder="jj/mm/aaaa"
              value={displayText}
              onChange={(e) => handleInput(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onClick={() => {
                if (!open) openCalendar();
              }}
              className={cn(
                'min-w-0 flex-1 bg-transparent text-left outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
                selected || text !== null ? 'text-foreground' : 'text-muted-foreground',
              )}
            />
            <Popover.Trigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label="Ouvrir le calendrier"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/10 disabled:cursor-not-allowed"
              >
                <ChevronDown
                  size={14}
                  className={cn('transition-transform duration-200', open && 'rotate-180')}
                />
              </button>
            </Popover.Trigger>
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            // Keep the keyboard in the text input when the popover opens on
            // click; the calendar stays reachable with Tab / ArrowDown.
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              // Clicking back into the control must not close-then-reopen.
              if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
            onKeyDown={(e) => {
              // Escape inside the calendar closes only the calendar (Radix
              // handles the dismiss); keep it from reaching a parent Modal.
              if (e.key === 'Escape') e.nativeEvent.stopImmediatePropagation();
            }}
            className="z-50 w-[286px] rounded-xl border border-border bg-card p-3 shadow-lg"
          >
            {view === 'days' && (
              <DayPicker
                mode="single"
                locale={fr}
                month={month}
                onMonthChange={(m) => {
                  setMonth(m);
                  setYearPage(pageStart(m.getFullYear()));
                }}
                {...(selected ? { selected } : {})}
                onSelect={(date) => {
                  commit(date ? format(date, 'yyyy-MM-dd') : '');
                  setOpen(false);
                }}
                {...(minOk ? { startMonth: startOfMonth(minOk) } : {})}
                {...(maxOk ? { endMonth: startOfMonth(maxOk) } : {})}
                {...(disabledDays.length > 0 ? { disabled: disabledDays } : {})}
                captionLayout="label"
                showOutsideDays
                components={{ Chevron: CalendarChevron, CaptionLabel: CaptionButton }}
                classNames={{
                  months: 'flex flex-col gap-3',
                  month: 'flex flex-col gap-3',
                  month_caption: 'relative flex h-8 items-center justify-center',
                  caption_label: 'flex items-center gap-1 text-sm font-bold text-foreground',
                  // The nav is rendered BEFORE the caption row in the DOM, so
                  // it must be lifted (z-10) or the caption row covers the
                  // arrows; pointer-events stay off on the bar itself so the
                  // caption button in the middle remains clickable.
                  nav: 'pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between',
                  button_previous: cn(NAV_BTN, 'pointer-events-auto'),
                  button_next: cn(NAV_BTN, 'pointer-events-auto'),
                  month_grid: 'w-full border-collapse',
                  weekdays: '',
                  weekday: 'w-9 pb-1.5 text-2xs font-semibold text-muted-foreground',
                  weeks: '',
                  week: '',
                  day: 'p-0.5 text-center align-middle',
                  day_button:
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/10 focus-visible:outline-none',
                  today: '[&>button]:font-bold [&>button]:text-primary',
                  selected:
                    '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:font-bold [&>button]:hover:bg-primary',
                  outside: '[&>button]:text-muted-foreground/40',
                  disabled: '[&>button]:text-muted-foreground/30 [&>button]:pointer-events-none',
                  hidden: 'invisible',
                }}
              />
            )}

            {view === 'years' && (
              <div className="flex flex-col gap-3">
                <div className="relative flex h-8 items-center justify-center">
                  <button
                    type="button"
                    aria-label="12 années précédentes"
                    onClick={() => setYearPage((p) => p - 12)}
                    disabled={minOk !== undefined && yearPage - 1 < minOk.getFullYear()}
                    className={cn(NAV_BTN, 'absolute left-0')}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-bold text-foreground">
                    {yearPage} – {yearPage + 11}
                  </span>
                  <button
                    type="button"
                    aria-label="12 années suivantes"
                    onClick={() => setYearPage((p) => p + 12)}
                    disabled={maxOk !== undefined && yearPage + 12 > maxOk.getFullYear()}
                    className={cn(NAV_BTN, 'absolute right-0')}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: 12 }, (_, i) => yearPage + i).map((y) => {
                    const isSelected = selected?.getFullYear() === y;
                    const isCurrent = new Date().getFullYear() === y;
                    return (
                      <button
                        key={y}
                        type="button"
                        disabled={yearDisabled(y)}
                        aria-pressed={isSelected}
                        onClick={() => {
                          setMonth((m) => startOfMonth(setYearOf(m, y)));
                          setView('months');
                        }}
                        className={cn(
                          GRID_BTN,
                          isCurrent && !isSelected && 'font-bold text-primary',
                          isSelected &&
                            'bg-primary font-bold text-primary-foreground hover:bg-primary',
                        )}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {view === 'months' && (
              <div className="flex flex-col gap-3">
                <div className="relative flex h-8 items-center justify-center">
                  <button
                    type="button"
                    aria-label="Année précédente"
                    onClick={() => setMonth((m) => addYears(m, -1))}
                    disabled={minOk !== undefined && month.getFullYear() - 1 < minOk.getFullYear()}
                    className={cn(NAV_BTN, 'absolute left-0')}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setYearPage(pageStart(month.getFullYear()));
                      setView('years');
                    }}
                    className="flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/10 focus-visible:outline-none"
                    aria-label="Choisir l'année"
                  >
                    {month.getFullYear()}
                    <ChevronDown size={14} className="text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    aria-label="Année suivante"
                    onClick={() => setMonth((m) => addYears(m, 1))}
                    disabled={maxOk !== undefined && month.getFullYear() + 1 > maxOk.getFullYear()}
                    className={cn(NAV_BTN, 'absolute right-0')}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: 12 }, (_, i) => setMonthOf(month, i)).map((d) => {
                    const isSelected =
                      selected !== undefined &&
                      selected.getFullYear() === d.getFullYear() &&
                      selected.getMonth() === d.getMonth();
                    const now = new Date();
                    const isCurrent =
                      now.getFullYear() === d.getFullYear() && now.getMonth() === d.getMonth();
                    return (
                      <button
                        key={d.getMonth()}
                        type="button"
                        disabled={monthDisabled(d)}
                        aria-pressed={isSelected}
                        onClick={() => {
                          setMonth(startOfMonth(d));
                          setView('days');
                        }}
                        className={cn(
                          GRID_BTN,
                          'capitalize',
                          isCurrent && !isSelected && 'font-bold text-primary',
                          isSelected &&
                            'bg-primary font-bold text-primary-foreground hover:bg-primary',
                        )}
                      >
                        {format(d, 'MMM', { locale: fr }).replace('.', '')}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <button
                type="button"
                disabled={!todayAllowed}
                onClick={() => {
                  commit(todayIso);
                  setOpen(false);
                }}
                className="rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/10 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
              >
                Aujourd&apos;hui
              </button>
              {view !== 'days' ? (
                <button
                  type="button"
                  onClick={() => setView('days')}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/10 focus-visible:outline-none"
                >
                  Retour aux jours
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!selected}
                  onClick={() => {
                    commit('');
                    setOpen(false);
                  }}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/10 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
                >
                  Effacer
                </button>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {invalid ? (
        <span role="alert" className="text-2xs text-destructive-foreground">
          Date invalide — utilise le format jj/mm/aaaa
          {minDate || maxDate
            ? ` (entre ${minDate ? formatTyped(minDate) : '…'} et ${maxDate ? formatTyped(maxDate) : '…'})`
            : ''}
        </span>
      ) : (
        hint && <span className="text-2xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

/** First year of the 12-year page containing `year` (aligned on multiples
 * of 12 so paging is predictable: 2016–2027, 2028–2039, …). */
function pageStart(year: number): number {
  return year - (((year % 12) + 12) % 12);
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function CalendarChevron({ orientation, className }: ChevronProps) {
  if (orientation === 'right') return <ChevronRight className={className} size={16} />;
  if (orientation === 'down') return <ChevronDown className={className} size={14} />;
  return <ChevronLeft className={className} size={16} />;
}
