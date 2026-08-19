'use client';

// Language picker (Paramètres › Langue, and the « Langue » card of the
// SaaS admin settings) + a compact variant for pages reachable before
// login (the Login page itself — a Creole-speaking visitor may never get
// past a French-only sign-in screen otherwise, and most OSes don't even
// offer Haitian Creole in their language list, so Accept-Language alone
// isn't enough).
//
// Same roving-tabindex keyboard contract as ThemePicker/PlanCards:
// ←/→/↑/↓ move and select, Space/Enter select. Language names are never
// translated — every tile always shows the language's own name for
// itself, so a user can find their language regardless of which one is
// currently active.
import { useId, useState, type KeyboardEvent } from 'react';
import { Check, Languages } from 'lucide-react';
import { useLocalePreference } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { LOCALES, LOCALE_KEYS, type LocaleKey } from '@/lib/locales';
import { cn } from '@/lib/utils';

// Not sourced from message files on purpose (see file header): a picker
// whose own labels depend on the current language defeats its purpose.
const TOAST_APPLIED: Record<LocaleKey, string> = {
  fr: 'Langue appliquée : Français.',
  ht: 'Lang aplike : Kreyòl Ayisyen.',
  en: 'Language applied: English.',
};
const SAVE_ERROR: Record<LocaleKey, string> = {
  fr: 'Langue appliquée sur cet appareil, mais impossible de l’enregistrer sur ton compte.',
  ht: 'Lang lan aplike sou aparèy sa a, men nou pa t kapab anrejistre l sou kont ou.',
  en: 'Language applied on this device, but we couldn’t save it to your account.',
};

function useApplyLocale() {
  const { locale, setLocale } = useLocalePreference();
  const { toast } = useToast();
  const [busy, setBusy] = useState<LocaleKey | null>(null);

  async function apply(next: LocaleKey) {
    if (next === locale || busy) return;
    setBusy(next);
    try {
      await setLocale(next);
      toast(TOAST_APPLIED[next], 'success');
    } catch {
      toast(SAVE_ERROR[locale], 'warning');
    } finally {
      setBusy(null);
    }
  }

  return { locale, busy, apply };
}

export function LanguagePicker({ className }: { className?: string }) {
  const { locale, busy, apply } = useApplyLocale();
  const groupId = useId();

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, key: LocaleKey) {
    const idx = LOCALE_KEYS.indexOf(key);
    let next: LocaleKey | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
      next = LOCALE_KEYS[(idx + 1) % LOCALE_KEYS.length] ?? null;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = LOCALE_KEYS[(idx - 1 + LOCALE_KEYS.length) % LOCALE_KEYS.length] ?? null;
    else if (e.key === ' ' || e.key === 'Enter') next = key;
    if (!next) return;
    e.preventDefault();
    void apply(next);
    document.getElementById(`${groupId}-${next}`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Langue de l'application"
      className={cn('grid gap-3 sm:grid-cols-3', className)}
    >
      {LOCALES.map((l) => {
        const selected = locale === l.key;
        return (
          <button
            key={l.key}
            type="button"
            id={`${groupId}-${l.key}`}
            role="radio"
            aria-checked={selected}
            aria-busy={busy === l.key || undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => void apply(l.key)}
            onKeyDown={(e) => onKeyDown(e, l.key)}
            className={cn(
              'flex items-center justify-between gap-2 rounded-xl border bg-card p-3.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              selected
                ? 'border-primary ring-2 ring-primary ring-offset-1'
                : 'border-border hover:border-primary/50',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Languages size={15} className="shrink-0 text-muted-foreground" />
              {l.nativeName}
            </span>
            <span
              aria-hidden
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background',
              )}
            >
              {selected && <Check size={12} strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Three text links — for pages reachable before login. No toast, no
 * busy-state chrome: a full page navigation (router.refresh) follows
 * immediately, which is feedback enough on a page this small. */
export function LocaleQuickSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocalePreference();
  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium', className)}
    >
      {LOCALES.map((l, i) => (
        <span key={l.key} className="flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden className="text-border">
              ·
            </span>
          )}
          <button
            type="button"
            onClick={() => void setLocale(l.key)}
            aria-current={locale === l.key ? 'true' : undefined}
            className={cn(
              'rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary',
              locale === l.key
                ? 'text-foreground underline'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {l.nativeName}
          </button>
        </span>
      ))}
    </div>
  );
}
