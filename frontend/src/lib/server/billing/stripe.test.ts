import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Stripe from 'stripe';
import { stripeInvoiceObject, stripeSubscriptionObject } from '@/test-utils/stripe-mock';

// The Stripe SDK is mocked at the module boundary — every test here is a
// pure DB-transition test over our sync helpers.
const subscriptionsUpdate = vi.fn();
const subscriptionsRetrieve = vi.fn();
const subscriptionsList = vi.fn();
const subscriptionsCancel = vi.fn();
const customersRetrieve = vi.fn();
const customersCreate = vi.fn();
const customersUpdate = vi.fn();
const checkoutCreate = vi.fn();
const portalCreate = vi.fn();
const invoicePaymentsList = vi.fn();

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    subscriptions: {
      update: subscriptionsUpdate,
      retrieve: subscriptionsRetrieve,
      list: subscriptionsList,
      cancel: subscriptionsCancel,
    },
    customers: { retrieve: customersRetrieve, create: customersCreate, update: customersUpdate },
    checkout: { sessions: { create: checkoutCreate } },
    billingPortal: { sessions: { create: portalCreate } },
    invoicePayments: { list: invoicePaymentsList },
  })),
}));

const notificationCreate = vi.fn();
vi.mock('@/lib/server/notifications', () => ({
  createNotification: vi.fn(async (_db: unknown, input: unknown) => notificationCreate(input)),
}));

// Loosely-typed mock factory: the helpers only need Prisma's *shape*, and
// the assertions read `.mock.calls` back through `arg()` — keeps the test
// free of `any` while not fighting vitest's tuple inference per call.
interface LooseMock {
  (...args: unknown[]): Promise<unknown>;
  mockResolvedValueOnce: (v: unknown) => LooseMock;
  mockRejectedValueOnce: (v: unknown) => LooseMock;
  mockClear: () => LooseMock;
  mock: { calls: unknown[][] };
}
const fn = (impl?: (...args: never[]) => unknown): LooseMock =>
  vi.fn(impl as (...args: unknown[]) => unknown) as unknown as LooseMock;
/** First argument of the n-th call, typed by the caller. */
function firstArg<T>(mock: LooseMock, call = 0): T {
  return mock.mock.calls[call]![0] as T;
}

function makeDb() {
  return {
    subscriptionPlan: { findUnique: fn(async () => ({ id: 'plan_pro' })) },
    subscription: {
      findUnique: fn(),
      create: fn(async (args: { data: { schoolId: string } }) => ({
        id: 'sub_row',
        schoolId: args.data.schoolId,
      })),
      update: fn(async () => ({})),
    },
    school: {
      updateMany: fn(async () => ({ count: 1 })),
      update: fn(async () => ({})),
      findUnique: fn(),
    },
    billingTransaction: {
      upsert: fn(async () => ({ id: 'tx_1', schoolId: 'school_1' })),
      findUnique: fn(),
      create: fn(async () => ({})),
    },
    organizationMember: {
      findMany: fn(async () => [{ userId: 'u_owner' }, { userId: 'u_admin' }]),
      findFirst: fn(async () => ({ user: { email: 'owner@etoiles.ht' } })),
    },
    student: { count: fn(async () => 130) },
  };
}

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
  vi.stubEnv('STRIPE_PRICE_ID_PRO', 'price_pro_month');
  vi.stubEnv('STRIPE_PRICE_ID_PRO_ANNUAL', 'price_pro_year');
  for (const m of [
    subscriptionsUpdate,
    subscriptionsRetrieve,
    subscriptionsList,
    subscriptionsCancel,
    customersRetrieve,
    customersCreate,
    customersUpdate,
    checkoutCreate,
    portalCreate,
    invoicePaymentsList,
    notificationCreate,
  ])
    m.mockReset();
  // No open subscription on the Customer unless a test says otherwise.
  subscriptionsList.mockResolvedValue({ data: [] });
});

afterEach(async () => {
  const { __resetStripeClient } = await import('./stripe-client');
  __resetStripeClient();
  vi.unstubAllEnvs();
});

