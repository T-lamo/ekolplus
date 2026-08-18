// Fixture builder for the Stripe webhook route + provider tests. Builds a
// minimal Stripe.Event envelope around a data object and signs the exact
// bytes with the SDK's own `Stripe.webhooks.generateTestHeaderString()` —
// never a hand-rolled HMAC, so the fixture can't drift from
// `constructEvent`'s verification.
import Stripe from 'stripe';
import { NextRequest } from 'next/server';

export const STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test_secret';

export interface StripeFixtureOpts {
  type: string;
  object: Record<string, unknown>;
  eventId?: string;
  webhookSecret?: string;
  /** Unix seconds — override for replay-tolerance tests. */
  timestamp?: number;
}

export function stripeFixture(opts: StripeFixtureOpts): {
  rawBody: Buffer;
  headers: Record<string, string>;
  event: Record<string, unknown>;
} {
  const event = {
    id: opts.eventId ?? `evt_test_${opts.type.replace(/\W/g, '_')}`,
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: opts.type,
    data: { object: opts.object },
  };
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawBody.toString('utf8'),
    secret: opts.webhookSecret ?? STRIPE_TEST_WEBHOOK_SECRET,
    ...(opts.timestamp !== undefined ? { timestamp: opts.timestamp } : {}),
  });
  return {
    rawBody,
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    event,
  };
}

export function stripeFixtureRequest(opts: StripeFixtureOpts): {
  req: NextRequest;
  rawBody: Buffer;
  headers: Record<string, string>;
} {
  const { rawBody, headers } = stripeFixture(opts);
  // Same cast as bictorys-mock.ts: Buffer is a Uint8Array at runtime but TS'
  // BodyInit rejects it; the bytes are exactly what Stripe signed.
  const req = new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body: rawBody as unknown as BodyInit,
  });
  return { req, rawBody, headers };
}

// ── canned Stripe objects ────────────────────────────────────────────────

export function stripeSubscriptionObject(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'sub_test_001',
    object: 'subscription',
    customer: 'cus_test_001',
    status: 'active',
    cancel_at_period_end: false,
    created: now - 86_400,
    start_date: now - 86_400,
    trial_end: null,
    metadata: { schoolId: 'school_1' },
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test_001',
          object: 'subscription_item',
          quantity: 120,
          current_period_end: now + 29 * 86_400,
          current_period_start: now - 86_400,
          price: { id: 'price_pro_month', object: 'price', recurring: { interval: 'month' } },
        },
      ],
    },
    ...over,
  };
}

export function stripeInvoiceObject(over: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'in_test_001',
    object: 'invoice',
    number: 'SCHG-0001',
    customer: 'cus_test_001',
    status: 'paid',
    amount_paid: 7200,
    amount_due: 7200,
    total: 7200,
    currency: 'usd',
    created: now,
    period_start: now - 30 * 86_400,
    period_end: now,
    hosted_invoice_url: 'https://invoice.stripe.com/i/test',
    status_transitions: { paid_at: now },
    parent: {
      type: 'subscription_details',
      subscription_details: { subscription: 'sub_test_001', metadata: { schoolId: 'school_1' } },
    },
    lines: { object: 'list', data: [{ period: { start: now, end: now + 30 * 86_400 } }] },
    payments: {
      object: 'list',
      data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_test_001' } }],
    },
    ...over,
  };
}
