// Display helpers of the Abonnement screens (tab + checkout récap). Pure
// functions over the GET /api/school/billing payload — no fetch, no JSX.
import type { BillingSummary, BillingTransactionRow } from '@/lib/billing-plans';

export function fmtDateLong(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** "Août 2025" — the month a transaction covers. */
export function fmtPeriodMonth(iso: string): string {
  const s = new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Whole days from now to `iso` (negative when past). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export type StatusTone = 'success' | 'warning' | 'destructive' | 'muted' | 'primary' | 'gold';

/**
 * Human status of the current subscription. Stripe's raw status wins when
 * present (past_due / unpaid / paused are more precise than our enum);
 * `cancelAtPeriodEnd` overlays "résilié — actif jusqu'au …". A healthy paid
 * plan (trial / active) reads gold — « or = plan payant » app-wide.
 */
export function subscriptionStatusLabel(b: BillingSummary): { label: string; tone: StatusTone } {
  // A back-office suspension of a manual Pro row still reads « Suspendu »
  // (effective plan is Starter, but the pill must say why).
  if (b.plan === 'STARTER' && !b.managedByStripe && b.status !== 'SUSPENDED')
    return { label: 'Gratuit', tone: 'muted' };
  if (b.cancelAtPeriodEnd) return { label: 'Résiliation programmée', tone: 'warning' };
  switch (b.stripeStatus) {
    case 'trialing':
      return { label: 'Essai en cours', tone: 'gold' };
    case 'past_due':
      return { label: 'Paiement en retard', tone: 'warning' };
    case 'unpaid':
      return { label: 'Impayé', tone: 'destructive' };
    case 'paused':
      return { label: 'En pause', tone: 'muted' };
    case 'incomplete':
      return { label: 'Paiement incomplet', tone: 'warning' };
    default:
      break;
  }
  switch (b.status) {
    case 'TRIAL':
      return { label: 'Essai en cours', tone: 'gold' };
    case 'ACTIVE':
      return { label: 'Actif', tone: 'gold' };
    case 'SUSPENDED':
      return { label: 'Suspendu', tone: 'destructive' };
    case 'EXPIRED':
      return { label: 'Expiré', tone: 'muted' };
    case 'CANCELED':
      return { label: 'Résilié', tone: 'muted' };
    default:
      return { label: 'Gratuit', tone: 'muted' };
  }
}

export function transactionStatusLabel(t: BillingTransactionRow): {
  label: string;
  tone: StatusTone;
} {
  switch (t.status) {
    case 'SUCCEEDED':
      return { label: 'Payé', tone: 'success' };
    case 'PENDING':
      return { label: 'En attente', tone: 'warning' };
    case 'FAILED':
      return { label: 'Échoué', tone: 'destructive' };
    case 'REFUNDED':
      return { label: 'Remboursé', tone: 'muted' };
    default:
      return { label: t.status, tone: 'muted' };
  }
}

export const METHOD_LABELS: Record<BillingTransactionRow['method'], string> = {
  STRIPE: 'Carte · Stripe',
  MANUAL: 'Manuel',
  BANK_TRANSFER: 'Virement',
};

/** Percentage (0-100) of a cap consumed, or null when uncapped. */
export function usagePct(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}
