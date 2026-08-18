// Bootstrap script. Seeds the 3 SubscriptionPlan catalog rows (Starter /
// Établissement Pro / Enterprise) the SaaS admin billing screens price
// schools against — same tiers as the public landing (pricing-section.tsx)
// and src/lib/billing-plans.ts. A school's monthly amount is computed live
// as students × pricePerStudentCents.
//
// Usage: pnpm db:seed-plans
//
// Idempotent — upserts by the unique `key`. Prices are integer USD cents;
// re-running never overwrites a price edited via System Settings (update
// only fills name/sortOrder so a manual tarif change survives a re-seed).
//
// Environments seeded before migration 28_stripe_billing carried
// STARTER / ESSENTIEL / PREMIUM — that migration renames the rows in place
// (FK-safe), so this script never sees the old keys again.

import { PrismaClient } from '@prisma/client';
import { PLAN_LABELS, PRO_RATE_CENTS } from '../src/lib/billing-plans';

const PLANS = [
  { key: 'STARTER', name: PLAN_LABELS.STARTER, pricePerStudentCents: 0, sortOrder: 1 },
  { key: 'PRO', name: PLAN_LABELS.PRO, pricePerStudentCents: PRO_RATE_CENTS, sortOrder: 2 },
  // Enterprise is a manual quote — the indicative rate only feeds the admin
  // MRR estimate; it is never charged through Stripe.
  { key: 'ENTERPRISE', name: PLAN_LABELS.ENTERPRISE, pricePerStudentCents: 50, sortOrder: 3 },
] as const;

interface SeedDeps {
  prisma?: PrismaClient;
}

export async function main(_args: string[] = [], deps: SeedDeps = {}): Promise<void> {
  const prisma = deps.prisma ?? new PrismaClient();
  try {
    for (const plan of PLANS) {
      const row = await prisma.subscriptionPlan.upsert({
        where: { key: plan.key },
        update: { name: plan.name, sortOrder: plan.sortOrder },
        create: { ...plan, currency: 'USD', active: true },
        select: { key: true, name: true, pricePerStudentCents: true },
      });
      console.log(
        `✓ ${row.key} — ${row.name} ($${(row.pricePerStudentCents / 100).toFixed(2)}/élève/mois)`,
      );
    }
  } finally {
    if (!deps.prisma) {
      await prisma.$disconnect();
    }
  }
}

// CLI entrypoint guard — mirrors seed-dev.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
