// Status pills for the SaaS admin screens — one tone per status, shared by
// all 8 Epic-2 pages so the same status never renders two different colors.
// Sibling of school/fees/badges.tsx (same visual contract via ui/Badge).
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { ADMIN_SAAS } from '@/lib/constants';

export type SubscriptionDisplayStatus = keyof typeof ADMIN_SAAS.subscriptionStatus;

const SUBSCRIPTION_TONE: Record<SubscriptionDisplayStatus, BadgeTone> = {
  TRIAL: 'primary',
  ACTIVE: 'success',
  EXPIRED: 'destructive',
  SUSPENDED: 'destructive',
  CANCELED: 'muted',
  NONE: 'muted',
};

export function SubscriptionStatusBadge({
  status,
  expiringSoon = false,
}: {
  status: SubscriptionDisplayStatus;
  expiringSoon?: boolean;
}) {
  if (status === 'ACTIVE' && expiringSoon) {
    return <Badge tone="warning">{ADMIN_SAAS.expiringSoon}</Badge>;
  }
  return <Badge tone={SUBSCRIPTION_TONE[status]}>{ADMIN_SAAS.subscriptionStatus[status]}</Badge>;
}

export type TransactionDisplayStatus = keyof typeof ADMIN_SAAS.transactionStatus;

const TRANSACTION_TONE: Record<TransactionDisplayStatus, BadgeTone> = {
  SUCCEEDED: 'success',
  PENDING: 'warning',
  FAILED: 'destructive',
  REFUNDED: 'muted',
};

export function TransactionStatusBadge({ status }: { status: TransactionDisplayStatus }) {
  return <Badge tone={TRANSACTION_TONE[status]}>{ADMIN_SAAS.transactionStatus[status]}</Badge>;
}

export type CouponDisplayStatus = keyof typeof ADMIN_SAAS.couponStatus;

const COUPON_TONE: Record<CouponDisplayStatus, BadgeTone> = {
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXHAUSTED: 'muted',
  EXPIRED: 'destructive',
  INACTIVE: 'muted',
};

export function CouponStatusBadge({ status }: { status: CouponDisplayStatus }) {
  return <Badge tone={COUPON_TONE[status]}>{ADMIN_SAAS.couponStatus[status]}</Badge>;
}

export function UserStatusBadge({ status }: { status: 'ACTIVE' | 'SUSPENDED' }) {
  return (
    <Badge tone={status === 'ACTIVE' ? 'success' : 'destructive'}>
      {ADMIN_SAAS.userStatus[status]}
    </Badge>
  );
}

/** "⭐ Premium" plan chip — plain text + emoji, not a status color. */
export function PlanBadge({ planKey, name }: { planKey: string; name: string }) {
  const emoji = ADMIN_SAAS.planEmoji[planKey];
  return (
    <span className="inline-flex items-center gap-1 text-caption font-semibold whitespace-nowrap text-foreground">
      {emoji && <span aria-hidden>{emoji}</span>}
      {name}
    </span>
  );
}
