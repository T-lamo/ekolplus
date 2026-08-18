// Lazy-initialized Stripe SDK client — same "absent env = inert, not a
// crash" philosophy as payments/provider-singleton.ts and redis.ts. Nothing
// reads process.env at import time, so `vi.stubEnv` works in tests and a
// deployment without Stripe keys still boots (the billing routes answer 503
// STRIPE_NOT_CONFIGURED, the cron no-ops).
//
// No CircuitBreaker on purpose: the Stripe SDK ships its own bounded retry
// (maxNetworkRetries) with idempotency keys, and every call here is either
// user-initiated (checkout/portal — one call per click) or a daily cron.
import 'server-only';
import Stripe from 'stripe';
import type { BillingIntervalKey } from '@/lib/billing-plans';

/**
 * Pinned API version — the SDK's own default for this major. Bump on
 * purpose (with the SDK), never let the account default drift under us:
 * Stripe moves fields between versions (e.g. Invoice.subscription →
 * invoice.parent.subscription_details, period end → subscription item).
 */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-07-29.dahlia';

export class StripeUnconfiguredError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Stripe not configured (${missing.join(', ')} missing or empty)`);
    this.name = 'StripeUnconfiguredError';
    this.missing = missing;
  }
}

let _client: Stripe | null = null;

/** Env presence report — the admin System Settings screen shows this. */
export function stripeConfigStatus(): {
  configured: boolean;
  mode: 'live' | 'test' | null;
  missing: string[];
} {
  const missing = (
    ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID_PRO'] as const
  ).filter((k) => !process.env[k]);
  const key = process.env.STRIPE_SECRET_KEY;
  return {
    configured: missing.length === 0,
    mode: key ? (key.startsWith('sk_live_') || key.startsWith('rk_live_') ? 'live' : 'test') : null,
    missing,
  };
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * The Stripe client. Throws `StripeUnconfiguredError` when STRIPE_SECRET_KEY
 * is missing — routes translate it to 503 STRIPE_NOT_CONFIGURED.
 */
export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeUnconfiguredError(['STRIPE_SECRET_KEY']);
  _client = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    appInfo: { name: 'Schoolgesti', url: 'https://schoolgesti.com' },
  });
  return _client;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeUnconfiguredError(['STRIPE_WEBHOOK_SECRET']);
  return secret;
}

/**
 * Price id of the Pro plan for an interval. Both Prices are created once per
 * environment by scripts/stripe-setup-prices.ts (test and live Stripe data
 * are fully partitioned — a `price_…` from test mode does not exist under a
 * live key).
 */
export function getStripePriceId(interval: BillingIntervalKey): string {
  const envKey = interval === 'YEAR' ? 'STRIPE_PRICE_ID_PRO_ANNUAL' : 'STRIPE_PRICE_ID_PRO';
  const id = process.env[envKey];
  if (!id) throw new StripeUnconfiguredError([envKey]);
  return id;
}

/** Whether the annual Price is configured (drives the Mensuel/Annuel toggle). */
export function isAnnualPriceConfigured(): boolean {
  return Boolean(process.env.STRIPE_PRICE_ID_PRO_ANNUAL);
}

/** Test-only — clears the cached client so `vi.stubEnv` can re-init. @internal */
export function __resetStripeClient(): void {
  _client = null;
}
