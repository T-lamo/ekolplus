// scripts/stripe-doctor — pre-launch audit of the Stripe account. Tests
// drive `runDoctor(env, { stripe })` with a hand-rolled Stripe stub (no
// network); the CLI guard keeps the auto-run inert under vitest.
import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import { formatReport, runDoctor, type DoctorEnv, type DoctorStripe } from './stripe-doctor';
import { PRO_ANNUAL_RATE_CENTS, PRO_RATE_CENTS } from '../src/lib/billing-plans';
import { STRIPE_HANDLED_EVENTS } from '../src/lib/stripe-events';

function price(over: Partial<Stripe.Price> & { id: string }): Stripe.Price {
  return {
    object: 'price',
    active: true,
    billing_scheme: 'per_unit',
    currency: 'usd',
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
    unit_amount: PRO_RATE_CENTS,
    ...over,
  } as unknown as Stripe.Price;
}

function stub(
  over: {
    account?: Partial<Stripe.Account>;
    prices?: Record<string, Stripe.Price>;
    portal?: Partial<Stripe.BillingPortal.Configuration>[];
    webhooks?: Partial<Stripe.WebhookEndpoint>[];
  } = {},
): DoctorStripe {
  const prices = over.prices ?? {
    price_month: price({ id: 'price_month' }),
    price_year: price({
      id: 'price_year',
      unit_amount: PRO_ANNUAL_RATE_CENTS,
      recurring: {
        interval: 'year',
        interval_count: 1,
        usage_type: 'licensed',
      } as Stripe.Price.Recurring,
    }),
  };
  return {
    accounts: {
      retrieve: async () =>
        ({
          id: 'acct_1',
          charges_enabled: true,
          payouts_enabled: true,
          country: 'FR',
          default_currency: 'eur',
          business_profile: { name: 'Schoolgesti' },
          settings: { payments: { statement_descriptor: 'SCHOOLGESTI' } },
          ...over.account,
        }) as unknown as Stripe.Account,
    },
    prices: {
      retrieve: async (id: string) => {
        const p = prices[id];
        if (!p) throw new Error(`No such price: '${id}'`);
        return p;
      },
    },
    billingPortal: {
      configurations: {
        list: async () => ({
          data: (over.portal ?? [
            {
              id: 'bpc_1',
              is_default: true,
              active: true,
              features: {
                payment_method_update: { enabled: true },
                invoice_history: { enabled: true },
                subscription_cancel: { enabled: true },
                subscription_update: { enabled: false },
              },
            },
          ]) as Stripe.BillingPortal.Configuration[],
        }),
      },
    },
    webhookEndpoints: {
      list: async () => ({
        data: (over.webhooks ?? [
          {
            id: 'we_1',
            url: 'https://app.schoolgesti.com/api/webhooks/stripe',
            status: 'enabled',
            enabled_events: [...STRIPE_HANDLED_EVENTS],
          },
        ]) as Stripe.WebhookEndpoint[],
      }),
    },
  };
}

const LIVE_ENV: DoctorEnv = {
  STRIPE_SECRET_KEY: 'rk_live_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_PRICE_ID_PRO: 'price_month',
  STRIPE_PRICE_ID_PRO_ANNUAL: 'price_year',
  APP_URL: 'https://app.schoolgesti.com',
  NEXT_PUBLIC_SALES_EMAIL: 'contact@schoolgesti.com',
  NEXT_PUBLIC_TERMS_URL: 'https://schoolgesti.com/cgu',
};

const byLabel = (r: Awaited<ReturnType<typeof runDoctor>>, needle: string) =>
  r.checks.find((c) => c.label.includes(needle));

