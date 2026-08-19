// Backfill: mirror every admin coupon that has no Stripe pair yet as a
// Stripe Coupon + Promotion Code, so the code can be typed on the hosted
// Checkout page. New coupons are mirrored by the admin API on creation; this
// script covers the rows created BEFORE that existed (migration
// 29_coupon_stripe_ids) and the rows left unsynced by a Stripe outage.
//
// Usage: pnpm stripe:sync-coupons                 (reads .env / .env.local)
//        pnpm stripe:sync-coupons -- --dry-run    (print, change nothing)
//        pnpm stripe:sync-coupons -- --live       (loads .env.production.local)
//
// Idempotent: rows that already hold a Promotion Code id are skipped; a
// coupon scoped to a plan that isn't billed via Stripe (Starter, Enterprise)
// is reported as "hors Stripe" and left alone. One failure never stops the
// run — every row is attempted, failures are listed and the exit code is 1.
//
// Runs with `--conditions=react-server` (see package.json) so the
// `server-only` guard on lib/server/billing/* resolves to its empty build —
// same modules as the API, no duplicated Stripe logic.

import { PrismaClient } from '@prisma/client';
import {
  COUPON_STRIPE_SELECT,
  isStripeRedeemablePlan,
  reconcileStripeCoupon,
  type CouponStripeView,
  type StripeCouponSyncResult,
} from '../src/lib/server/billing/coupons';
import { isStripeConfigured } from '../src/lib/server/billing/stripe-client';

export interface SyncOutcome {
  code: string;
  result: 'synced' | 'already' | 'not-redeemable' | 'dry-run' | 'failed';
  detail?: string;
}

export interface SyncSummary {
  outcomes: SyncOutcome[];
  synced: number;
  failed: number;
}

/** Injectable seams — the CLI wires the real Prisma client + reconcile. */
export interface Deps {
  prisma?: Pick<PrismaClient, 'coupon' | '$disconnect'>;
  reconcile?: (
    db: PrismaClient,
    after: CouponStripeView,
    before: CouponStripeView | null,
  ) => Promise<StripeCouponSyncResult>;
  stripeConfigured?: () => boolean;
  log?: (line: string) => void;
}

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

export async function main(args: string[] = [], deps: Deps = {}): Promise<SyncSummary> {
  const log = deps.log ?? console.log;
  const dryRun = args.includes('--dry-run');
  const configured = deps.stripeConfigured ?? isStripeConfigured;
  if (!configured()) {
    throw new Error('STRIPE_SECRET_KEY absent de l’environnement (.env / .env.local).');
  }
  const prisma = (deps.prisma ?? getPrisma()) as PrismaClient;
  const reconcile = deps.reconcile ?? reconcileStripeCoupon;

  const rows = await prisma.coupon.findMany({
    where: { stripePromotionCodeId: null },
    orderBy: { createdAt: 'asc' },
    select: COUPON_STRIPE_SELECT,
  });
  log(`${rows.length} coupon(s) sans code promo Stripe${dryRun ? ' (dry-run)' : ''}`);

  const outcomes: SyncOutcome[] = [];
  for (const row of rows) {
    if (!isStripeRedeemablePlan(row.plan?.key ?? null)) {
      outcomes.push({ code: row.code, result: 'not-redeemable', detail: row.plan?.key ?? '' });
      log(`  – ${row.code}: hors Stripe (plan ${row.plan?.key})`);
      continue;
    }
    if (dryRun) {
      outcomes.push({ code: row.code, result: 'dry-run' });
      log(`  · ${row.code}: serait créé sur Stripe`);
      continue;
    }
    try {
      const sync = await reconcile(prisma, row, null);
      if (!sync.stripePromotionCodeId) {
        // `skipped` can only mean Stripe went unconfigured mid-run.
        outcomes.push({ code: row.code, result: 'failed', detail: sync.action });
        log(`  ✗ ${row.code}: ${sync.action}`);
        continue;
      }
      await prisma.coupon.update({
        where: { id: row.id },
        data: {
          stripeCouponId: sync.stripeCouponId,
          stripePromotionCodeId: sync.stripePromotionCodeId,
        },
      });
      outcomes.push({ code: row.code, result: 'synced', detail: sync.stripePromotionCodeId });
      log(`  ✓ ${row.code}: ${sync.stripePromotionCodeId}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      outcomes.push({ code: row.code, result: 'failed', detail });
      log(`  ✗ ${row.code}: ${detail}`);
    }
  }

  const synced = outcomes.filter((o) => o.result === 'synced').length;
  const failed = outcomes.filter((o) => o.result === 'failed').length;
  log(`Terminé — ${synced} synchronisé(s), ${failed} échec(s).`);
  return { outcomes, synced, failed };
}

// CLI entrypoint guard — mirrors stripe-setup-prices.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then(async (summary) => {
      await prismaClient?.$disconnect();
      process.exit(summary.failed > 0 ? 1 : 0);
    })
    .catch(async (err) => {
      console.error(err instanceof Error ? err.message : err);
      await prismaClient?.$disconnect();
      process.exit(1);
    });
}
