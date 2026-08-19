// Stripe billing of the schools' SaaS subscription (plan Établissement Pro).
//
// Not a `PaymentProvider` (payments/provider.ts) on purpose — that interface
// models one-shot charge/payout/refund; a recurring per-seat subscription is
// a different object. This module wraps the Stripe SDK for the four flows:
//
//   1. Checkout  — createCheckoutSession(): hosted Stripe Checkout, mode
//      subscription, quantity = the school's student count, `schoolId` in
//      BOTH session.metadata and subscription_data.metadata (Stripe copies
//      the latter onto the Subscription and every Invoice, so each webhook
//      carries the school regardless of delivery order).
//   2. Portal    — createPortalSession(): Stripe Customer Portal (card,
//      invoices, cancel).
//   3. In-app    — setCancelAtPeriodEnd() / changeInterval(): no redirect,
//      we update the Stripe Subscription and re-sync immediately.
//   4. Sync      — syncSubscriptionFromStripe() / recordInvoice() /
//      recordRefund(): the Stripe object is the source of truth; webhooks
//      and the daily cron (stripe-sync) both funnel through here, so a missed
//      webhook self-heals within a day.
//
// Everything takes a `Db` (PrismaClient or the webhook factory's tx client)
// so the webhook route can run the writes inside its Serializable tx.
import 'server-only';
import type Stripe from 'stripe';
import type {
  BillingInterval,
  BillingStatus,
  Prisma,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';
import { createLogger } from '@/lib/server/logger';
import { createNotification } from '@/lib/server/notifications';
import {
  subscriptionPaymentFailed,
  subscriptionTrialEnding,
} from '@/lib/server/notifications/templates';
import type { PrismaTransactionClient } from '@/lib/server/webhook/handler';
import { TRIAL_DAYS, type BillingIntervalKey } from '@/lib/billing-plans';
import { getStripe, getStripePriceId } from './stripe-client';

const log = createLogger();

export type Db = PrismaClient | PrismaTransactionClient;

/** Thrown when Stripe metadata is missing/foreign — the event is dropped. */
export class StripeCorrelationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeCorrelationError';
  }
}

/**
 * Thrown by createCheckoutSession when Stripe already holds an open
 * subscription for the school's Customer (the DB row may lag a missed
 * webhook — it is re-synced before throwing). Routes map it to 409.
 */
export class AlreadySubscribedError extends Error {
  constructor(public readonly stripeSubscriptionId: string) {
    super(`school already has an open Stripe subscription (${stripeSubscriptionId})`);
    this.name = 'AlreadySubscribedError';
  }
}

// ── status / interval mapping ────────────────────────────────────────────

/**
 * Stripe → our coarser enum. `past_due` stays ACTIVE ("never cut a paying
 * school" — Stripe's Smart Retries run for days; the raw status is kept in
 * `stripeStatus` so the UI can still warn). `unpaid`/`paused`/`incomplete`
 * suspend; `canceled`/`incomplete_expired` end the subscription — the school
 * then falls back to Starter (see effectivePlanKey()).
 */
export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'trialing':
      return 'TRIAL';
    case 'active':
    case 'past_due':
      return 'ACTIVE';
    case 'canceled':
      return 'CANCELED';
    case 'incomplete_expired':
      return 'EXPIRED';
    case 'unpaid':
    case 'paused':
    case 'incomplete':
    default:
      return 'SUSPENDED';
  }
}

export function mapStripeInterval(
  interval: Stripe.Price.Recurring.Interval | undefined,
): BillingInterval | null {
  if (interval === 'month') return 'MONTH';
  if (interval === 'year') return 'YEAR';
  return null;
}

/** Statuses under which the Stripe seat quantity is still worth syncing. */
export function isBillableStripeStatus(status: string | null | undefined): boolean {
  return status === 'trialing' || status === 'active' || status === 'past_due';
}

/**
 * Statuses that still occupy the school's single subscription slot on Stripe:
 * billable ones plus the on-hold ones (`unpaid` after dunning, `paused`,
 * `incomplete`). A second Checkout must be refused while one exists — the
 * school regularises through the Customer Portal instead of paying twice.
 */
export function isOpenStripeStatus(status: string | null | undefined): boolean {
  return (
    isBillableStripeStatus(status) ||
    status === 'unpaid' ||
    status === 'paused' ||
    status === 'incomplete'
  );
}

// ── customer ─────────────────────────────────────────────────────────────

