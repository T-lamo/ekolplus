import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  STRIPE_TEST_WEBHOOK_SECRET,
  stripeFixture,
  stripeSubscriptionObject,
} from '@/test-utils/stripe-mock';

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', STRIPE_TEST_WEBHOOK_SECRET);
});

afterEach(async () => {
  const { __resetStripeClient } = await import('@/lib/server/billing/stripe-client');
  __resetStripeClient();
  vi.unstubAllEnvs();
});

describe('stripeWebhookProvider', () => {
  it('accepts a body signed by the SDK test helper', async () => {
    const { stripeWebhookProvider } = await import('./stripe');
    const { rawBody, headers } = stripeFixture({
      type: 'customer.subscription.updated',
      object: stripeSubscriptionObject(),
    });
    expect(stripeWebhookProvider.verifySignature(rawBody, headers)).toEqual({ valid: true });
  });

  it('rejects a tampered body', async () => {
    const { stripeWebhookProvider } = await import('./stripe');
    const { rawBody, headers } = stripeFixture({
      type: 'customer.subscription.updated',
      object: stripeSubscriptionObject(),
    });
    const tampered = Buffer.from(rawBody.toString('utf8').replace('"active"', '"canceled"'));
    const res = stripeWebhookProvider.verifySignature(tampered, headers);
    expect(res.valid).toBe(false);
  });

  it('rejects a missing stripe-signature header', async () => {
    const { stripeWebhookProvider } = await import('./stripe');
    const { rawBody } = stripeFixture({ type: 'invoice.paid', object: {} });
    const res = stripeWebhookProvider.verifySignature(rawBody, {});
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/stripe-signature/);
  });

  it('rejects a signature outside the replay tolerance (> 5 min old)', async () => {
    const { stripeWebhookProvider } = await import('./stripe');
    const { rawBody, headers } = stripeFixture({
      type: 'invoice.paid',
      object: {},
      timestamp: Math.floor(Date.now() / 1000) - 600,
    });
    expect(stripeWebhookProvider.verifySignature(rawBody, headers).valid).toBe(false);
  });

  it('extractIds uses event.id / event.type and maps kinds to dispatch slots', async () => {
    const { stripeWebhookProvider, stripeEventKind } = await import('./stripe');
    const { rawBody } = stripeFixture({
      type: 'invoice.payment_failed',
      object: {},
      eventId: 'evt_abc',
    });
    const event = stripeWebhookProvider.parsePayload(rawBody);
    expect(stripeWebhookProvider.extractIds(event)).toEqual({
      externalId: 'evt_abc',
      eventType: 'invoice.payment_failed',
      kind: 'failed',
    });
    expect(stripeEventKind('checkout.session.completed')).toBe('paid');
    expect(stripeEventKind('customer.subscription.deleted')).toBe('paid');
    expect(stripeEventKind('invoice.paid')).toBe('paid');
    expect(stripeEventKind('charge.refunded')).toBe('refunded');
    expect(stripeEventKind('payment_intent.created')).toBe('other');
  });

  it('parsePayload refuses a non-event JSON', async () => {
    const { stripeWebhookProvider } = await import('./stripe');
    expect(() => stripeWebhookProvider.parsePayload(Buffer.from('{"foo":1}'))).toThrow(
      /not a Stripe event/,
    );
  });
});
