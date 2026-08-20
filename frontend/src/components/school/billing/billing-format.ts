// Display helpers of the Abonnement screens (tab + checkout récap). Pure
// functions over the GET /api/school/billing payload — no fetch, no JSX.
import type { BillingSummary, BillingTransactionRow } from '@/lib/billing-plans';

export function fmtDateLong(iso: string | null, bcp47: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(bcp47, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function fmtDateShort(iso: string | null, bcp47: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(bcp47, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** "Août 2025" — the month a transaction covers. */
export function fmtPeriodMonth(iso: string, bcp47: string): string {
  const s = new Date(iso).toLocaleDateString(bcp47, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Whole days from now to `iso` (negative when past). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export type StatusTone = 'success' | 'warning' | 'destructive' | 'muted' | 'primary' | 'gold';

export type SubscriptionStatusT = (
  key:
    | 'status.subscription.free'
    | 'status.subscription.scheduledCancellation'
    | 'status.subscription.trialing'
    | 'status.subscription.pastDue'
    | 'status.subscription.unpaid'
    | 'status.subscription.paused'
    | 'status.subscription.incompletePayment'
    | 'status.subscription.active'
    | 'status.subscription.suspended'
    | 'status.subscription.expired'
    | 'status.subscription.canceled',
) => string;

/**
 * Human status of the current subscription. Stripe's raw status wins when
 * present (past_due / unpaid / paused are more precise than our enum);
 * `cancelAtPeriodEnd` overlays "résilié — actif jusqu'au …". A healthy paid
 * plan (trial / active) reads gold — « or = plan payant » app-wide.
 */
export function subscriptionStatusLabel(
  b: BillingSummary,
  t: SubscriptionStatusT,
): { label: string; tone: StatusTone } {
  // A back-office suspension of a manual Pro row still reads « Suspendu »
  // (effective plan is Starter, but the pill must say why).
  if (b.plan === 'STARTER' && !b.managedByStripe && b.status !== 'SUSPENDED')
    return { label: t('status.subscription.free'), tone: 'muted' };
  if (b.cancelAtPeriodEnd)
    return { label: t('status.subscription.scheduledCancellation'), tone: 'warning' };
  switch (b.stripeStatus) {
    case 'trialing':
      return { label: t('status.subscription.trialing'), tone: 'gold' };
    case 'past_due':
      return { label: t('status.subscription.pastDue'), tone: 'warning' };
    case 'unpaid':
      return { label: t('status.subscription.unpaid'), tone: 'destructive' };
    case 'paused':
      return { label: t('status.subscription.paused'), tone: 'muted' };
    case 'incomplete':
      return { label: t('status.subscription.incompletePayment'), tone: 'warning' };
    default:
      break;
  }
  switch (b.status) {
    case 'TRIAL':
      return { label: t('status.subscription.trialing'), tone: 'gold' };
    case 'ACTIVE':
      return { label: t('status.subscription.active'), tone: 'gold' };
    case 'SUSPENDED':
      return { label: t('status.subscription.suspended'), tone: 'destructive' };
    case 'EXPIRED':
      return { label: t('status.subscription.expired'), tone: 'muted' };
    case 'CANCELED':
      return { label: t('status.subscription.canceled'), tone: 'muted' };
    default:
      return { label: t('status.subscription.free'), tone: 'muted' };
  }
}

export type TransactionStatusT = (
  key:
    | 'status.transaction.succeeded'
    | 'status.transaction.pending'
    | 'status.transaction.failed'
    | 'status.transaction.refunded',
) => string;

export function transactionStatusLabel(
  tx: BillingTransactionRow,
  t: TransactionStatusT,
): {
  label: string;
  tone: StatusTone;
} {
  switch (tx.status) {
    case 'SUCCEEDED':
      return { label: t('status.transaction.succeeded'), tone: 'success' };
    case 'PENDING':
      return { label: t('status.transaction.pending'), tone: 'warning' };
    case 'FAILED':
      return { label: t('status.transaction.failed'), tone: 'destructive' };
    case 'REFUNDED':
      return { label: t('status.transaction.refunded'), tone: 'muted' };
    default:
      return { label: tx.status, tone: 'muted' };
  }
}

export type MethodT = (key: 'method.STRIPE' | 'method.MANUAL' | 'method.BANK_TRANSFER') => string;

export function methodLabel(method: BillingTransactionRow['method'], t: MethodT): string {
  return t(`method.${method}`);
}

/** Percentage (0-100) of a cap consumed, or null when uncapped. */
export function usagePct(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}