describe('mapStripeStatus', () => {
  it('maps the Stripe lifecycle onto our enum (past_due stays ACTIVE)', async () => {
    const { mapStripeStatus } = await import('./stripe');
    expect(mapStripeStatus('trialing')).toBe('TRIAL');
    expect(mapStripeStatus('active')).toBe('ACTIVE');
    expect(mapStripeStatus('past_due')).toBe('ACTIVE');
    expect(mapStripeStatus('unpaid')).toBe('SUSPENDED');
    expect(mapStripeStatus('paused')).toBe('SUSPENDED');
    expect(mapStripeStatus('canceled')).toBe('CANCELED');
    expect(mapStripeStatus('incomplete_expired')).toBe('EXPIRED');
  });
});

describe('syncSubscriptionFromStripe', () => {
  it('creates the Subscription row (PRO, TRIAL) with Stripe linkage + first status change', async () => {
    const { syncSubscriptionFromStripe } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique.mockResolvedValueOnce(null);
    const sub = stripeSubscriptionObject({
      status: 'trialing',
      trial_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
    }) as unknown as Stripe.Subscription;

    const res = await syncSubscriptionFromStripe(db as never, sub);

    expect(res).toEqual({ id: 'sub_row', schoolId: 'school_1' });
    const data = firstArg<{ data: Record<string, unknown> }>(db.subscription.create).data;
    expect(data).toMatchObject({
      schoolId: 'school_1',
      planId: 'plan_pro',
      status: 'TRIAL',
      stripeSubscriptionId: 'sub_test_001',
      stripeSubscriptionItemId: 'si_test_001',
      stripeStatus: 'trialing',
      billingInterval: 'MONTH',
      cancelAtPeriodEnd: false,
      billedSeats: 120,
    });
    expect((data.statusChanges as { create: unknown }).create).toEqual({
      fromStatus: null,
      toStatus: 'TRIAL',
    });
    // Customer id is propagated onto the School.
    expect(db.school.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stripeCustomerId: 'cus_test_001' } }),
    );
  });

  it('updates an existing row and logs the status transition', async () => {
    const { syncSubscriptionFromStripe } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique.mockResolvedValueOnce({
      id: 'sub_row',
      status: 'TRIAL',
      stripeSubscriptionId: 'sub_test_001',
    });
    const sub = stripeSubscriptionObject({ status: 'active' }) as unknown as Stripe.Subscription;

    await syncSubscriptionFromStripe(db as never, sub);

    const arg = firstArg<{ data: Record<string, unknown> }>(db.subscription.update);
    expect(arg.data).toMatchObject({ status: 'ACTIVE', stripeStatus: 'active' });
    expect((arg.data.statusChanges as { create: unknown }).create).toEqual({
      fromStatus: 'TRIAL',
      toStatus: 'ACTIVE',
    });
  });

  it('does not log a status change when the status is unchanged', async () => {
    const { syncSubscriptionFromStripe } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique.mockResolvedValueOnce({
      id: 'sub_row',
      status: 'ACTIVE',
      stripeSubscriptionId: 'sub_test_001',
    });
    await syncSubscriptionFromStripe(
      db as never,
      stripeSubscriptionObject({ status: 'active' }) as unknown as Stripe.Subscription,
    );
    const arg = firstArg<{ data: Record<string, unknown> }>(db.subscription.update);
    expect(arg.data.statusChanges).toBeUndefined();
  });

  it('marks CANCELED on customer.subscription.deleted (school falls back to Starter)', async () => {
    const { syncSubscriptionFromStripe } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique.mockResolvedValueOnce({
      id: 'sub_row',
      status: 'ACTIVE',
      stripeSubscriptionId: 'sub_test_001',
    });
    await syncSubscriptionFromStripe(
      db as never,
      stripeSubscriptionObject({ status: 'canceled' }) as unknown as Stripe.Subscription,
    );
    const arg = firstArg<{ data: Record<string, unknown> }>(db.subscription.update);
    expect(arg.data.status).toBe('CANCELED');
  });

  it('ignores a stale cancellation for a subscription the school already replaced', async () => {
    const { syncSubscriptionFromStripe } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique.mockResolvedValueOnce({
      id: 'sub_row',
      status: 'ACTIVE',
      stripeSubscriptionId: 'sub_NEW',
    });
    await syncSubscriptionFromStripe(
      db as never,
      stripeSubscriptionObject({
        id: 'sub_OLD',
        status: 'canceled',
      }) as unknown as Stripe.Subscription,
    );
    expect(db.subscription.update).not.toHaveBeenCalled();
    expect(db.subscription.create).not.toHaveBeenCalled();
  });

  it('drops a subscription without schoolId metadata', async () => {
    const { syncSubscriptionFromStripe } = await import('./stripe');
    const db = makeDb();
    const res = await syncSubscriptionFromStripe(
      db as never,
      stripeSubscriptionObject({ metadata: {} }) as unknown as Stripe.Subscription,
    );
    expect(res).toBeNull();
    expect(db.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('throws when the PRO plan is not seeded (so Stripe retries the webhook)', async () => {
    const { syncSubscriptionFromStripe } = await import('./stripe');
    const db = makeDb();
    db.subscriptionPlan.findUnique.mockResolvedValueOnce(null);
    await expect(
      syncSubscriptionFromStripe(
        db as never,
        stripeSubscriptionObject() as unknown as Stripe.Subscription,
      ),
    ).rejects.toThrow(/db:seed-plans/);
  });
});

describe('recordInvoice', () => {
  it('upserts a SUCCEEDED STRIPE transaction keyed on the invoice id', async () => {
    const { recordInvoice } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique.mockResolvedValueOnce({ id: 'sub_row', schoolId: 'school_1' });
    await recordInvoice(
      db as never,
      stripeInvoiceObject() as unknown as Stripe.Invoice,
      'SUCCEEDED',
    );
    const arg = firstArg<{
      where: unknown;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }>(db.billingTransaction.upsert);
    expect(arg.where).toEqual({ stripeInvoiceId: 'in_test_001' });
    expect(arg.create).toMatchObject({
      reference: 'STRIPE-SCHG-0001',
      schoolId: 'school_1',
      subscriptionId: 'sub_row',
      amountCents: 7200,
      method: 'STRIPE',
      status: 'SUCCEEDED',
      stripePaymentIntentId: 'pi_test_001',
      stripeInvoiceUrl: 'https://invoice.stripe.com/i/test',
    });
    expect(arg.update.status).toBe('SUCCEEDED');
  });

  it('skips zero-amount paid invoices (trial start)', async () => {
    const { recordInvoice } = await import('./stripe');
    const db = makeDb();
    const res = await recordInvoice(
      db as never,
      stripeInvoiceObject({ amount_paid: 0, total: 0 }) as unknown as Stripe.Invoice,
      'SUCCEEDED',
    );
    expect(res).toBeNull();
    expect(db.billingTransaction.upsert).not.toHaveBeenCalled();
  });

  it('falls back to subscription metadata, then Customer id, to find the school', async () => {
    const { recordInvoice } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique.mockResolvedValueOnce(null); // unknown stripeSubscriptionId
    await recordInvoice(
      db as never,
      stripeInvoiceObject() as unknown as Stripe.Invoice,
      'SUCCEEDED',
    );
    const arg = firstArg<{
      create: Record<string, unknown>;
    }>(db.billingTransaction.upsert);
    expect(arg.create.schoolId).toBe('school_1'); // from parent.subscription_details.metadata

    const db2 = makeDb();
    db2.subscription.findUnique.mockResolvedValueOnce(null);
    db2.school.findUnique.mockResolvedValueOnce({ id: 'school_9', subscription: { id: 'sub_9' } });
    await recordInvoice(
      db2 as never,
      stripeInvoiceObject({
        parent: {
          type: 'subscription_details',
          subscription_details: { subscription: 'sub_x', metadata: {} },
        },
      }) as unknown as Stripe.Invoice,
      'SUCCEEDED',
    );
    const arg2 = firstArg<{
      create: Record<string, unknown>;
    }>(db2.billingTransaction.upsert);
    expect(arg2.create).toMatchObject({ schoolId: 'school_9', subscriptionId: 'sub_9' });
  });
});

describe('handleInvoicePaymentFailed', () => {
  it('records a FAILED transaction and notifies every OWNER/ADMIN once per invoice', async () => {
    const { handleInvoicePaymentFailed } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique.mockResolvedValueOnce({ id: 'sub_row', schoolId: 'school_1' });
    await handleInvoicePaymentFailed(
      db as never,
      stripeInvoiceObject({ amount_paid: 0, status: 'open' }) as unknown as Stripe.Invoice,
    );
    const arg = firstArg<{
      create: Record<string, unknown>;
    }>(db.billingTransaction.upsert);
    expect(arg.create).toMatchObject({ status: 'FAILED', amountCents: 7200 });
    expect(notificationCreate).toHaveBeenCalledTimes(2);
    expect(notificationCreate.mock.calls[0]![0]).toMatchObject({
      userId: 'u_owner',
      type: 'SUBSCRIPTION_PAYMENT_FAILED',
      dedupeKey: 'subscription-payment-failed:in_test_001:u_owner',
    });
  });
});

describe('recordRefund', () => {
  const charge = {
    id: 'ch_1',
    object: 'charge',
    payment_intent: 'pi_test_001',
    amount_refunded: 7200,
  } as unknown as Stripe.Charge;

  it('mirrors the admin refund convention (-R reference, negative amount, refundOfId)', async () => {
    const { recordRefund } = await import('./stripe');
    const db = makeDb();
    db.billingTransaction.findUnique.mockResolvedValueOnce({
      id: 'tx_1',
      reference: 'STRIPE-SCHG-0001',
      schoolId: 'school_1',
      subscriptionId: 'sub_row',
      periodStart: new Date('2026-08-01'),
      refund: null,
    });
    expect(await recordRefund(db as never, charge)).toBe(true);
    const arg = firstArg<{ data: Record<string, unknown> }>(db.billingTransaction.create);
    expect(arg.data).toMatchObject({
      reference: 'STRIPE-SCHG-0001-R',
      amountCents: -7200,
      method: 'STRIPE',
      status: 'REFUNDED',
      refundOfId: 'tx_1',
    });
  });

  it('is idempotent — a second refund event for the same charge does nothing', async () => {
    const { recordRefund } = await import('./stripe');
    const db = makeDb();
    db.billingTransaction.findUnique.mockResolvedValueOnce({
      id: 'tx_1',
      reference: 'STRIPE-SCHG-0001',
      refund: { id: 'tx_1_r' },
    });
    expect(await recordRefund(db as never, charge)).toBe(false);
    expect(db.billingTransaction.create).not.toHaveBeenCalled();
  });

  it('falls back to invoicePayments.list when the payment intent is unknown locally', async () => {
    const { recordRefund } = await import('./stripe');
    const db = makeDb();
    db.billingTransaction.findUnique
      .mockResolvedValueOnce(null) // by payment intent
      .mockResolvedValueOnce({
        id: 'tx_1',
        reference: 'STRIPE-SCHG-0001',
        schoolId: 'school_1',
        subscriptionId: null,
        periodStart: new Date(),
        refund: null,
      }); // by invoice id
    invoicePaymentsList.mockResolvedValueOnce({ data: [{ invoice: 'in_test_001' }] });
    expect(await recordRefund(db as never, charge)).toBe(true);
    expect(invoicePaymentsList).toHaveBeenCalledWith(
      expect.objectContaining({
        payment: { type: 'payment_intent', payment_intent: 'pi_test_001' },
      }),
    );
  });
});

describe('createCheckoutSession', () => {
  it('creates a subscription-mode session with schoolId metadata on both objects, quantity = students, 30-day trial on first subscription', async () => {
    const { createCheckoutSession } = await import('./stripe');
    const db = makeDb();
    db.school.findUnique.mockResolvedValueOnce({
      id: 'school_1',
      name: 'École Les Étoiles',
      stripeCustomerId: null,
      officialEmail: 'admin@etoiles.ht',
      subscription: null,
      _count: { students: 130 },
    });
    customersCreate.mockResolvedValueOnce({ id: 'cus_new' });
    checkoutCreate.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/c/pay/cs_test' });

    const url = await createCheckoutSession(db as never, {
      schoolId: 'school_1',
      interval: 'YEAR',
      appUrl: 'https://app.test/',
      requesterEmail: 'owner@etoiles.ht',
    });

    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_test');
    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@etoiles.ht', metadata: { schoolId: 'school_1' } }),
    );
    expect(db.school.update).toHaveBeenCalledWith({
      where: { id: 'school_1' },
      data: { stripeCustomerId: 'cus_new' },
    });
    const params = checkoutCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(params).toMatchObject({
      mode: 'subscription',
      customer: 'cus_new',
      line_items: [{ price: 'price_pro_year', quantity: 130 }],
      metadata: { schoolId: 'school_1', interval: 'YEAR' },
      subscription_data: { metadata: { schoolId: 'school_1' }, trial_period_days: 30 },
      allow_promotion_codes: true,
      success_url:
        'https://app.test/abonnement/paiement?etape=confirmation&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://app.test/abonnement/paiement?annule=1',
    });
  });

  it('reuses an existing Customer and skips the trial for a re-subscribing school', async () => {
    const { createCheckoutSession } = await import('./stripe');
    const db = makeDb();
    db.school.findUnique.mockResolvedValueOnce({
      id: 'school_1',
      name: 'École',
      stripeCustomerId: 'cus_old',
      officialEmail: null,
      subscription: { stripeSubscriptionId: 'sub_gone' },
      _count: { students: 0 },
    });
    customersRetrieve.mockResolvedValueOnce({ id: 'cus_old', deleted: false });
    checkoutCreate.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/x' });
    await createCheckoutSession(db as never, {
      schoolId: 'school_1',
      interval: 'MONTH',
      appUrl: 'https://app.test',
      requesterEmail: null,
    });
    expect(customersCreate).not.toHaveBeenCalled();
    const params = checkoutCreate.mock.calls[0]![0] as {
      line_items: unknown;
      subscription_data: Record<string, unknown>;
    };
    expect(params.line_items).toEqual([{ price: 'price_pro_month', quantity: 1 }]); // Stripe needs ≥ 1
    expect(params.subscription_data.trial_period_days).toBeUndefined();
  });

  it('recreates the Customer when the stored id is missing under the current key', async () => {
    const { createCheckoutSession } = await import('./stripe');
    const db = makeDb();
    db.school.findUnique.mockResolvedValueOnce({
      id: 'school_1',
      name: 'École',
      stripeCustomerId: 'cus_from_test_mode',
      officialEmail: null,
      subscription: null,
      _count: { students: 3 },
    });
    customersRetrieve.mockRejectedValueOnce(
      Object.assign(new Error('No such customer'), { code: 'resource_missing' }),
    );
    customersCreate.mockResolvedValueOnce({ id: 'cus_live' });
    checkoutCreate.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/y' });
    await createCheckoutSession(db as never, {
      schoolId: 'school_1',
      interval: 'MONTH',
      appUrl: 'https://app.test',
      requesterEmail: 'o@x.ht',
    });
    expect(customersCreate).toHaveBeenCalled();
    expect((checkoutCreate.mock.calls[0]![0] as { customer: string }).customer).toBe('cus_live');
  });
});

