// Shared BulletinTemplate.config shape + validation. See
// .planning/banani/bulletin-templates.md for the fork-on-write ownership
// model this supports (schoolId: null = global/seeded, forkedFromId traces
// lineage). `header` and `studentInfo` render in a fixed top row and the
// footer stripe is a non-configurable decoration — only the 5
// REORDERABLE_BLOCK_IDS can be dragged in the editor, matching what the
// Banani canvas actually renders as distinct, positionable elements.
import 'server-only';
import { z } from 'zod';

export const BLOCK_IDS = [
  'header',
  'studentInfo',
  'stats',
  'notes',
  'absences',
  'appreciation',
  'signatures',
] as const;
export type BlockId = (typeof BLOCK_IDS)[number];

export const REORDERABLE_BLOCK_IDS = [
  'stats',
  'notes',
  'absences',
  'appreciation',
  'signatures',
] as const;

export const BLOCK_LABEL: Record<BlockId, string> = {
  header: 'En-tête',
  studentInfo: 'Infos élève',
  stats: 'Statistiques',
  notes: 'Tableau de notes',
  absences: 'Absences',
  appreciation: 'Appréciation',
  signatures: 'Signatures',
};

export const bulletinTemplateConfigSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (format hex #rrggbb attendu)'),
  pageFormat: z.enum(['LETTER', 'A4']),
  orientation: z.enum(['LANDSCAPE', 'PORTRAIT']),
  blocks: z
    .array(z.object({ id: z.enum(BLOCK_IDS), visible: z.boolean() }))
    .refine(
      (blocks) => new Set(blocks.map((b) => b.id)).size === BLOCK_IDS.length,
      'blocks must list each block id exactly once',
    ),
  columns: z.object({
    coefficient: z.boolean(),
    classAverage: z.boolean(),
    minMax: z.boolean(),
    appreciation: z.boolean(),
    absences: z.boolean(),
    rank: z.boolean(),
  }),
  signatures: z.object({
    director: z.boolean(),
    homeroom: z.boolean(),
    guardian: z.boolean(),
  }),
  typography: z.object({
    schoolName: z.number().min(8).max(32),
    title: z.number().min(8).max(32),
    tableBody: z.number().min(8).max(24),
  }),
  content: z.object({
    title: z.string().trim().min(1).max(60),
    footerMessage: z.string().trim().max(200).nullable(),
  }),
  layout: z.object({
    pageMargin: z.number().min(0).max(48),
    blockSpacing: z.number().min(0).max(32),
    borderWidth: z.number().min(0).max(4),
    borderColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (format hex #rrggbb attendu)'),
  }),
});

export type BulletinTemplateConfig = z.infer<typeof bulletinTemplateConfigSchema>;

export const DEFAULT_BULLETIN_CONFIG: BulletinTemplateConfig = {
  primaryColor: '#6c2bd9',
  pageFormat: 'LETTER',
  orientation: 'LANDSCAPE',
  blocks: BLOCK_IDS.map((id) => ({ id, visible: true })),
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
  content: { title: 'BULLETIN SCOLAIRE', footerMessage: null },
  layout: { pageMargin: 20, blockSpacing: 10, borderWidth: 1, borderColor: '#f0eef8' },
};
