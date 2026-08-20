'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { ChevronDown, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  COUNTRIES,
  flagEmoji,
  formatAsYouType,
  isLikelyInvalid,
  joinPhoneValue,
  splitPhoneValue,
  type Country,
} from '@/lib/phone-countries';

function countDigits(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

// Inverse of countDigits: the index right after the Nth digit in `s` — used
// to re-place the cursor once AsYouType has inserted/removed spaces around
// it, since a plain re-render would otherwise leave the browser's default
// (start-of-field) cursor position and make typing feel broken.
function positionAfterDigits(s: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < s.length; i++) {
    if (/\d/.test(s[i]!)) {
      seen++;
      if (seen === n) return i + 1;
    }
  }
  return s.length;
}

// Country-code + flag selector, composed of a Popover+cmdk country combobox
// (same primitive ActionMenu's `searchable` variant and the ⌘K
// CommandPalette already use) glued to a national-number input formatted
// live per the selected country's convention (libphonenumber-js's
// AsYouType). Drop-in replacement for `<Field label=... value=...
// onChange=...>` on phone fields: stores/emits one E.164 string
// ("+221771234567"), matching the server's `zPhone` contract — no schema
// change needed.
export function PhoneInput({
  label,
  value,
  onChange,
  placeholder,
  id,
  name,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  name?: string;
}) {
  const autoId = useId();
  const inputId = id ?? name ?? autoId;
  // Selected country lives in local state, not re-derived from `value` on
  // every render: `joinPhoneValue` emits '' when the national number is
  // still empty (nothing typed yet), and re-parsing '' would always fall
  // back to DEFAULT_COUNTRY — silently reverting the user's pick every time
  // they chose a country before typing any digits.
  const [country, setCountry] = useState<Country>(() => splitPhoneValue(value).country);
  const rawNational = value.startsWith(country.dialCode)
    ? value.slice(country.dialCode.length)
    : '';
  const displayNational = formatAsYouType(country, rawNational);
  const invalid = isLikelyInvalid(country, rawNational);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCursorDigits = useRef<number | null>(null);
  const t = useTranslations('Common.phoneInput');

  useLayoutEffect(() => {
    if (pendingCursorDigits.current === null || !inputRef.current) return;
    const pos = positionAfterDigits(displayNational, pendingCursorDigits.current);
    inputRef.current.setSelectionRange(pos, pos);
    pendingCursorDigits.current = null;
  }, [displayNational]);

  function selectCountry(next: Country) {
    setOpen(false);
    setQuery('');
    setCountry(next);
    onChange(joinPhoneValue(next, rawNational));
  }

  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
      {label && <span className="text-xs font-semibold text-foreground">{label}</span>}
      <span
        className={cn(
          'flex h-10 items-stretch rounded-md border border-border bg-input focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10',
          invalid && 'border-destructive-foreground/40 focus-within:border-destructive-foreground',
        )}
      >
        <Popover.Root
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setQuery('');
          }}
        >
          <Popover.Trigger
            type="button"
            aria-label={t('chooseCountryCode')}
            className="flex shrink-0 items-center gap-1.5 rounded-l-md border-r border-border px-2.5 text-sm text-foreground outline-none hover:bg-muted data-[state=open]:bg-muted"
          >
            <span className="text-base leading-none">{flagEmoji(country.iso2)}</span>
            <span className="text-xs font-medium text-muted-foreground">{country.dialCode}</span>
            <ChevronDown size={12} className="text-muted-foreground" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={4}
              collisionPadding={8}
              className="z-50 w-[260px] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
            >
              <Command shouldFilter className="flex flex-col">
                <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                  <Search size={13} className="shrink-0 text-muted-foreground" />
                  <Command.Input
                    autoFocus
                    value={query}
                    onValueChange={setQuery}
                    placeholder={t('searchCountry')}
                    className="w-full bg-transparent text-caption text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <Command.List className="max-h-[min(320px,var(--radix-popover-content-available-height))] overflow-y-auto p-1.5">
                  <Command.Empty className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                    {t('noCountryFound')}
                  </Command.Empty>
                  {COUNTRIES.map((c) => (
                    <Command.Item
                      key={c.iso2}
                      value={`${c.name} ${c.dialCode}`}
                      onSelect={() => selectCountry(c)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-caption font-medium text-foreground outline-none data-[selected=true]:bg-secondary data-[selected=true]:text-primary',
                        c.iso2 === country.iso2 && 'text-primary',
                      )}
                    >
                      <span className="text-base leading-none">{flagEmoji(c.iso2)}</span>
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.dialCode}</span>
                    </Command.Item>
                  ))}
                </Command.List>
              </Command>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-invalid={invalid}
          value={displayNational}
          onChange={(e) => {
            const cursorPos = e.target.selectionStart ?? e.target.value.length;
            pendingCursorDigits.current = countDigits(e.target.value.slice(0, cursorPos));
            onChange(joinPhoneValue(country, e.target.value));
          }}
          placeholder={placeholder ?? t('numberPlaceholder')}
          className="min-w-0 flex-1 rounded-r-md border-none bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </span>
      {invalid && (
        <span className="text-xs text-destructive-foreground">
          {t('invalidFormat', { country: country.name })}
        </span>
      )}
    </label>
  );
}