describe('createCheckoutSession — single-subscription invariant', () => {
  it('refuses (AlreadySubscribedError) when Stripe already holds an open subscription for the Customer, and re-syncs it', async () => {
    const { createCheckoutSession, AlreadySubscribedError } = await import('./stripe');
    const db = makeDb();
    db.school.findUnique.mockResolvedValueOnce({
      id: 'school_1',
      name: 'École Les Étoiles',
      stripeCustomerId: 'cus_1',
      officialEmail: null,
      subscription: { stripeSubscriptionId: null }, // DB lagged the webhook
      _count: { students: 40 },
    });
    customersRetrieve.mockResolvedValueOnce({ id: 'cus_1', deleted: false });
    subscriptionsList.mockResolvedValueOnce({
      data: [
        { ...stripeSubscriptionObject({ id: 'sub_old_canceled', status: 'canceled' }) },
        { ...stripeSubscriptionObject({ id: 'sub_open', status: 'unpaid' }) },
      ],
    });
    db.subscription.findUnique.mockResolvedValueOnce(null);
    await expect(
      createCheckoutSession(db as never, {
        schoolId: 'school_1',
        interval: 'MONTH',
        appUrl: 'https://app.test',
        requesterEmail: 'owner@etoiles.ht',
      }),
    ).rejects.toBeInstanceOf(AlreadySubscribedError);
    expect(checkoutCreate).not.toHaveBeenCalled();
    // The unpaid subscription was written back into the DB (self-healing).
    expect(db.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stripeSubscriptionId: 'sub_open', status: 'SUSPENDED' }),
      }),
    );
  });
});