/**
 * Stripe Customer of a school — created on first checkout, then reused. A
 * stored id that no longer resolves (typical when a DB seeded under test
 * keys is pointed at live keys — Stripe partitions test/live data) is
 * replaced transparently.
 */
export async function getOrCreateCustomer(
  db: Db,
  school: {
    id: string;
    name: string;
    stripeCustomerId: string | null;
    officialEmail: string | null;
  },
  fallbackEmail: string | null,
): Promise<string> {
  const stripe = getStripe();
  if (school.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(school.stripeCustomerId);
      if (!existing.deleted) return existing.id;
    } catch (err) {
      if (!isResourceMissing(err)) throw err;
      log.warn('stripe customer missing under current key — recreating', {
        schoolId: school.id,
        stripeCustomerId: school.stripeCustomerId,
      });
    }
  }
  const email = school.officialEmail ?? fallbackEmail;
  const customer = await stripe.customers.create({
    name: school.name,
    ...(email ? { email } : {}),
    metadata: { schoolId: school.id },
    preferred_locales: ['fr'],
  });
  await db.school.update({
    where: { id: school.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

function isResourceMissing(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'resource_missing'
  );
}

// ── checkout / portal ────────────────────────────────────────────────────

export interface CheckoutInput {
  schoolId: string;
  interval: BillingIntervalKey;
  appUrl: string;
  /** Email of the member starting the checkout (Customer email fallback). */
  requesterEmail: string | null;
}

/**
 * Hosted Stripe Checkout, subscription mode. No DB write here except the
 * Customer id — the Subscription row is born from the webhook, so an
 * abandoned checkout leaves nothing behind. The 30-day trial applies to the
 * school's FIRST Stripe subscription only.
 */
export async function createCheckoutSession(db: Db, input: CheckoutInput): Promise<string> {
  const stripe = getStripe();
  const school = await db.school.findUnique({
    where: { id: input.schoolId },
    select: {
      id: true,
      name: true,
      stripeCustomerId: true,
      officialEmail: true,
      subscription: { select: { stripeSubscriptionId: true } },
      _count: { select: { students: true } },
    },
  });
  if (!school) throw new StripeCorrelationError(`school ${input.schoolId} not found`);

  const customerId = await getOrCreateCustomer(db, school, input.requesterEmail);

  // Stripe-side guard (the DB guard in the route can lag a missed webhook,
  // and two tabs could race): one open subscription per Customer, ever.
  const open = await findOpenSubscription(customerId);
  if (open) {
    if (open.metadata?.schoolId === school.id) await syncSubscriptionFromStripe(db, open);
    throw new AlreadySubscribedError(open.id);
  }

  const quantity = Math.max(school._count.students, 1); // Stripe requires quantity ≥ 1
  const firstStripeSubscription = !school.subscription?.stripeSubscriptionId;
  const base = input.appUrl.replace(/\/$/, '');

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    customer_update: { name: 'auto', address: 'auto' },
    client_reference_id: school.id,
    line_items: [{ price: getStripePriceId(input.interval), quantity }],
    subscription_data: {
      metadata: { schoolId: school.id },
      ...(firstStripeSubscription ? { trial_period_days: TRIAL_DAYS } : {}),
    },
    metadata: { schoolId: school.id, interval: input.interval },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    locale: 'fr',
    success_url: `${base}/abonnement/paiement?etape=confirmation&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/abonnement/paiement?annule=1`,
  });
  if (!session.url) throw new Error('Stripe returned a Checkout Session without url');
  return session.url;
}

