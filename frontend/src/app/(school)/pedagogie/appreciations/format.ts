// Shared formatting/styling helpers for the Appréciations screens.
// Consolidates what used to be 5 byte-identical copies of `fmt()` (one in
// every file of this module), plus 2 copies each of `mentionClass()` and
// `moyColor()`.
//
// `fmtAverage` is the locale-aware replacement for the old
// `n.toFixed(1).replace('.', ',')`: the manual comma forced a French
// decimal separator on English readers (15,3 instead of 15.3). It takes
// the active locale as an explicit parameter rather than reading a hook —
// it is a plain function, and every call site already has `useLocale()` in
// scope.
//
// Pure functions: no JSX, no translation strings of their own. This file
// is a formatting/styling helper, not a message namespace.

import { LOCALE_BCP47, type LocaleKey } from '@/lib/locales';
import type { Mention } from './types';

/** An average out of 20 with one decimal, using the locale's own decimal
 * separator (`15,3` in fr/ht, `15.3` in en). `null` renders as an em dash,
 * exactly like the 5 `fmt()` copies this replaces. */
export function fmtAverage(value: number | null, locale: LocaleKey): string {
  if (value == null) return '—';
  return new Intl.NumberFormat(LOCALE_BCP47[locale], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** Badge colours for a mention chip. */
export function mentionClass(mention: Mention | null): string {
  switch (mention) {
    case 'TRES_BIEN':
      return 'bg-success text-success-foreground';
    case 'BIEN':
      return 'bg-info text-info-foreground';
    case 'ASSEZ_BIEN':
      return 'bg-warning text-warning-foreground';
    case 'PASSABLE':
      return 'bg-muted text-muted-foreground';
    case 'INSUFFISANT':
    case 'FAIBLE':
      return 'bg-destructive text-destructive-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/** Text colour for an average out of 20. */
export function moyColor(value: number | null): string {
  if (value == null) return 'text-muted-foreground';
  if (value < 8) return 'text-destructive-foreground';
  if (value < 12) return 'text-warning-foreground';
  if (value < 16) return 'text-info-foreground';
  return 'text-success-foreground';
}
