/**
 * Notification templates.
 *
 * Each project defines its own typed wrappers around `createNotification`.
 * The example below ships with the template — adapt it, replace it, or add
 * more (e.g. `firePaymentReceived`, `fireExportReady`). The pattern:
 *
 *   1. Build a `CreateNotificationInput` with a *deterministic* dedupeKey
 *      so the unique constraint enforces at-most-once delivery for that
 *      logical event (e.g. `payment-received:${orderId}` — never include
 *      a timestamp or random suffix).
 *   2. Pass the input + your PrismaClient to `createNotification`.
 *   3. Optionally enqueue an email via `EmailQueue.enqueue` — but ONLY
 *      after the notification row is created, so a duplicate event never
 *      sends a duplicate email.
 *
 * Keep these helpers free of side effects beyond the row insert; the
 * email enqueue belongs at the call site so each project can pick the
 * right channel (no email vs. transactional vs. marketing).
 */

import type { CreateNotificationInput } from './index';

export function welcomeNotification(userId: string, email: string): CreateNotificationInput {
  return {
    userId,
    type: 'WELCOME',
    title: 'Welcome!',
    body: `Glad to have you on board, ${email}.`,
    dedupeKey: `welcome:${userId}`,
  };
}

/**
 * SaaS billing — a Stripe renewal failed for the school (invoice.payment_failed).
 * Sent to every OWNER/ADMIN of the school from the Stripe webhook, inside
 * its transaction. dedupeKey = invoice id + user, so Stripe's retries of the
 * same event (or later payment attempts on the same invoice) never stack up
 * duplicate alerts. Customer-facing dunning emails stay Stripe's job.
 */
export function subscriptionPaymentFailed(
  userId: string,
  invoiceId: string,
  amountCents: number,
  invoiceUrl: string | null,
): CreateNotificationInput {
  const amount = (amountCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
  return {
    userId,
    type: 'SUBSCRIPTION_PAYMENT_FAILED',
    title: 'Paiement de l’abonnement refusé',
    body: `Le prélèvement de ${amount} $ pour votre abonnement Établissement Pro a échoué. Mettez à jour votre moyen de paiement pour conserver le plan — l’accès reste ouvert entre-temps.`,
    data: { invoiceId, amountCents, ...(invoiceUrl ? { invoiceUrl } : {}) },
    dedupeKey: `subscription-payment-failed:${invoiceId}:${userId}`,
  };
}

/**
 * Stripe `customer.subscription.trial_will_end` (3 days before the end of the
 * 30-day trial) → one heads-up per OWNER/ADMIN. Dedupe on the subscription id
 * so Stripe redeliveries never stack up. The customer email reminder itself is
 * Stripe's (Dashboard → Billing → emails), this is the in-app mirror.
 */
export function subscriptionTrialEnding(
  userId: string,
  subscriptionId: string,
  trialEndIso: string,
  estimateCents: number,
  studentCount: number,
): CreateNotificationInput {
  const date = new Date(trialEndIso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const amount = (estimateCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
  return {
    userId,
    type: 'SUBSCRIPTION_TRIAL_ENDING',
    title: 'Fin de votre essai Établissement Pro',
    body: `Votre essai gratuit se termine le ${date}. La première facture sera d’environ ${amount} $ pour ${studentCount} élève${studentCount > 1 ? 's' : ''}. Pour rester en Starter, rétrogradez avant cette date depuis la page Abonnement.`,
    data: { subscriptionId, trialEndIso, estimateCents, studentCount },
    dedupeKey: `subscription-trial-ending:${subscriptionId}:${userId}`,
  };
}

/**
 * Example: notification dispatched after a successful payment.
 * Called from the Bictorys webhook handler's `onPaid` post-commit hook.
 */
export function paymentReceived(
  userId: string,
  orderId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    body: `Order ${orderId} for ${amount} ${currency} confirmed.`,
    data: { orderId, amount, currency },
    dedupeKey: `payment-received:${orderId}`,
  };
}
