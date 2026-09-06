// Shared BulletinTemplate.config shape + validation. See
// .planning/banani/bulletin-templates.md for the fork-on-write ownership
// model this supports (schoolId: null = global/seeded, forkedFromId traces
// lineage). A template's content is organized into `pages`, each a fixed
// paper sheet holding typed `blocks`. `header` and `studentInfo` render in
// a fixed top row on whichever page contains them and the footer stripe is
// a non-configurable decoration — every OTHER block type can be dragged
// within its page in the editor (see DRAGGABLE_BLOCK_TYPES in the client
// mirror, configuration/modele-bulletin/types.ts).
import 'server-only';
import { z } from 'zod';
import { createLogger } from './logger';

const logger = createLogger();

export const LEGACY_BLOCK_TYPES = [
  'header',
  'studentInfo',
  'stats',
  'notes',
  'absences',
  'appreciation',
  'signatures',
] as const;
export type LegacyBlockType = (typeof LEGACY_BLOCK_TYPES)[number];

export const BLOCK_TYPES = [
  ...LEGACY_BLOCK_TYPES,
  'text',
  'cover',
  'criteriaGrids',
  'yearGrid',
  'yearDecisions',
  'yearSignatures',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_LABEL: Record<LegacyBlockType, string> = {
  header: 'En-tête',
  studentInfo: 'Infos élève',
  stats: 'Statistiques',
  notes: 'Tableau de notes',
  absences: 'Absences',
  appreciation: 'Appréciation',
  signatures: 'Signatures',
};

const blockBase = {
  id: z.string().trim().min(1).max(60),
  visible: z.boolean(),
  // 'column': starts the right-hand CSS column on a halves page, the
  // aside column on a sidebar page. Enforced by pageSchema's refine
  // below, not here, since validity depends on the containing page's
  // `layout`.
  breakBefore: z.literal('column').optional(),
};

const headerBlockSchema = z.object({ ...blockBase, type: z.literal('header') });
const studentInfoBlockSchema = z.object({ ...blockBase, type: z.literal('studentInfo') });
const statsBlockSchema = z.object({ ...blockBase, type: z.literal('stats') });
const notesBlockSchema = z.object({ ...blockBase, type: z.literal('notes') });
const absencesBlockSchema = z.object({ ...blockBase, type: z.literal('absences') });
const appreciationBlockSchema = z.object({
  ...blockBase,
  type: z.literal('appreciation'),
  style: z.enum(['box', 'lines']).optional(),
  lines: z.number().int().min(3).max(12).optional(),
  title: z.string().trim().max(60).optional(),
});
const signaturesBlockSchema = z.object({
  ...blockBase,
  type: z.literal('signatures'),
  labels: z
    .object({
      director: z.string().trim().max(40).optional(),
      homeroom: z.string().trim().max(40).optional(),
      guardian: z.string().trim().max(40).optional(),
    })
    .optional(),
  style: z.enum(['boxes', 'lines']).optional(),
  homeroomFirst: z.boolean().optional(),
});
const textBlockSchema = z.object({
  ...blockBase,
  type: z.literal('text'),
  text: z.string().max(2000),
  align: z.enum(['left', 'center', 'right', 'justify']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  fontSize: z.number().min(8).max(20),
  bold: z.boolean(),
  italic: z.boolean(),
});
const coverFieldSchema = z.enum([
  'lastName',
  'firstName',
  'fullName',
  'className',
  'studentNumber',
  'nisu',
  'academicYear',
]);
const coverBlockSchema = z.object({
  ...blockBase,
  type: z.literal('cover'),
  sectionLabel: z.string().trim().max(60),
  titlePattern: z.string().trim().max(60),
  showLogo: z.boolean(),
  framed: z.boolean(),
  frameStyle: z.enum(['dashed', 'solid', 'rounded']).optional(),
  // Absent = true (today's rendering: school name, section label and title
  // in capitals). false prints them as typed, the way the carnets do.
  uppercase: z.boolean().optional(),
  // Absent = 'top'. 'belowTitle' places the logo between the title and the
  // identity lines (spec 2026-09-06 §4.2).
  logoPosition: z.enum(['top', 'belowTitle']).optional(),
  fields: z.array(coverFieldSchema),
  fieldLabels: z
    .object({
      lastName: z.string().trim().max(60).optional(),
      firstName: z.string().trim().max(60).optional(),
      fullName: z.string().trim().max(60).optional(),
      className: z.string().trim().max(60).optional(),
      studentNumber: z.string().trim().max(60).optional(),
      nisu: z.string().trim().max(60).optional(),
      academicYear: z.string().trim().max(60).optional(),
    })
    .optional(),
});
const criteriaGridsBlockSchema = z.object({
  ...blockBase,
  type: z.literal('criteriaGrids'),
  showScaleHeader: z.boolean(),
  style: z.enum(['modern', 'grid']).optional(),
  subjects: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

// Annual carnet blocks (spec 2026-09-06 §4.1). They read `data.year`, which
// getStudentBulletinView only computes when templateNeedsYear() is true.
const yearGridBlockSchema = z.object({
  ...blockBase,
  type: z.literal('yearGrid'),
  showDomains: z.boolean().optional(),
  notesLabel: z.string().trim().min(1).max(20).optional(),
  maxLabel: z.string().trim().min(1).max(20).optional(),
});
const yearDecisionsBlockSchema = z.object({
  ...blockBase,
  type: z.literal('yearDecisions'),
  title: z.string().trim().min(1).max(60).optional(),
});
const yearSignaturesBlockSchema = z.object({
  ...blockBase,
  type: z.literal('yearSignatures'),
  title: z.string().trim().min(1).max(60).optional(),
  labels: z
    .object({
      director: z.string().trim().max(40).optional(),
      guardian: z.string().trim().max(40).optional(),
    })
    .optional(),
});

export const YEAR_BLOCK_TYPES = ['yearGrid', 'yearDecisions', 'yearSignatures'] as const;

export const blockSchema = z.discriminatedUnion('type', [
  headerBlockSchema,
  studentInfoBlockSchema,
  statsBlockSchema,
  notesBlockSchema,
  absencesBlockSchema,
  appreciationBlockSchema,
  signaturesBlockSchema,
  textBlockSchema,
  coverBlockSchema,
  criteriaGridsBlockSchema,
  yearGridBlockSchema,
  yearDecisionsBlockSchema,
  yearSignaturesBlockSchema,
]);
export type Block = z.infer<typeof blockSchema>;

export const pageSchema = z
  .object({
    id: z.string().trim().min(1).max(60),
    layout: z.enum(['full', 'halves', 'sidebar']),
    // Width of the aside column of a `sidebar` page, in percent of the
    // printable width. Read only when layout === 'sidebar'; absent = 25.
    asideWidth: z.number().min(15).max(50).optional(),
    showPageNumber: z.boolean(),
    blocks: z.array(blockSchema).min(1),
  })
  .refine(
    (page) => {
      const counts = new Map<string, number>();
      for (const b of page.blocks) {
        if ((LEGACY_BLOCK_TYPES as readonly string[]).includes(b.type)) {
          counts.set(b.type, (counts.get(b.type) ?? 0) + 1);
        }
      }
      return [...counts.values()].every((n) => n <= 1);
    },
    { message: 'each of the 7 legacy block types may appear at most once per page' },
  )
  .refine((page) => page.layout !== 'full' || page.blocks.every((b) => b.breakBefore == null), {
    message: 'breakBefore is only valid on a halves- or sidebar-layout page',
  });
export type Page = z.infer<typeof pageSchema>;

export const bulletinTemplateConfigSchema = z
  .object({
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (format hex #rrggbb attendu)'),
    pageFormat: z.enum(['LETTER', 'A4']),
    orientation: z.enum(['LANDSCAPE', 'PORTRAIT']),
    pages: z.array(pageSchema).min(1).max(6),
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
      tableHeader: z.number().min(8).max(16),
      noteValue: z.number().min(8).max(20),
      footer: z.number().min(6).max(14),
    }),
    content: z.object({
      title: z.string().trim().min(1).max(60),
      footerMessage: z.string().trim().max(200).nullable(),
      pageNumberFormat: z.string().trim().min(1).max(30),
    }),
    layout: z.object({
      pageMargin: z.number().min(0).max(48),
      blockSpacing: z.number().min(0).max(32),
      borderWidth: z.number().min(0).max(4),
      borderStyle: z.enum(['solid', 'dashed', 'dotted']),
      borderColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (format hex #rrggbb attendu)'),
      cellPaddingX: z.number().min(0).max(24),
      cellPaddingY: z.number().min(0).max(16),
      tableLineHeight: z.number().min(1).max(2.4),
      showTableBackgrounds: z.boolean(),
      // Optional: templates saved before this field existed still PATCH
      // their full config on every save (see the editor's `save()`) — a
      // required field here would reject that whole save for any
      // pre-existing template. Block renderers fall back to 52/32 when
      // absent.
      logoSize: z.number().min(32).max(96).optional(),
      signatureSize: z.number().min(20).max(64).optional(),
      // Gradient stripes at the top and bottom of every sheet; absent = shown.
      showDecoration: z.boolean().optional(),
    }),
  })
  .refine(
    (cfg) => {
      const ids = cfg.pages.map((p) => p.id);
      return new Set(ids).size === ids.length;
    },
    { message: 'page ids must be unique' },
  )
  .refine(
    (cfg) => {
      const ids = cfg.pages.flatMap((p) => p.blocks.map((b) => b.id));
      return new Set(ids).size === ids.length;
    },
    { message: 'block ids must be unique across the whole config' },
  );

export type BulletinTemplateConfig = z.infer<typeof bulletinTemplateConfigSchema>;

// True when at least one page (visible block or not) holds an annual block:
// getStudentBulletinView only pays for the year-wide computation then.
export function templateNeedsYear(config: Pick<BulletinTemplateConfig, 'pages'>): boolean {
  return config.pages.some((p) =>
    p.blocks.some((b) => (YEAR_BLOCK_TYPES as readonly string[]).includes(b.type)),
  );
}

export const DEFAULT_PAGE_NUMBER_FORMAT = '{n} / {total}';

export const DEFAULT_BULLETIN_CONFIG: BulletinTemplateConfig = {
  primaryColor: '#6c2bd9',
  pageFormat: 'LETTER',
  orientation: 'LANDSCAPE',
  pages: [
    {
      id: 'page-1',
      layout: 'full',
      showPageNumber: false,
      blocks: LEGACY_BLOCK_TYPES.map((type) => ({ id: type, type, visible: true }) as Block),
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
  signatures: { director: true, homeroom: true, guardian: true },
  typography: {
    schoolName: 13,
    title: 17,
    tableBody: 11,
    tableHeader: 10,
    noteValue: 11,
    footer: 9,
  },
  content: {
    title: 'BULLETIN SCOLAIRE',
    footerMessage: null,
    pageNumberFormat: DEFAULT_PAGE_NUMBER_FORMAT,
  },
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
    logoSize: 52,
    signatureSize: 32,
  },
};

interface LegacyBulletinTemplateConfig {
  primaryColor: string;
  pageFormat: 'LETTER' | 'A4';
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  blocks: { id: LegacyBlockType; visible: boolean }[];
  columns: BulletinTemplateConfig['columns'];
  signatures: BulletinTemplateConfig['signatures'];
  typography: BulletinTemplateConfig['typography'];
  content: { title: string; footerMessage: string | null };
  layout: BulletinTemplateConfig['layout'];
}

// Converts whatever is stored in the DB into the current `pages`-shaped
// config, at READ time — the DB itself is never eagerly migrated (see
// scripts/backfill-bulletin-template-pages.ts for the optional cleanup
// pass). Called at 3 call sites (2 of which read a template's config
// directly from a school's real database row: getStudentBulletinView and
// GET /api/school/bulletin-templates/[id], whose response also seeds the
// editor's live preview — see Ruling R3 in the plan this function ships
// with; the third, the real bulletin print page, re-normalizes
// getStudentBulletinView's ALREADY-normalized output defensively).
//
// Defense in depth: a hand-edited or corrupted DB row could hand this
// function `null`, `{}`, or a `blocks` field that isn't an array. None of
// that should happen in practice (every writer goes through the schema
// before saving), but this must never throw a raw TypeError for it — the
// safe fallback below only fires for genuinely malformed input.
function isPagesShaped(raw: unknown): raw is { pages: unknown } {
  return (
    raw != null && typeof raw === 'object' && Array.isArray((raw as { pages?: unknown }).pages)
  );
}

export function normalizeConfig(raw: unknown): BulletinTemplateConfig {
  if (isPagesShaped(raw)) {
    // Already migrated by a save that went through the current schema —
    // every writer of a `pages`-shaped config already sets
    // content.pageNumberFormat, so no further backfill is needed here.
    // Still run it through the real schema rather than a bare cast: an
    // unvalidated `pages: []` (impossible per the schema's `.min(1)`, but
    // reachable here before any validation happens) would otherwise flow
    // through untouched and could make BulletinViewer's
    // documentNaturalHeight computation go negative downstream.
    const parsed = bulletinTemplateConfigSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    logger.warn(
      'bulletin-templates: normalizeConfig received a pages-shaped config that failed schema validation, falling back to the default config',
      {
        issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      },
    );
    return structuredClone(DEFAULT_BULLETIN_CONFIG);
  }

  if (
    raw == null ||
    typeof raw !== 'object' ||
    !Array.isArray((raw as { blocks?: unknown }).blocks)
  ) {
    logger.warn(
      'bulletin-templates: normalizeConfig received a malformed legacy config (no array blocks field), falling back to the default config',
    );
    return structuredClone(DEFAULT_BULLETIN_CONFIG);
  }

  const legacy = raw as LegacyBulletinTemplateConfig;
  return {
    primaryColor: legacy.primaryColor,
    pageFormat: legacy.pageFormat,
    orientation: legacy.orientation,
    pages: [
      {
        id: 'page-1',
        layout: 'full',
        showPageNumber: false,
        // The old flat block's `id` was always one of the 7 legacy type
        // names — safe to reuse as both the new block's `id` and its
        // `type` (LegacyBlockType ⊆ BlockType, and none of these 7 types
        // requires a field beyond {id, type, visible}).
        blocks: legacy.blocks.map((b) => ({ id: b.id, type: b.id, visible: b.visible }) as Block),
      },
    ],
    columns: legacy.columns,
    signatures: legacy.signatures,
    typography: legacy.typography,
    content: { ...legacy.content, pageNumberFormat: DEFAULT_PAGE_NUMBER_FORMAT },
    layout: legacy.layout,
  };
}
