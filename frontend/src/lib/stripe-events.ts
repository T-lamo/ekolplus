// The Stripe event types this app subscribes to — one list shared by the
// webhook route (dispatch), the doctor script (audits the live endpoint) and
// the docs. No `server-only` here so `scripts/stripe-doctor.ts` can import it
// under plain Node.
export const STRIPE_HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
] as const;

export type StripeHandledEventType = (typeof STRIPE_HANDLED_EVENTS)[number];
