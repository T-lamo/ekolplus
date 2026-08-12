// Bootstrap script. Seeds the 3 global (schoolId: null) BulletinTemplate
// rows every school sees in the "Modèles globaux" gallery tab and can fork
// from. See .planning/banani/bulletin-templates.md for the fork-on-write
// ownership model — these rows are never edited in place once schools start
// forking them, only ever re-run to add new global templates later.
//
// Usage: pnpm db:seed-bulletin-templates
//
// Idempotent — upserts by name among the existing global (schoolId: null)
// rows, since there's no natural unique business key for a global template
// besides its name.

import { PrismaClient } from '@prisma/client';

// Mirrors DEFAULT_BULLETIN_CONFIG in src/lib/server/bulletin-templates.ts,
// duplicated rather than imported: that module is `server-only`-guarded
// (a real Next.js bundler protection) and throws when loaded by a plain
// tsx/Node script outside the Next build pipeline.
const BASE_CONFIG = {
  pageFormat: 'LETTER',
  orientation: 'LANDSCAPE',
  blocks: [
    { id: 'header', visible: true },
    { id: 'studentInfo', visible: true },
    { id: 'stats', visible: true },
    { id: 'notes', visible: true },
    { id: 'absences', visible: true },
    { id: 'appreciation', visible: true },
    { id: 'signatures', visible: true },
  ],
  columns: {
    coefficient: true,
    classAverage: true,
    minMax: true,
    appreciation: true,
    absences: true,
    rank: true,
  },
  signatures: { director: true, homeroom: true, guardian: true },
  typography: { schoolName: 13, title: 17, tableBody: 11 },
} as const;

const GLOBAL_TEMPLATES = [
  {
    name: 'Académique Vert',
    description: 'Style académique classique avec tons verts, adapté aux écoles primaires.',
    config: { ...BASE_CONFIG, primaryColor: '#1a9e5c' },
  },
  {
    name: 'Officiel Rouge',
    description:
      'Mise en page formelle avec couleurs rouges, aspect institutionnel et autoritaire.',
    config: { ...BASE_CONFIG, primaryColor: '#d93025' },
  },
  {
    name: 'Moderne Orange',
    description:
      'Design dynamique aux tons orangés, chaleureux et moderne, idéal pour la maternelle.',
    config: { ...BASE_CONFIG, primaryColor: '#e65100' },
  },
];

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
    const existing = await prisma.bulletinTemplate.findMany({
      where: { schoolId: null },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((t) => t.name));

    for (const tpl of GLOBAL_TEMPLATES) {
      if (existingNames.has(tpl.name)) {
        console.log(`= ${tpl.name} already exists — skipping.`);
        continue;
      }
      await prisma.bulletinTemplate.create({
        data: {
          schoolId: null,
          name: tpl.name,
          description: tpl.description,
          config: tpl.config,
        },
      });
      console.log(`✓ Created global template: ${tpl.name}`);
    }
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
