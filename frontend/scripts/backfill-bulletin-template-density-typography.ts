// One-off backfill: BulletinTemplateConfig's `layout` and `typography`
// sections gained new required sub-keys (cellPaddingX/Y, tableLineHeight,
// borderStyle, showTableBackgrounds, tableHeader, noteValue, footer) after
// templates already existed — this merges the same defaults
// DEFAULT_BULLETIN_CONFIG now ships into any row missing them. Idempotent:
// rows that already have every new key are left untouched.
//
// Usage: pnpm db:backfill-bulletin-density-typography

import { PrismaClient } from '@prisma/client';

// Mirrors DEFAULT_BULLETIN_CONFIG in src/lib/server/bulletin-templates.ts —
// duplicated for the same server-only reason as seed-bulletin-templates.ts.
const LAYOUT_ADDITIONS = {
  borderStyle: 'solid',
  cellPaddingX: 6,
  cellPaddingY: 6,
  tableLineHeight: 1.4,
  showTableBackgrounds: false,
};
const TYPOGRAPHY_ADDITIONS = { tableHeader: 10, noteValue: 11, footer: 9 };

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
      const layout = (config.layout ?? {}) as Record<string, unknown>;
      const typography = (config.typography ?? {}) as Record<string, unknown>;
      const layoutMissing = Object.keys(LAYOUT_ADDITIONS).some((k) => !(k in layout));
      const typographyMissing = Object.keys(TYPOGRAPHY_ADDITIONS).some((k) => !(k in typography));
      if (!layoutMissing && !typographyMissing) continue;

      await prisma.bulletinTemplate.update({
        where: { id: row.id },
        data: {
          config: {
            ...config,
            layout: { ...LAYOUT_ADDITIONS, ...layout },
            typography: { ...TYPOGRAPHY_ADDITIONS, ...typography },
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
