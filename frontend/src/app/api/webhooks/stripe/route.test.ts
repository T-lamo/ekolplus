import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  STRIPE_TEST_WEBHOOK_SECRET,
  stripeFixtureRequest,
  stripeInvoiceObject,
  stripeSubscriptionObject,
} from '@/test-utils/stripe-mock';

// The route is a shim over the PROTECTED handler factory: these tests check
// the wiring (signature → dedup → dispatch slot → billing helper) with the
// billing helpers mocked, mirroring webhooks/bictorys/route.test.ts.
const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
  fn({ webhookLog: { findUnique, create, update } }),
);
vi.mock('@/lib/server/prisma', () => ({ prisma: { $transaction } }));

const syncSubscriptionFromStripe = vi.fn();
const reconcileCheckoutSubscription = vi.fn();
const handleTrialWillEnd = vi.fn();
const recordInvoice = vi.fn();
const handleInvoicePaymentFailed = vi.fn();
const recordRefund = vi.fn();
vi.mock('@/lib/server/billing/stripe', () => ({
  syncSubscriptionFromStripe,
  reconcileCheckoutSubscription,
  handleTrialWillEnd,
  recordInvoice,
  handleInvoicePaymentFailed,
  recordRefund,
}));

const subscriptionsRetrieve = vi.fn();
vi.mock('@/lib/server/billing/stripe-client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/server/billing/stripe-client')>();
  // constructEvent is what verifySignature calls — keep the real SDK helper.
  const { webhooks } = (await import('stripe')).default;
  return {
    ...mod,
    getStripe: () => ({ subscriptions: { retrieve: subscriptionsRetrieve }, webhooks }),
  };
});

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', STRIPE_TEST_WEBHOOK_SECRET);
  for (const m of [
    findUnique,
    create,
    update,
    syncSubscriptionFromStripe,
    reconcileCheckoutSubscription,
    handleTrialWillEnd,
    recordInvoice,
    handleInvoicePaymentFailed,
    recordRefund,
    subscriptionsRetrieve,
  ])
    m.mockReset();
  findUnique.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/webhooks/stripe', () => {
  it('valid signature + first delivery → 200 deduped:false, WebhookLog written with event.id/type', async () => {
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({
      type: 'customer.subscription.updated',
      object: stripeSubscriptionObject(),
      eventId: 'evt_1',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deduped: false });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'stripe',
          externalId: 'evt_1',
          eventType: 'customer.subscription.updated',
        }),
      }),
    );
    expect(syncSubscriptionFromStripe).toHaveBeenCalledTimes(1);
  });

  it('replay of the same event.id → deduped:true, no handler call', async () => {
    findUnique.mockResolvedValueOnce({ id: 'wl1', processedAt: new Date() });
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({
      type: 'customer.subscription.updated',
      object: stripeSubscriptionObject(),
      eventId: 'evt_1',
    });
    const res = await POST(req);
    expect(await res.json()).toEqual({ ok: true, deduped: true });
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it('tampered body → 401, nothing written', async () => {
    const { POST } = await import('./route');
    const { rawBody, headers } = stripeFixtureRequest({
      type: 'invoice.paid',
      object: stripeInvoiceObject(),
    });
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers,
      body: Buffer.from(rawBody.toString('utf8').replace('7200', '1')) as unknown as BodyInit,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('checkout.session.completed re-fetches the subscription and reconciles it (adopt + cancel a superseded one)', async () => {
    subscriptionsRetrieve.mockResolvedValueOnce(stripeSubscriptionObject({ metadata: {} }));
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({
      type: 'checkout.session.completed',
      object: {
        id: 'cs_1',
        object: 'checkout.session',
        mode: 'subscription',
        subscription: 'sub_test_001',
        metadata: { schoolId: 'school_1' },
      },
    });
    expect((await POST(req)).status).toBe(200);
    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_test_001');
    // The session's schoolId is patched onto the subscription when missing.
    const synced = reconcileCheckoutSubscription.mock.calls[0]![1] as {
      metadata: { schoolId: string };
    };
    expect(synced.metadata.schoolId).toBe('school_1');
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it('customer.subscription.trial_will_end → handleTrialWillEnd (sync + heads-up notifications)', async () => {
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({
      type: 'customer.subscription.trial_will_end',
      object: stripeSubscriptionObject({ status: 'trialing' }),
    });
    expect((await POST(req)).status).toBe(200);
    expect(handleTrialWillEnd).toHaveBeenCalledTimes(1);
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it('customer.subscription.deleted rides the paid slot → sync', async () => {
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({
      type: 'customer.subscription.deleted',
      object: stripeSubscriptionObject({ status: 'canceled' }),
    });
    await POST(req);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledTimes(1);
  });

  it('invoice.paid → recordInvoice SUCCEEDED', async () => {
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({ type: 'invoice.paid', object: stripeInvoiceObject() });
    await POST(req);
    expect(recordInvoice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'in_test_001' }),
      'SUCCEEDED',
    );
  });

  it('invoice.payment_failed → failed slot → handleInvoicePaymentFailed', async () => {
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({
      type: 'invoice.payment_failed',
      object: stripeInvoiceObject({ amount_paid: 0, status: 'open' }),
    });
    await POST(req);
    expect(handleInvoicePaymentFailed).toHaveBeenCalledTimes(1);
    expect(recordInvoice).not.toHaveBeenCalled();
  });

  it('charge.refunded → refunded slot → recordRefund', async () => {
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({
      type: 'charge.refunded',
      object: {
        id: 'ch_1',
        object: 'charge',
        payment_intent: 'pi_test_001',
        amount_refunded: 7200,
      },
    });
    await POST(req);
    expect(recordRefund).toHaveBeenCalledTimes(1);
  });

  it('an unhandled event type is logged for dedup but dispatched nowhere', async () => {
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({
      type: 'payment_intent.created',
      object: { id: 'pi_x' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalled();
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
    expect(recordInvoice).not.toHaveBeenCalled();
  });

  it('a transient failure (Serializable write conflict) is retried once → 200, helper ran twice', async () => {
    syncSubscriptionFromStripe.mockRejectedValueOnce(
      new Error(
        'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
      ),
    );
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({
      type: 'customer.subscription.created',
      object: stripeSubscriptionObject(),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledTimes(2);
    // Both attempts saw the same raw body (signature verified twice).
    expect($transaction).toHaveBeenCalledTimes(2);
  });

  it('a helper failing persistently → 500 after the single retry, so Stripe redelivers', async () => {
    syncSubscriptionFromStripe.mockRejectedValue(new Error('SubscriptionPlan PRO missing'));
    const { POST } = await import('./route');
    const { req } = stripeFixtureRequest({
      type: 'customer.subscription.created',
      object: stripeSubscriptionObject(),
    });
    expect((await POST(req)).status).toBe(500);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledTimes(2);
  });
});
