// Stripe WebhookProvider — plugs Stripe events into the PROTECTED handler
// factory (webhook/handler.ts) exactly like webhook/bictorys.ts does.
//
//   • verifySignature → `stripe.webhooks.constructEvent()` over the RAW body
//     (timing-safe HMAC-SHA256 + 5-minute replay tolerance, done by the SDK —
//     never re-implemented by hand).
//   • externalId = event.id, eventType = event.type. Stripe guarantees
//     event.id is stable across retries, so WebhookLog's
//     @@unique([externalId, eventType]) is the natural dedup key.
//   • `kind` is a DISPATCH-SLOT selector, not a literal classification: the
//     factory only routes 'paid' | 'refunded' | 'failed' (anything else is
//     silently dropped), while Stripe emits a whole subscription lifecycle.
//     Every lifecycle event therefore rides the 'paid' slot and the route's
//     onPaid switches on `payload.type`; only invoice.payment_failed →
//     'failed' and charge.refunded → 'refunded' use their own slots.
import 'server-only';
import type Stripe from 'stripe';
import type { WebhookProvider } from './handler';
import { getStripe, getStripeWebhookSecret } from '@/lib/server/billing/stripe-client';

/** Every event type this app subscribes to (register exactly these in Stripe). */
export { STRIPE_HANDLED_EVENTS, type StripeHandledEventType } from '@/lib/stripe-events';

const PAID_SLOT: ReadonlySet<string> = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.paid',
]);

export function stripeEventKind(type: string): 'paid' | 'failed' | 'refunded' | 'other' {
  if (PAID_SLOT.has(type)) return 'paid';
  if (type === 'invoice.payment_failed') return 'failed';
  if (type === 'charge.refunded') return 'refunded';
  return 'other';
}

export const stripeWebhookProvider: WebhookProvider<Stripe.Event> = {
  name: 'stripe',

  verifySignature(rawBody, headers) {
    const signature = headers['stripe-signature'];
    if (!signature) return { valid: false, reason: 'missing stripe-signature header' };
    try {
      getStripe().webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : String(err) };
    }
  },

  parsePayload(rawBody) {
    // Signature already verified above over these exact bytes.
    const event = JSON.parse(rawBody.toString('utf8')) as Stripe.Event;
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') {
      throw new Error('not a Stripe event');
    }
    return event;
  },

  extractIds(event) {
    return { externalId: event.id, eventType: event.type, kind: stripeEventKind(event.type) };
  },
};