describe('reconcileCheckoutSubscription', () => {
  it('cancels a superseded open subscription (prorated) then syncs the new one — newest wins', async () => {
    const { reconcileCheckoutSubscription } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique
      .mockResolvedValueOnce({ stripeSubscriptionId: 'sub_old', stripeStatus: 'active' }) // reconcile read
      .mockResolvedValueOnce({ id: 'row_1', status: 'ACTIVE', stripeSubscriptionId: 'sub_old' }); // sync read
    subscriptionsCancel.mockResolvedValueOnce({ id: 'sub_old', status: 'canceled' });
    await reconcileCheckoutSubscription(
      db as never,
      stripeSubscriptionObject({ id: 'sub_new' }) as never,
    );
    expect(subscriptionsCancel).toHaveBeenCalledWith('sub_old', { prorate: true });
    expect(db.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stripeSubscriptionId: 'sub_new' }),
      }),
    );
  });

  it('is a plain sync when the DB already points at this subscription or at an ended one', async () => {
    const { reconcileCheckoutSubscription } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique
      .mockResolvedValueOnce({ stripeSubscriptionId: 'sub_old', stripeStatus: 'canceled' })
      .mockResolvedValueOnce({ id: 'row_1', status: 'CANCELED', stripeSubscriptionId: 'sub_old' });
    await reconcileCheckoutSubscription(
      db as never,
      stripeSubscriptionObject({ id: 'sub_new' }) as never,
    );
    expect(subscriptionsCancel).not.toHaveBeenCalled();
    expect(db.subscription.update).toHaveBeenCalled();
  });

  it('survives an already-canceled superseded subscription (idempotent retry)', async () => {
    const { reconcileCheckoutSubscription } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique
      .mockResolvedValueOnce({ stripeSubscriptionId: 'sub_old', stripeStatus: 'active' })
      .mockResolvedValueOnce({ id: 'row_1', status: 'ACTIVE', stripeSubscriptionId: 'sub_old' });
    subscriptionsCancel.mockRejectedValueOnce(
      new Error('This subscription has already been canceled'),
    );
    await expect(
      reconcileCheckoutSubscription(
        db as never,
        stripeSubscriptionObject({ id: 'sub_new' }) as never,
      ),
    ).resolves.toEqual({ id: 'row_1', schoolId: 'school_1' });
  });
});

