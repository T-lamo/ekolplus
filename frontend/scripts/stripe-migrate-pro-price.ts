// Migrates existing Stripe subscriptions still on an old Pro Price to the
// current STRIPE_PRICE_ID_PRO / STRIPE_PRICE_ID_PRO_ANNUAL (matched by the
// item's recurring interval, quantity untouched). proration_behavior: 'none'
// so no mid-cycle credit is issued: the new rate simply applies from the
// next invoice. Idempotent: items already on a target Price are skipped, so
// re-running is always safe. Run once per Stripe environment after minting
// new Prices with stripe:setup-prices and updating the env vars.
//
// Usage: pnpm stripe:migrate-price          (test key, .env / .env.local)
//        pnpm stripe:migrate-price:live     (live key, + .env.production.local)

import Stripe from 'stripe';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-07-29.dahlia';

interface Deps {
  stripe?: Stripe;
  log?: (line: string) => void;
}

export async function main(
  _args: string[] = [],
  deps: Deps = {},
): Promise<{ migrated: number; alreadyCurrent: number }> {
  const log = deps.log ?? console.log;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!deps.stripe && !key) {
    throw new Error('STRIPE_SECRET_KEY absent de l’environnement (.env / .env.local).');
  }
  const targets: Partial<Record<Stripe.Price.Recurring.Interval, string>> = {};
  if (process.env.STRIPE_PRICE_ID_PRO) targets.month = process.env.STRIPE_PRICE_ID_PRO;
  if (process.env.STRIPE_PRICE_ID_PRO_ANNUAL) targets.year = process.env.STRIPE_PRICE_ID_PRO_ANNUAL;
  if (!targets.month) {
    throw new Error('STRIPE_PRICE_ID_PRO absent — lancer stripe:setup-prices d’abord.');
  }
  const stripe = deps.stripe ?? new Stripe(key!, { apiVersion: STRIPE_API_VERSION });

  let migrated = 0;
  let alreadyCurrent = 0;
  // Default list = every non-canceled subscription (trialing, active,
  // past_due, unpaid, paused) — exactly the set whose future invoices the
  // new rate must cover. Canceled subscriptions never invoice again.
  for await (const sub of stripe.subscriptions.list({ limit: 100 })) {
    for (const item of sub.items.data) {
      const price = item.price;
      // Pro items are matched by planKey metadata when present; Prices
      // minted before stripe-setup-prices stamped that metadata are matched
      // by shape instead (per-seat USD licensed recurring — the only kind
      // of subscription our checkout ever creates).
      const isPro =
        price.metadata['planKey'] === 'PRO' ||
        (price.currency === 'usd' && price.recurring?.usage_type === 'licensed');
      if (!isPro) continue;
      const interval = price.recurring?.interval;
      const target = interval ? targets[interval] : undefined;
      if (!target) continue;
      if (price.id === target) {
        alreadyCurrent += 1;
        continue;
      }
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price: target }],
        proration_behavior: 'none',
      });
      migrated += 1;
      log(`✓ ${sub.id} (${sub.status}, ${item.quantity ?? '?'} sièges) : ${price.id} → ${target}`);
    }
  }
  log(`${migrated} abonnement(s) migré(s), ${alreadyCurrent} déjà au tarif courant.`);
  return { migrated, alreadyCurrent };
}

// CLI entrypoint guard — mirrors stripe-setup-prices.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