/** Stripe Customer Portal — card, invoices, cancel. Needs a Customer. */
export async function createPortalSession(customerId: string, appUrl: string): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl.replace(/\/$/, '')}/abonnement`,
    locale: 'fr',
  });
  return session.url;
}

// ── in-app subscription changes ──────────────────────────────────────────

/**
 * Cancel at period end (the school keeps Pro until the paid/trial period is
 * over, then reverts to Starter via the `customer.subscription.deleted`
 * webhook) — or undo a pending cancellation. Re-syncs immediately so the UI
 * reflects the change without waiting on the webhook.
 */
export async function setCancelAtPeriodEnd(
  db: Db,
  stripeSubscriptionId: string,
  cancel: boolean,
): Promise<void> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: cancel,
  });
  await syncSubscriptionFromStripe(db, sub);
}

/**
 * Switch monthly ↔ annual in place. A genuine price change — unlike the seat
 * sync (proration 'none') Stripe prorates the difference immediately.
 * `quantity` MUST be repeated: Stripe resets a changed item's quantity to 1
 * when it is omitted (caught in ekolplus: seats silently dropped to 1).
 */
export async function changeInterval(
  db: Db,
  stripeSubscriptionId: string,
  interval: BillingIntervalKey,
): Promise<void> {
  const stripe = getStripe();
  const current = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const item = current.items.data[0];
  if (!item) throw new Error(`Stripe subscription ${stripeSubscriptionId} has no item`);
  const sub = await stripe.subscriptions.update(stripeSubscriptionId, {
    items: [{ id: item.id, price: getStripePriceId(interval), quantity: item.quantity ?? 1 }],
    proration_behavior: 'create_prorations',
  });
  await syncSubscriptionFromStripe(db, sub);
}

/**
 * Align the billed seat quantity with the school's student count. Proration
 * 'none' → predictable monthly invoices, no surprise line for mid-month
 * enrolment churn. Returns the new quantity, or null when nothing changed.
 */
export async function syncSeatQuantity(
  db: Db,
  sub: {
    id: string;
    schoolId: string;
    stripeSubscriptionId: string;
    stripeSubscriptionItemId: string;
    billedSeats: number | null;
  },
): Promise<number | null> {
  const stripe = getStripe();
  const students = await db.student.count({ where: { schoolId: sub.schoolId } });
  const quantity = Math.max(students, 1);
  if (quantity === sub.billedSeats) return null;
  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    items: [{ id: sub.stripeSubscriptionItemId, quantity }],
    proration_behavior: 'none',
  });
  await db.subscription.update({ where: { id: sub.id }, data: { billedSeats: quantity } });
  return quantity;
}

// ── sync from Stripe (source of truth) ───────────────────────────────────

function unix(ts: number | null | undefined): Date | null {
  return typeof ts === 'number' ? new Date(ts * 1000) : null;
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

/**
 * Upsert our Subscription row from a Stripe Subscription. Called by every
 * customer.subscription.* webhook, checkout.session.completed, the in-app
 * actions above and the daily cron. Idempotent. Returns null when the
 * event cannot be correlated (no schoolId metadata) or is stale (a
 * cancellation for a subscription the school already replaced).
 */
export async function syncSubscriptionFromStripe(
  db: Db,
  sub: Stripe.Subscription,
): Promise<{ id: string; schoolId: string } | null> {
  const schoolId = sub.metadata?.schoolId;
  if (!schoolId) {
    log.warn('stripe subscription without schoolId metadata — ignored', {
      stripeSubscriptionId: sub.id,
    });
    return null;
  }
  const plan = await db.subscriptionPlan.findUnique({
    where: { key: 'PRO' },
    select: { id: true },
  });
  if (!plan) {
    // Catalogue not seeded — fail loudly so Stripe retries the webhook once
    // `pnpm db:seed-plans` has run, rather than silently losing the event.
    throw new Error('SubscriptionPlan PRO missing — run `pnpm db:seed-plans`');
  }

  const item = sub.items.data[0];
  const status = mapStripeStatus(sub.status);
  const renewsAt =
    unix(item?.current_period_end) ?? unix(sub.trial_end) ?? new Date(Date.now() + 30 * 86_400_000);
  const startedAt = unix(sub.start_date) ?? unix(sub.created) ?? new Date();
  const customerId = idOf(sub.customer);
  const stripeFields = {
    stripeSubscriptionId: sub.id,
    stripeSubscriptionItemId: item?.id ?? null,
    stripeStatus: sub.status,
    billingInterval: mapStripeInterval(item?.price.recurring?.interval),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    billedSeats: item?.quantity ?? null,
  };

  const existing = await db.subscription.findUnique({
    where: { schoolId },
    select: { id: true, status: true, stripeSubscriptionId: true, couponId: true },
  });

  // Stale-event guard: a school that canceled then re-subscribed has a NEW
  // Stripe subscription; a late `deleted`/`updated` for the old one must not
  // overwrite the live row.
  if (
    existing?.stripeSubscriptionId &&
    existing.stripeSubscriptionId !== sub.id &&
    (status === 'CANCELED' || status === 'EXPIRED')
  ) {
    log.info('stale stripe subscription event ignored', {
      schoolId,
      stripeSubscriptionId: sub.id,
      current: existing.stripeSubscriptionId,
    });
    return { id: existing.id, schoolId };
  }

  if (customerId) {
    await db.school.updateMany({
      where: {
        id: schoolId,
        OR: [{ stripeCustomerId: null }, { stripeCustomerId: { not: customerId } }],
      },
      data: { stripeCustomerId: customerId },
    });
  }

  // A code typed on Checkout (or a coupon applied from the Dashboard) shows
  // up as a Discount on the subscription — link it to the admin Coupon it
  // mirrors so the back-office « utilisations » and the school's estimate
  // stay honest. Set-only: a discount that has run its course disappears
  // from Stripe but the row keeps the coupon it redeemed.
  const redeemedCouponId = await resolveDiscountCouponId(db, sub);
  const couponFields =
    redeemedCouponId && redeemedCouponId !== existing?.couponId
      ? { couponId: redeemedCouponId }
      : {};
  if (couponFields.couponId) {
    await db.coupon.update({
      where: { id: couponFields.couponId },
      data: { usedCount: { increment: 1 } },
    });
  }

  if (!existing) {
    const created = await db.subscription.create({
      data: {
        schoolId,
        planId: plan.id,
        status,
        startedAt,
        renewsAt,
        trialEndsAt: unix(sub.trial_end),
        ...stripeFields,
        ...couponFields,
        statusChanges: { create: { fromStatus: null, toStatus: status } },
      },
      select: { id: true, schoolId: true },
    });
    return created;
  }

  await db.subscription.update({
    where: { id: existing.id },
    data: {
      planId: plan.id,
      status,
      renewsAt,
      trialEndsAt: unix(sub.trial_end),
      ...stripeFields,
      ...couponFields,
      ...(existing.status !== status
        ? { statusChanges: { create: { fromStatus: existing.status, toStatus: status } } }
        : {}),
    },
  });
  return { id: existing.id, schoolId };
}

/**
 * Our Coupon behind the subscription's first Stripe Discount, matched by
 * Promotion Code id (typed on Checkout) or Coupon id (applied by hand in
 * the Dashboard). Webhook payloads carry discounts as bare ids — one
 * expanded retrieve resolves them; no discount = no call.
 */
async function resolveDiscountCouponId(db: Db, sub: Stripe.Subscription): Promise<string | null> {
  const first = sub.discounts?.[0];
  if (!first) return null;
  let discount: Stripe.Discount;
  if (typeof first === 'string') {
    const expanded = await getStripe().subscriptions.retrieve(sub.id, { expand: ['discounts'] });
    const d = expanded.discounts?.[0];
    if (!d || typeof d === 'string') return null;
    discount = d;
  } else {
    discount = first;
  }
  const promotionCodeId = idOf(discount.promotion_code);
  const stripeCouponId = idOf(discount.source?.coupon);
  if (!promotionCodeId && !stripeCouponId) return null;
  const coupon = await db.coupon.findFirst({
    where: {
      OR: [
        ...(promotionCodeId ? [{ stripePromotionCodeId: promotionCodeId }] : []),
        ...(stripeCouponId ? [{ stripeCouponId }] : []),
      ],
    },
    select: { id: true },
  });
  return coupon?.id ?? null;
}

/**
 * Resolve the school an Invoice belongs to: subscription metadata (copied
 * from subscription_data.metadata) → our Subscription by Stripe id → School
 * by Customer id.
 */
async function resolveInvoiceSchool(
  db: Db,
  invoice: Stripe.Invoice,
): Promise<{ schoolId: string; subscriptionId: string | null } | null> {
  const details = invoice.parent?.subscription_details ?? null;
  const stripeSubscriptionId = idOf(details?.subscription);
  const metaSchoolId = details?.metadata?.schoolId ?? null;

  if (stripeSubscriptionId) {
    const sub = await db.subscription.findUnique({
      where: { stripeSubscriptionId },
      select: { id: true, schoolId: true },
    });
    if (sub) return { schoolId: sub.schoolId, subscriptionId: sub.id };
  }
  if (metaSchoolId) return { schoolId: metaSchoolId, subscriptionId: null };
  const customerId = idOf(invoice.customer as string | { id: string } | null);
  if (customerId) {
    const school = await db.school.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true, subscription: { select: { id: true } } },
    });
    if (school) return { schoolId: school.id, subscriptionId: school.subscription?.id ?? null };
  }
  return null;
}

/**
 * Upsert a BillingTransaction from an Invoice (invoice.paid → SUCCEEDED,
 * invoice.payment_failed → FAILED; a later successful retry flips the same
 * row back to SUCCEEDED because the key is the invoice id). Zero-amount
 * invoices (trial start) are skipped — nothing was billed.
 */
export async function recordInvoice(
  db: Db,
  invoice: Stripe.Invoice,
  status: Extract<BillingStatus, 'SUCCEEDED' | 'FAILED'>,
): Promise<{ id: string; schoolId: string } | null> {
  if (status === 'SUCCEEDED' && invoice.amount_paid === 0) return null;
  const target = await resolveInvoiceSchool(db, invoice);
  if (!target) {
    log.warn('stripe invoice could not be correlated to a school — ignored', {
      invoiceId: invoice.id,
    });
    return null;
  }
  const line = invoice.lines?.data?.[0];
  const periodStart = unix(line?.period?.start) ?? unix(invoice.period_start) ?? new Date();
  const paidAt = unix(invoice.status_transitions?.paid_at) ?? unix(invoice.created) ?? new Date();
  const payment = invoice.payments?.data?.[0]?.payment;
  const paymentIntentId = payment?.type === 'payment_intent' ? idOf(payment.payment_intent) : null;
  const amountCents = status === 'SUCCEEDED' ? invoice.amount_paid : invoice.amount_due;

  const data = {
    schoolId: target.schoolId,
    subscriptionId: target.subscriptionId,
    amountCents,
    method: 'STRIPE' as const,
    status,
    paidAt,
    periodStart,
    stripePaymentIntentId: paymentIntentId,
    stripeInvoiceUrl: invoice.hosted_invoice_url ?? null,
  };
  const row = await db.billingTransaction.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      reference: `STRIPE-${invoice.number ?? invoice.id}`,
      stripeInvoiceId: invoice.id,
      ...data,
    },
    update: data,
    select: { id: true, schoolId: true },
  });
  return row;
}

/**
 * Failed renewal: FAILED transaction + in-app notification to the school's
 * OWNER/ADMIN members (dedupeKey = invoice id, so Stripe retries never
 * double-notify). Customer-facing dunning EMAILS are Stripe's job — enable
 * "Send emails about failed payments" in Dashboard → Settings → Billing.
 */
export async function handleInvoicePaymentFailed(db: Db, invoice: Stripe.Invoice): Promise<void> {
  const row = await recordInvoice(db, invoice, 'FAILED');
  if (!row) return;
  const members = await db.organizationMember.findMany({
    where: { organization: { school: { id: row.schoolId } }, role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
  });
  for (const m of members) {
    await createNotification(
      // createNotification only uses `.notification.create` — the tx client is
      // structurally sufficient; the cast keeps the protected helper untouched.
      db as unknown as PrismaClient,
      subscriptionPaymentFailed(
        m.userId,
        invoice.id,
        invoice.amount_due,
        invoice.hosted_invoice_url ?? null,
      ),
    );
  }
}

/**
 * charge.refunded → mirror the admin refund convention: a REFUNDED row with
 * a negative amount pointing at the original (1:1, `-R` reference).
 * Correlation is Charge.payment_intent → BillingTransaction.stripePaymentIntentId,
 * with an API fallback (invoicePayments.list) when the paid webhook did not
 * carry the payment intent.
 */
export async function recordRefund(db: Db, charge: Stripe.Charge): Promise<boolean> {
  const paymentIntentId = idOf(charge.payment_intent);
  if (!paymentIntentId || charge.amount_refunded <= 0) return false;

  let original = await db.billingTransaction.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    include: { refund: { select: { id: true } } },
  });
  if (!original) {
    const payments = await getStripe().invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: paymentIntentId },
      limit: 1,
    });
    const invoiceId = idOf(payments.data[0]?.invoice as string | { id: string } | undefined);
    if (invoiceId) {
      original = await db.billingTransaction.findUnique({
        where: { stripeInvoiceId: invoiceId },
        include: { refund: { select: { id: true } } },
      });
    }
  }
  if (!original) {
    log.warn('stripe refund could not be correlated to a transaction — ignored', {
      chargeId: charge.id,
    });
    return false;
  }
  if (original.refund) return false; // already mirrored (partial-refund updates are ignored in V1)

  const data: Prisma.BillingTransactionUncheckedCreateInput = {
    reference: `${original.reference}-R`,
    schoolId: original.schoolId,
    subscriptionId: original.subscriptionId,
    amountCents: -charge.amount_refunded,
    method: 'STRIPE',
    status: 'REFUNDED',
    periodStart: original.periodStart,
    refundOfId: original.id,
  };
  await db.billingTransaction.create({ data });
  return true;
}

/**
 * Whether Stripe would currently let the school upgrade in place (i.e. an
 * active Stripe subscription exists to update) — used by the PATCH route.
 */
export function hasLiveStripeSubscription(sub: {
  stripeSubscriptionId: string | null;
  stripeStatus: string | null;
}): sub is { stripeSubscriptionId: string; stripeStatus: string } {
  // Open (billable OR on-hold) — an unpaid subscription is still the school's
  // subscription: it is regularised through the portal, never re-bought.
  return Boolean(sub.stripeSubscriptionId) && isOpenStripeStatus(sub.stripeStatus);
}

// ── single-subscription invariant ────────────────────────────────────────

/** The Customer's open (billable or on-hold) subscription, if any. */
export async function findOpenSubscription(
  customerId: string,
): Promise<Stripe.Subscription | null> {
  const list = await getStripe().subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 20,
  });
  return list.data.find((s) => isOpenStripeStatus(s.status)) ?? null;
}

/**
 * checkout.session.completed → adopt the subscription the school just paid
 * for. If the DB still points at a DIFFERENT open subscription (a race the
 * pre-checkout guards did not catch), the older one is canceled on Stripe
 * with proration so the school is never billed twice — newest wins. The
 * late `customer.subscription.deleted` of the old one is then ignored by the
 * stale-event guard in syncSubscriptionFromStripe(). Idempotent.
 */
export async function reconcileCheckoutSubscription(
  db: Db,
  sub: Stripe.Subscription,
): Promise<{ id: string; schoolId: string } | null> {
  const schoolId = sub.metadata?.schoolId;
  if (schoolId) {
    const existing = await db.subscription.findUnique({
      where: { schoolId },
      select: { stripeSubscriptionId: true, stripeStatus: true },
    });
    const old = existing?.stripeSubscriptionId;
    if (old && old !== sub.id && isOpenStripeStatus(existing.stripeStatus)) {
      try {
        await getStripe().subscriptions.cancel(old, { prorate: true });
        log.warn('duplicate stripe subscription — older one canceled', {
          schoolId,
          canceled: old,
          kept: sub.id,
        });
      } catch (err) {
        // Already canceled by a previous attempt / concurrent event — fine.
        log.warn('could not cancel superseded stripe subscription', {
          schoolId,
          stripeSubscriptionId: old,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return syncSubscriptionFromStripe(db, sub);
}

/**
 * customer.subscription.trial_will_end (T-3 days) → sync + one in-app
 * heads-up per OWNER/ADMIN with the date and the estimated first invoice
 * (quantity × unit amount of the live item, so annual is right too).
 */
export async function handleTrialWillEnd(db: Db, sub: Stripe.Subscription): Promise<void> {
  const synced = await syncSubscriptionFromStripe(db, sub);
  if (!synced || !sub.trial_end) return;
  const item = sub.items.data[0];
  const quantity = item?.quantity ?? 0;
  const estimateCents = quantity * (item?.price.unit_amount ?? 0);
  const members = await db.organizationMember.findMany({
    where: { organization: { school: { id: synced.schoolId } }, role: { in: ['OWNER', 'ADMIN'] } },
    select: { userId: true },
  });
  const trialEndIso = new Date(sub.trial_end * 1000).toISOString();
  for (const m of members) {
    await createNotification(
      db as unknown as PrismaClient,
      subscriptionTrialEnding(m.userId, sub.id, trialEndIso, estimateCents, quantity),
    );
  }
}

/**
 * Keep the Stripe Customer's email = the school's current OWNER (Stripe's
 * receipts / dunning / trial emails go there). Called by the daily cron;
 * returns true when an update was pushed.
 */
export async function syncCustomerEmail(
  db: Db,
  input: { schoolId: string; customerId: string },
): Promise<boolean> {
  const owner = await db.organizationMember.findFirst({
    where: { organization: { school: { id: input.schoolId } }, role: 'OWNER' },
    select: { user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const email = owner?.user.email;
  if (!email) return false;
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(input.customerId);
  if (customer.deleted || customer.email === email) return false;
  await stripe.customers.update(input.customerId, { email });
  log.info('stripe customer email realigned on the school owner', { schoolId: input.schoolId });
  return true;
}
