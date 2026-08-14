// Client-side formatting helpers shared by the 3 Frais & Scolarité screens
// + the Payment Registration modal — kept in one place so amount/date
// rendering can never drift between them. See .planning/banani/frais-scolarite.md.
import { formatPrice } from '@/lib/utils';
import { FEES } from '@/lib/constants';

export function fmtMoney(amount: number, currency: string = FEES.currency): string {
  return formatPrice(amount, currency);
}

export function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function fmtDateShort(d: string | Date): string {
  return new Date(d).toLocaleDateString('fr-FR', {
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
