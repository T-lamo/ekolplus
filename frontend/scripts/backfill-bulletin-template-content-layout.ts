// One-off backfill: BulletinTemplateConfig gained `content`/`layout`
// sections after templates already existed (3 seeded globals + any school
// forks) — this merges the same defaults DEFAULT_BULLETIN_CONFIG now
// ships into every row missing them. Idempotent: rows that already have
// both keys are left untouched, so re-running is always safe.
//
// Usage: pnpm db:backfill-bulletin-content-layout

import { PrismaClient } from '@prisma/client';

// Mirrors DEFAULT_BULLETIN_CONFIG in src/lib/server/bulletin-templates.ts —
// duplicated for the same server-only reason as seed-bulletin-templates.ts.
const CONTENT_DEFAULT = { title: 'BULLETIN SCOLAIRE', footerMessage: null };
const LAYOUT_DEFAULT = { pageMargin: 20, blockSpacing: 10, borderWidth: 1, borderColor: '#f0eef8' };

interface RunDeps {
  prisma?: Pick<PrismaClient, 'bulletinTemplate' | '$disconnect'>;
}

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

export async function main(_args: string[] = [], deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    const rows = await prisma.bulletinTemplate.findMany({ select: { id: true, config: true } });
    let updated = 0;
    for (const row of rows) {
      const config = row.config as Record<string, unknown>;
      if ('content' in config && 'layout' in config) continue;
      await prisma.bulletinTemplate.update({
        where: { id: row.id },
        data: {
          config: {
            ...config,
            content: 'content' in config ? config.content : CONTENT_DEFAULT,
            layout: 'layout' in config ? config.layout : LAYOUT_DEFAULT,
          },
        },
      });
      updated++;
      console.log(`✓ Backfilled template ${row.id}`);
    }
    console.log(`Done — ${updated}/${rows.length} template(s) updated.`);
    return 0;
  } finally {
    if (!deps.prisma && prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
