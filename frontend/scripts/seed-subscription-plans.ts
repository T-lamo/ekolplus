// Bootstrap script. Seeds the 3 SubscriptionPlan catalog rows (Starter /
// Essentiel / Premium) the SaaS admin billing screens price schools against.
// See .planning/banani/epic-2-admin-foundation.md — a school's monthly
// amount is computed live as active enrollments × pricePerStudentCents.
//
// Usage: pnpm db:seed-plans
//
// Idempotent — upserts by the unique `key`. Prices are integer USD cents;
// re-running never overwrites a price edited via System Settings (update
// only fills name/sortOrder so a manual tarif change survives a re-seed).

import { PrismaClient } from '@prisma/client';

const PLANS = [
  { key: 'STARTER', name: 'Starter', pricePerStudentCents: 30, sortOrder: 1 },
  { key: 'ESSENTIEL', name: 'Essentiel', pricePerStudentCents: 50, sortOrder: 2 },
  { key: 'PREMIUM', name: 'Premium', pricePerStudentCents: 80, sortOrder: 3 },
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