describe('handleTrialWillEnd', () => {
  it('syncs then notifies every OWNER/ADMIN once with the date and the estimated first invoice', async () => {
    const { handleTrialWillEnd } = await import('./stripe');
    const db = makeDb();
    db.subscription.findUnique.mockResolvedValueOnce({
      id: 'row_1',
      status: 'TRIAL',
      stripeSubscriptionId: 'sub_1',
    });
    const trialEnd = Math.floor(new Date('2026-09-17T00:00:00Z').getTime() / 1000);
    await handleTrialWillEnd(
      db as never,
      stripeSubscriptionObject({
        id: 'sub_1',
        status: 'trialing',
        trial_end: trialEnd,
        items: {
          object: 'list',
          data: [
            {
              id: 'si_1',
              quantity: 42,
              current_period_end: trialEnd,
              price: { id: 'price_pro_month', unit_amount: 60, recurring: { interval: 'month' } },
            },
          ],
        },
      }) as never,
    );
    expect(notificationCreate).toHaveBeenCalledTimes(2);
    const input = notificationCreate.mock.calls[0]![0] as {
      type: string;
      dedupeKey: string;
      data: Record<string, unknown>;
    };
    expect(input.type).toBe('SUBSCRIPTION_TRIAL_ENDING');
    expect(input.dedupeKey).toBe('subscription-trial-ending:sub_1:u_owner');
    expect(input.data).toMatchObject({ studentCount: 42, estimateCents: 42 * 60 });
  });

  it('does nothing without a trial_end (defensive) or without a school', async () => {
    const { handleTrialWillEnd } = await import('./stripe');
    const db = makeDb();
    await handleTrialWillEnd(
      db as never,
      stripeSubscriptionObject({ id: 'sub_x', metadata: {} }) as never,
    );
    expect(notificationCreate).not.toHaveBeenCalled();
  });
});

