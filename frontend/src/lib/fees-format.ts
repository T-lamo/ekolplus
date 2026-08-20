// Client-side formatting helpers shared by the 3 Frais & Scolarité screens
// + the Payment Registration modal — kept in one place so amount/date
// rendering can never drift between them. See .planning/banani/frais-scolarite.md.
//
// `locale` defaults to `'fr-FR'` so any not-yet-migrated caller keeps its
// exact current behavior — this default is removed (parameter becomes
// required) once every caller passes its real locale explicitly. See
// docs/superpowers/plans/2026-08-20-i18n-scolarite.md Task 7.
import { formatPrice } from '@/lib/utils';

const DEFAULT_CURRENCY = 'HTG';

export function fmtMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  return formatPrice(amount, currency);
}

export function fmtDate(d: string | Date, locale: string = 'fr-FR'): string {
  return new Date(d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function fmtDateShort(d: string | Date, locale: string = 'fr-FR'): string {
  return new Date(d).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// "1.5/3" style fraction used by the Fee Management table's "Tranches" column.
export function fmtFraction(paid: number, total: number): string {
  const n = Number.isInteger(paid) ? paid : Math.round(paid * 10) / 10;
  return `${n}/${total}`;
}
