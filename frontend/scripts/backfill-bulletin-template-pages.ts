// One-off backfill: BulletinTemplateConfig gained `pages` (replacing the
// old flat `blocks` array) — normalizeConfig() already handles this at
// read time for every existing row, so this script is purely a cleanup
// pass that lets normalizeConfig's legacy branch be deleted someday.
// Idempotent: rows that already have `pages` are left untouched.
//
// Usage: pnpm db:backfill-bulletin-pages

import { PrismaClient } from '@prisma/client';
import { normalizeConfig } from '../src/lib/server/bulletin-templates';

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
      if ('pages' in config) continue;
      await prisma.bulletinTemplate.update({
        where: { id: row.id },
        data: { config: normalizeConfig(config) as object },
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
