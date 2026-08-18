// One-off per Stripe environment (test, then live): creates the Product
// « Schoolgesti — Établissement Pro » with its two recurring, per-seat
// (licensed) Prices — monthly 0,60 $/élève and annual 6,48 $/élève (−10 %) —
// and prints the ids to paste into STRIPE_PRICE_ID_PRO /
// STRIPE_PRICE_ID_PRO_ANNUAL. Done by script rather than in the Dashboard so
// the amounts can never drift from src/lib/billing-plans.ts.
//
// Usage: pnpm stripe:setup-prices            (STRIPE_SECRET_KEY must be set)
//        pnpm stripe:setup-prices -- --annual-only   (STRIPE_PRICE_ID_PRO must exist)
//
// Idempotent enough: re-running creates a fresh Product+Prices (old ones stay,
// inactive prices are harmless) — copy the newest ids. Test and live data are
// partitioned in Stripe: run once per key.

import Stripe from 'stripe';
import { PLAN_LABELS, PRO_ANNUAL_RATE_CENTS, PRO_RATE_CENTS } from '../src/lib/billing-plans';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-07-29.dahlia';

interface Deps {
  stripe?: Stripe;
  log?: (line: string) => void;
}

export async function main(
  args: string[] = [],
  deps: Deps = {},
): Promise<{ monthly: string; annual: string }> {
  const log = deps.log ?? console.log;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!deps.stripe && !key) {
    throw new Error('STRIPE_SECRET_KEY absent de l’environnement (.env / .env.local).');
  }
  const stripe = deps.stripe ?? new Stripe(key!, { apiVersion: STRIPE_API_VERSION });
  const annualOnly = args.includes('--annual-only');

  let productId: string;
  let monthlyId: string;

  if (annualOnly) {
    const existing = process.env.STRIPE_PRICE_ID_PRO;
    if (!existing)
      throw new Error(
        '--annual-only exige STRIPE_PRICE_ID_PRO (le Price mensuel doit déjà exister).',
      );
    const monthly = await stripe.prices.retrieve(existing);
    productId = typeof monthly.product === 'string' ? monthly.product : monthly.product.id;
    monthlyId = monthly.id;
    log(`✓ Product réutilisé : ${productId}`);
  } else {
    const product = await stripe.products.create({
      name: `Schoolgesti — ${PLAN_LABELS.PRO}`,
      description:
        'Abonnement par élève au plan Établissement Pro (facturation mensuelle ou annuelle).',
      metadata: { planKey: 'PRO' },
    });
    productId = product.id;
    const monthly = await stripe.prices.create({
      product: productId,
      currency: 'usd',
      unit_amount: PRO_RATE_CENTS,
      recurring: { interval: 'month', usage_type: 'licensed' },
      nickname: `Pro — ${(PRO_RATE_CENTS / 100).toFixed(2)} $ / élève / mois`,
      metadata: { planKey: 'PRO', interval: 'MONTH' },
    });
    monthlyId = monthly.id;
    log(`✓ Product créé       : ${productId}`);
    log(`✓ Price mensuel créé : ${monthlyId}`);
  }

  const annual = await stripe.prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: PRO_ANNUAL_RATE_CENTS,
    recurring: { interval: 'year', usage_type: 'licensed' },
    nickname: `Pro — ${(PRO_ANNUAL_RATE_CENTS / 100).toFixed(2)} $ / élève / an (−10 %)`,
    metadata: { planKey: 'PRO', interval: 'YEAR' },
  });
  log(`✓ Price annuel créé  : ${annual.id}`);
  log('');
  log('Ajoute ces lignes dans frontend/.env.local (et dans les variables Vercel) :');
  log(`STRIPE_PRICE_ID_PRO=${monthlyId}`);
  log(`STRIPE_PRICE_ID_PRO_ANNUAL=${annual.id}`);
  return { monthly: monthlyId, annual: annual.id };
}

// CLI entrypoint guard — mirrors seed-subscription-plans.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
