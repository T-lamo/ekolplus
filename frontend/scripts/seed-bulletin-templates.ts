// Bootstrap script. Seeds the 4 global (schoolId: null) BulletinTemplate
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

import { PrismaClient, type Prisma } from '@prisma/client';

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
  typography: {
    schoolName: 13,
    title: 17,
    tableBody: 11,
    tableHeader: 10,
    noteValue: 11,
    footer: 9,
  },
  content: { title: 'BULLETIN SCOLAIRE', footerMessage: null },
  layout: {
    pageMargin: 20,
    blockSpacing: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#f0eef8',
    cellPaddingX: 6,
    cellPaddingY: 6,
    tableLineHeight: 1.4,
    showTableBackgrounds: false,
  },
} as const;

// "Livret préscolaire" (spec 2026-09-05 §12) reproduces
// bulletin_template/Bulletin prescolaire.docx exactly — already in the
// pages/blocks shape (Plan 2), unlike the 3 legacy-shaped templates above.
const LIVRET_PRESCOLAIRE_CONFIG = {
  primaryColor: '#1f2937',
  pageFormat: 'LETTER',
  orientation: 'LANDSCAPE',
  pages: [
    {
      id: 'interieur',
      layout: 'halves',
      showPageNumber: false,
      blocks: [
        { id: 'grilles', type: 'criteriaGrids', visible: true, showScaleHeader: true },
        {
          id: 'appreciations',
          type: 'appreciation',
          visible: true,
          style: 'lines',
          lines: 6,
        },
        {
          id: 'signatures',
          type: 'signatures',
          visible: true,
          labels: { homeroom: 'La jardinière', director: 'La direction' },
        },
      ],
    },
    {
      id: 'couvertures',
      layout: 'halves',
      showPageNumber: false,
      blocks: [
        {
          id: 'verset',
          type: 'text',
          visible: true,
          align: 'justify',
          fontSize: 12,
          bold: false,
          italic: false,
          text: '“Tu aimeras l’Eternel, ton Dieu, de tout ton cœur, de toute ton âme et de toute ta force. 6 Et ces commandements, que je te donne aujourd’hui, seront dans ton cœur. 7 Tu les inculqueras à tes enfants, et tu en parleras quand tu seras dans ta maison, quand tu iras en voyage, quand tu te coucheras et quand tu te lèveras. 8 Tu les lieras comme un signe sur tes mains, et ils seront comme des fronteaux entre tes yeux. Tu les écriras sur les poteaux de ta maison et sur tes portes”.\n\nDeutéronome 6 : 5-6',
        },
        {
          id: 'couverture',
          type: 'cover',
          visible: true,
          breakBefore: 'column',
          sectionLabel: 'Section Kindergarten',
          titlePattern: 'Bulletin du {term}',
          showLogo: true,
          framed: true,
          fields: ['lastName', 'firstName', 'className', 'studentNumber', 'academicYear'],
        },
      ],
    },
  ],
  columns: {
    coefficient: true,
    classAverage: true,
    minMax: true,
    appreciation: true,
    absences: true,
    rank: true,
  },
  signatures: { director: true, homeroom: true, guardian: false },
  typography: {
    schoolName: 24,
    title: 20,
    tableBody: 11,
    tableHeader: 11,
    noteValue: 11,
    footer: 9,
  },
  content: {
    title: 'Livret préscolaire',
    footerMessage: null,
    pageNumberFormat: '{n} / {total}',
  },
  layout: {
    pageMargin: 36,
    blockSpacing: 14,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#000000',
    cellPaddingX: 6,
    cellPaddingY: 3,
    tableLineHeight: 1.4,
    showTableBackgrounds: false,
    logoSize: 52,
    signatureSize: 32,
  },
} as const;

const GLOBAL_TEMPLATES: Array<{
  name: string;
  description: string;
  config: Prisma.InputJsonValue;
}> = [
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
  {
    name: 'Livret préscolaire',
    description:
      'Livret plié en deux pour la section Kindergarten : grilles de comportement et de développement, verset et couverture, reproduisant le modèle papier existant.',
    config: LIVRET_PRESCOLAIRE_CONFIG,
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
