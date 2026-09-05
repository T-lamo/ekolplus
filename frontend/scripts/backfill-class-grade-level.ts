// One-off backfill: for every Class without a gradeLevelId, link it to the
// GradeLevel of the same school whose name matches its free-text `level`
// exactly. No match → left null (the class's level string doesn't correspond
// to any catalog entry — nothing to link it to). Idempotent: classes that
// already have a gradeLevelId are left untouched, so re-running is safe.
// See docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md §8/§13.
//
// Usage: pnpm db:backfill-class-grade-level

import { PrismaClient } from '@prisma/client';

interface RunDeps {
  prisma?: Pick<PrismaClient, 'class' | 'gradeLevel' | '$disconnect'>;
}

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

export async function main(_args: string[] = [], deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    const classes = await prisma.class.findMany({
      where: { gradeLevelId: null },
      select: { id: true, schoolId: true, level: true },
    });
    let linked = 0;
    for (const cls of classes) {
      const match = await prisma.gradeLevel.findFirst({
        where: { schoolId: cls.schoolId, name: cls.level },
        select: { id: true },
      });
      if (!match) continue;
      await prisma.class.update({ where: { id: cls.id }, data: { gradeLevelId: match.id } });
      linked++;
      console.log(`✓ Linked class ${cls.id} -> grade level ${match.id}`);
    }
    console.log(`Done — ${linked}/${classes.length} class(es) linked.`);
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