describe('stripe-doctor', () => {
  it('no key: one blocker, nothing else audited', async () => {
    const r = await runDoctor({});
    expect(r).toMatchObject({ mode: 'unknown', blockers: 1 });
    expect(r.checks[0]?.label).toBe('STRIPE_SECRET_KEY');
  });

  it('fully configured live account: zero blockers, zero warnings', async () => {
    const r = await runDoctor(LIVE_ENV, { stripe: stub() });
    expect(r.mode).toBe('live');
    expect(r.checks.filter((c) => c.level === 'fail')).toEqual([]);
    expect(r.blockers).toBe(0);
    expect(r.warnings).toBe(0);
    expect(byLabel(r, 'Price mensuel')?.level).toBe('ok');
    expect(byLabel(r, 'Price annuel')?.level).toBe('ok');
    expect(byLabel(r, 'Portail client')?.level).toBe('ok');
    expect(byLabel(r, 'Webhook https://app.schoolgesti.com/api/webhooks/stripe')?.level).toBe('ok');
    expect(formatReport(r)).toMatch(/Prêt \(live\)/);
  });

  it('price amount drifted from billing-plans.ts → blocker naming both amounts', async () => {
    const r = await runDoctor(LIVE_ENV, {
      stripe: stub({
        prices: {
          price_month: price({ id: 'price_month', unit_amount: 50 }),
          price_year: price({
            id: 'price_year',
            unit_amount: PRO_ANNUAL_RATE_CENTS,
            recurring: {
              interval: 'year',
              interval_count: 1,
              usage_type: 'licensed',
            } as Stripe.Price.Recurring,
          }),
        },
      }),
    });
    const c = byLabel(r, 'Price mensuel');
    expect(c?.level).toBe('fail');
    expect(c?.detail).toMatch(/montant 50 ¢ \(attendu 60 ¢/);
    expect(r.blockers).toBe(1);
  });

  it('price id from the other environment (resource_missing) → blocker with the partition hint', async () => {
    const r = await runDoctor(
      { ...LIVE_ENV, STRIPE_PRICE_ID_PRO: 'price_from_test' },
      { stripe: stub() },
    );
    const c = byLabel(r, 'Price mensuel');
    expect(c?.level).toBe('fail');
    expect(c?.detail).toMatch(/partitionnés test\/live/);
  });

  it('missing annual Price is only a warning (toggle hidden), missing monthly is a blocker', async () => {
    const r = await runDoctor(
      { ...LIVE_ENV, STRIPE_PRICE_ID_PRO_ANNUAL: undefined },
      { stripe: stub() },
    );
    expect(byLabel(r, 'Price annuel')?.level).toBe('warn');
    const r2 = await runDoctor({ ...LIVE_ENV, STRIPE_PRICE_ID_PRO: undefined }, { stripe: stub() });
    expect(byLabel(r2, 'Price mensuel')?.level).toBe('fail');
  });

  it('portal with plan switching enabled → blocker (the app is the only plan UX)', async () => {
    const r = await runDoctor(LIVE_ENV, {
      stripe: stub({
        portal: [
          {
            id: 'bpc_1',
            is_default: true,
            active: true,
            features: {
              payment_method_update: { enabled: true },
              invoice_history: { enabled: true },
              subscription_cancel: { enabled: true },
              subscription_update: { enabled: true },
            } as Stripe.BillingPortal.Configuration.Features,
          },
        ],
      }),
    });
    const c = byLabel(r, 'Portail client');
    expect(c?.level).toBe('fail');
    expect(c?.detail).toMatch(/changement de plan ACTIVÉ/);
  });

  it('live without a webhook endpoint or secret → two blockers; test mode → warnings only', async () => {
    const live = await runDoctor(
      { ...LIVE_ENV, STRIPE_WEBHOOK_SECRET: undefined },
      { stripe: stub({ webhooks: [] }) },
    );
    expect(byLabel(live, 'Aucun endpoint webhook')?.level).toBe('fail');
    expect(byLabel(live, 'STRIPE_WEBHOOK_SECRET absent')?.level).toBe('fail');
    expect(live.blockers).toBe(2);

    const test = await runDoctor(
      { ...LIVE_ENV, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: undefined },
      { stripe: stub({ webhooks: [] }) },
    );
    expect(test.mode).toBe('test');
    expect(byLabel(test, 'Aucun endpoint webhook')?.level).toBe('warn');
    expect(byLabel(test, 'STRIPE_WEBHOOK_SECRET absent')?.level).toBe('warn');
    expect(test.blockers).toBe(0);
  });

  it('webhook endpoint missing events → blocker listing them; extra events → warning only', async () => {
    const r = await runDoctor(LIVE_ENV, {
      stripe: stub({
        webhooks: [
          {
            id: 'we_1',
            url: 'https://app.schoolgesti.com/api/webhooks/stripe',
            status: 'enabled',
            enabled_events: ['checkout.session.completed', 'invoice.paid'],
          },
        ],
      }),
    });
    const c = byLabel(r, 'Webhook https://');
    expect(c?.level).toBe('fail');
    expect(c?.detail).toMatch(/événements manquants : customer.subscription.created/);

    const r2 = await runDoctor(LIVE_ENV, {
      stripe: stub({
        webhooks: [
          {
            id: 'we_1',
            url: 'https://app.schoolgesti.com/api/webhooks/stripe',
            status: 'enabled',
            enabled_events: [...STRIPE_HANDLED_EVENTS, 'payment_intent.succeeded'],
          },
        ],
      }),
    });
    expect(byLabel(r2, 'Webhook https://')?.level).toBe('warn');
    expect(r2.blockers).toBe(0);
  });

  it('live account with charges disabled → blocker; full sk_live key → hint to use a restricted key', async () => {
    const r = await runDoctor(
      { ...LIVE_ENV, STRIPE_SECRET_KEY: 'sk_live_x' },
      { stripe: stub({ account: { charges_enabled: false } }) },
    );
    expect(byLabel(r, 'Encaissements NON activés')?.level).toBe('fail');
    expect(byLabel(r, 'Mode LIVE')?.detail).toMatch(/RESTREINTE/);
  });

  it('formatReport counts blockers and warnings', async () => {
    const r = await runDoctor(
      { ...LIVE_ENV, STRIPE_WEBHOOK_SECRET: undefined },
      { stripe: stub({ webhooks: [] }) },
    );
    expect(formatReport(r)).toMatch(/2 bloqueurs, 0 avertissement — corriger avant le lancement\./);
  });
});