describe('syncCustomerEmail', () => {
  it('pushes the OWNER email to the Customer when it differs, no-op otherwise', async () => {
    const { syncCustomerEmail } = await import('./stripe');
    const db = makeDb();
    customersRetrieve.mockResolvedValueOnce({
      id: 'cus_1',
      deleted: false,
      email: 'old@etoiles.ht',
    });
    expect(
      await syncCustomerEmail(db as never, { schoolId: 'school_1', customerId: 'cus_1' }),
    ).toBe(true);
    expect(customersUpdate).toHaveBeenCalledWith('cus_1', { email: 'owner@etoiles.ht' });
    customersRetrieve.mockResolvedValueOnce({
      id: 'cus_1',
      deleted: false,
      email: 'owner@etoiles.ht',
    });
    expect(
      await syncCustomerEmail(db as never, { schoolId: 'school_1', customerId: 'cus_1' }),
    ).toBe(false);
    expect(customersUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('changeInterval / setCancelAtPeriodEnd / syncSeatQuantity', () => {
  it('changeInterval repeats the quantity and prorates', async () => {
    const { changeInterval } = await import('./stripe');
    const db = makeDb();
    subscriptionsRetrieve.mockResolvedValueOnce(stripeSubscriptionObject());
    subscriptionsUpdate.mockResolvedValueOnce(
      stripeSubscriptionObject({
        items: {
          data: [{ id: 'si_test_001', quantity: 120, price: { recurring: { interval: 'year' } } }],
        },
      }),
    );
    db.subscription.findUnique.mockResolvedValueOnce({
      id: 'sub_row',
      status: 'ACTIVE',
      stripeSubscriptionId: 'sub_test_001',
    });
    await changeInterval(db as never, 'sub_test_001', 'YEAR');
    expect(subscriptionsUpdate).toHaveBeenCalledWith('sub_test_001', {
      items: [{ id: 'si_test_001', price: 'price_pro_year', quantity: 120 }],
      proration_behavior: 'create_prorations',
    });
    const arg = firstArg<{ data: Record<string, unknown> }>(db.subscription.update);
    expect(arg.data.billingInterval).toBe('YEAR');
  });

  it('setCancelAtPeriodEnd flips the flag on Stripe and re-syncs the row', async () => {
    const { setCancelAtPeriodEnd } = await import('./stripe');
    const db = makeDb();
    subscriptionsUpdate.mockResolvedValueOnce(
      stripeSubscriptionObject({ cancel_at_period_end: true }),
    );
    db.subscription.findUnique.mockResolvedValueOnce({
      id: 'sub_row',
      status: 'ACTIVE',
      stripeSubscriptionId: 'sub_test_001',
    });
    await setCancelAtPeriodEnd(db as never, 'sub_test_001', true);
    expect(subscriptionsUpdate).toHaveBeenCalledWith('sub_test_001', {
      cancel_at_period_end: true,
    });
    const arg = firstArg<{ data: Record<string, unknown> }>(db.subscription.update);
    expect(arg.data.cancelAtPeriodEnd).toBe(true);
  });

  it('syncSeatQuantity updates Stripe with proration none only when the count changed', async () => {
    const { syncSeatQuantity } = await import('./stripe');
    const db = makeDb(); // student.count → 130
    const row = {
      id: 'sub_row',
      schoolId: 'school_1',
      stripeSubscriptionId: 'sub_test_001',
      stripeSubscriptionItemId: 'si_test_001',
      billedSeats: 120,
    };
    expect(await syncSeatQuantity(db as never, row)).toBe(130);
    expect(subscriptionsUpdate).toHaveBeenCalledWith('sub_test_001', {
      items: [{ id: 'si_test_001', quantity: 130 }],
      proration_behavior: 'none',
    });
    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_row' },
      data: { billedSeats: 130 },
    });

    subscriptionsUpdate.mockClear();
    expect(await syncSeatQuantity(db as never, { ...row, billedSeats: 130 })).toBeNull();
    expect(subscriptionsUpdate).not.toHaveBeenCalled();
  });
});
