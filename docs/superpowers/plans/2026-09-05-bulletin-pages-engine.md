# Moteur de pages (bulletin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bulletin template's flat, single-page `blocks[]` config with a `pages: Page[]` model (each page holding typed `blocks[]`, `full` or `halves` layout, optional page numbering), add three new block types (`text`, `cover`, `criteriaGrids`), and re-render every bulletin surface (on-screen viewer, print/PDF, editor) through this model — so a template can span multiple pages with a numbered footer, a free-text back page, a cover page, and qualitative-subject grids, while every template saved before this plan ships keeps rendering identically via a read-time compatibility shim.

**Architecture:** `BulletinTemplate.config` (already a plain Prisma `Json` column — no migration needed) gains a `pages` array replacing the old flat `blocks` array; `normalizeConfig()` converts an old flat config into the new shape at read time in exactly 3 places, so nothing in the database needs to change before this ships. Rendering is decomposed from one 616-line `BulletinCanvas` component into `BulletinDocument` (maps `pages` to sheets) → `BulletinPage` (one physical sheet, `full` or 2-column `halves` layout, page-number footer) → one renderer file per block `type` under `components/bulletin/blocks/`, each a pure `render({ block, config, data })` function. `BulletinCanvas.tsx` is deleted once its 4 real callers (the on-screen viewer, both print/PDF pages, the template editor) are migrated to `BulletinDocument`/`BulletinPage` — all 4 migrations are tasks in this same plan, so no compatibility alias needs to linger past it. The template editor is decomposed to match: a `PagesPanel` (page list + the current page's block list, drag-and-drop now covering all block types except the two that keep their fixed combined top-row rendering) and a `BlockProperties` panel section (new, block-type-specific fields) additive to the 3 existing global style/content/spacing tabs, which stay untouched.

**Tech Stack:** Next.js 16 App Router, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Zod (server-side schema + validation, in `bulletin-templates.ts` which carries `import 'server-only'`), a hand-mirrored plain-TypeScript client copy of the same shape (existing convention, see `configuration/modele-bulletin/types.ts`), Tailwind v4 (no inline `style` except where a value is computed from `config`, matching the current codebase), Vitest (pure-logic tests only, no component rendering, matching the repo's existing test style), next-intl (fr/ht/en, extending the existing `Configuration.modeleBulletin` namespace — no new namespace).

**Spec:** `docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md`, specifically §9 (`config` shape, block-type option table, validation constraints), §10 (render/PDF/viewer), §11 (editor decomposition), plus the parts of §13 (backfill script) and §14 (pure-logic tests) that belong to this plan. §4-§7 (matières qualitatives) already shipped as a separate plan (`docs/superpowers/plans/2026-09-05-matieres-qualitatives.md`, merged to `develop`) and are consumed here read-only (`StudentBulletinView.qualitativeSubjects`, already correct). §8/§12 (bulletin template per grade level, the "Livret préscolaire" seed template) are **out of scope** — a separate, later plan that depends on this one.

## Global Constraints

- Every Route Handler touched or added `export const runtime = 'nodejs'` (none are added by this plan; the one route this plan edits already has it).
- `verifyCsrf(req)` on every mutating route (none are added; the one route edited is a `GET`, no CSRF check needed).
- TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — an optional field mirrored client-side needs an explicit `| undefined`, matching the existing `logoSize?: number | undefined` pattern in `configuration/modele-bulletin/types.ts`.
- No Prisma migration in this plan — `BulletinTemplate.config` is already a `Json` column (confirmed in `frontend/prisma/schema.prisma`); only its TypeScript/Zod shape changes.
- Locale key parity: any new user-facing string in the editor UI goes into `frontend/src/messages/{fr,en,ht}/configuration.json` under the existing `modeleBulletin` namespace (no new namespace), all three files touched together so `locales.test.ts`'s key-parity check keeps passing; the `ht` file already carries a file-level `_review` flag.
- Printed bulletin content (subject names, "Signature du Directeur", grid headers, the `cover`/`text`/`criteriaGrids` block content) stays hardcoded French by design — an official school document, same carve-out already applied to the 7 existing block types; this plan adds one sentence to CLAUDE.md documenting it for the 3 new block types (Task 10).
- No em dash in user-facing text (editor UI copy, toasts, i18n strings) — use a period, comma, colon, or `·`. This does not apply to code comments or this plan's own prose.
- `git add` explicit paths only, never `git add -A`/`git add .`.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Before every commit: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must all pass (run from repo root; the workspace has a single `frontend` package so every script delegates there).
- Single test file: `pnpm --filter frontend exec vitest run src/path/to/file.test.ts`.
- Client-side files (anything not carrying `import 'server-only'`) must import `Block`/`BlockType`/`Page`/`BulletinTemplateConfig` from the hand-mirrored `frontend/src/app/(school)/configuration/modele-bulletin/types.ts`, never from `frontend/src/lib/server/bulletin-templates.ts` (which has `import 'server-only'` — even a `import type` from it is against the codebase's established convention, see that file's own header comment and `page-size.ts`'s identical pattern).

## Rulings made while planning

These resolve ambiguities the spec leaves to the implementer. Record them; do not re-litigate them mid-execution.

- **R1 — No migration needed.** `BulletinTemplate.config` is already `Json`. The spec's §13 migration filename (`38_bulletin_prescolaire_pages`) covered §4 (Subject qualitative fields, already shipped as migration `38_qualitative_subjects` by the prior plan) and §8 (`Class.gradeLevelId`/`GradeLevel.bulletinTemplateId`, out of scope here — Plan 3's problem, will need its own new migration number). This plan touches zero `.prisma`/`.sql` files.
- **R2 — `BulletinCanvas.tsx` is deleted in this plan, not left as a lingering alias.** The spec (§10.1) describes it becoming "un alias de compatibilité… supprimé quand plus aucun appelant ne l'utilise." This plan migrates all 4 real JSX callers (`BulletinViewer.tsx`, the real print page, the template-preview print page, the template editor) in its own tasks, so there is no external caller left by the time the plan finishes — keeping a transitional alias for zero remaining consumers adds a file to delete later for no safety benefit. Task 9 deletes it once the editor (the last caller) is migrated.
- **R3 — Exactly 3 `normalizeConfig` call sites, not 4.** The spec's §9.2 sentence "Appelé par `getStudentBulletinView`, la page d'impression, le `GET` du modèle (éditeur) et la prévisualisation" names what reads like 4 things, but the template gallery/list page (`configuration/modele-bulletin/page.tsx`) renders no live preview of any template — grepped and confirmed: only navigation `href`s to the editor. "Le `GET` du modèle (éditeur)" and "la prévisualisation" are the same call site: the editor's `GET /api/school/bulletin-templates/[id]` response seeds both the edit form state and the in-editor live preview canvas from the same `config` value. The 3 real sites: `getStudentBulletinView` (Task 2), the real bulletin print page (Task 5), `GET /api/school/bulletin-templates/[id]` (Task 7). The template's own `PATCH` validates the full schema directly (requires `pages` already present, no normalization). The template's `preview-pdf` `POST` body is also validated by the full schema directly (its `config` always comes from the editor's already-normalized in-memory state) — no `normalizeConfig` call needed there. The template gallery's `GET /api/school/bulletin-templates` list route only reads `config.primaryColor` (an unaffected field) — out of scope.
- **R4 — `header`/`studentInfo` keep their exact current rendering, only drag-and-drop generalizes.** Today these two render together in one hardcoded top-row div, unconditionally first when visible, with their position in the `blocks` array having zero effect on where they render (only `visible` matters) — and they are the only 2 of the current 7 types NOT in `REORDERABLE_BLOCK_IDS`. This plan preserves that exactly: `BulletinPage` special-cases whichever of these two block types exists in *that page's* `blocks[]` (if any), rendering them combined at the top of that page in the same fixed layout, before the rest of that page's blocks. Drag-and-drop lifts from "5 of 7 types" to "all types except `header`/`studentInfo`" (8 of 10) — the spec's §11 "généralisé à tous les blocs" is satisfied for every type where reordering has a visible effect; dragging `header`/`studentInfo` within the block list has no rendering effect today and none after this plan, which is a documented decision, not a regression.
- **R5 — `content.footerMessage` and the two decorative gradient bars render on every page.** Neither is addressed by the spec's multi-page redesign (§9/§10 describe per-page `showPageNumber` but say nothing about the existing global footer message or the decorative bars). The current single-page behavior renders both unconditionally; generalizing "unconditionally" to "on every page" is the simplest reading that changes nothing for any single-page template (the overwhelming majority today) and gives multi-page templates a predictable, uniform look rather than requiring new page-position-aware config.
- **R6 — Properties panel: existing 3 tabs (style/content/spacing) stay global and untouched; a 4th tab appears only for block types that gained new per-block fields.** Per spec §9.1, only 5 of the 10 types have block-instance-level options: `appreciation` (`style`, `lines`), `signatures` (`labels`), `text` (`text`, `align`, `fontSize`, `bold`, `italic`), `cover` (`sectionLabel`, `titlePattern`, `showLogo`, `framed`, `fields`), `criteriaGrids` (`showScaleHeader`). The other 5 (`header`, `studentInfo`, `stats`, `notes`, `absences`) have no new fields at all — their behavior is still driven entirely by the existing global `columns`/`signatures`/`typography`/`layout` objects. The new "Ce bloc" tab is conditionally shown only when the selected block's type is one of the 5 with fields; switching selection to a block without one hides the tab and falls back to the `style` tab if it was showing.
- **R7 — Block/page id uniqueness is config-wide, not just per-page.** Per spec §9 ("id: string, unique dans le config" appears on both `Page` and `Block`), both page ids and block ids must be unique across the *entire* `pages` array, not merely within one page — enforced by a `refine` at the top-level config schema.
- **R8 — `content.pageNumberFormat` is a required field of the new schema, backfilled only by `normalizeConfig`'s legacy branch.** Every `pages`-shaped config from this point forward is written by code that always sets it (the editor seeds `DEFAULT_BULLETIN_CONFIG`, which has it); only a legacy flat-`blocks` config predates it, and `normalizeConfig` fills in the default (`"{n} / {total}"`) exactly once, in the branch that also builds `pages` from `blocks`.

## File Map

| File | Change |
|---|---|
| `frontend/src/lib/server/bulletin-templates.ts` | Rewrite: `pages`/`Block` Zod schema (discriminated union on `type`), `normalizeConfig()`, updated `DEFAULT_BULLETIN_CONFIG` |
| `frontend/src/lib/server/bulletin-templates.test.ts` | **New.** Schema validation + `normalizeConfig` tests |
| `frontend/src/app/(school)/configuration/modele-bulletin/types.ts` | Hand-mirrored client types updated to the `pages`/`Block` shape |
| `frontend/src/app/(school)/configuration/modele-bulletin/block-label.ts` | `BlockLabelT` extended to the 10 block-type keys |
| `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts` | `StudentBulletinView` gains `termLabel` |
| `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts` | Assert `termLabel` on existing fixtures |
| `frontend/src/app/(school)/bulletins/types.ts` | `StudentBulletinData` gains `termLabel`, `qualitativeSubjects` |
| `frontend/src/components/bulletin/render-data.tsx` | **New.** `BulletinRenderData` interface + `fmt`/`ordinal`/`scoreColor`/`cellStyle`/`StatBox`/`SigBox`, extracted from `BulletinCanvas.tsx` |
| `frontend/src/components/bulletin/sample-bulletin-data.ts` | Adds `firstName`/`lastName`/`schoolAddress`/`schoolPhone`/`schoolEmail`/`termLabel`/`academicYearLabel`/`qualitativeSubjects` (2 sample subjects) |
| `frontend/src/components/bulletin/blocks/header.tsx` | **New.** Extracted from `BulletinCanvas` |
| `frontend/src/components/bulletin/blocks/studentInfo.tsx` | **New.** Extracted |
| `frontend/src/components/bulletin/blocks/stats.tsx` | **New.** Extracted |
| `frontend/src/components/bulletin/blocks/notes.tsx` | **New.** Extracted |
| `frontend/src/components/bulletin/blocks/absences.tsx` | **New.** Extracted |
| `frontend/src/components/bulletin/blocks/appreciation.tsx` | **New.** Extracted + `style`/`lines` |
| `frontend/src/components/bulletin/blocks/signatures.tsx` | **New.** Extracted + `labels` |
| `frontend/src/components/bulletin/blocks/text.tsx` | **New.** |
| `frontend/src/components/bulletin/blocks/cover.tsx` | **New.** |
| `frontend/src/components/bulletin/blocks/criteriaGrids.tsx` | **New.** |
| `frontend/src/components/bulletin/blocks/index.ts` | **New.** `type → render` registry |
| `frontend/src/components/bulletin/BulletinPage.tsx` | **New.** One sheet: `full`/`halves`, page-number footer, header/studentInfo special-case, generic block loop |
| `frontend/src/components/bulletin/BulletinDocument.tsx` | **New.** `pages.map(page => <BulletinPage>)`, stacked with a gap |
| `frontend/src/components/bulletin/BulletinCanvas.tsx` | **Deleted** (Task 9, after the editor migrates off it) |
| `frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx` | Renders `BulletinDocument`; wires new render-data fields |
| `frontend/src/app/print/bulletin-template-preview/page.tsx` | Renders `BulletinDocument` |
| `frontend/src/components/bulletin/BulletinViewer.tsx` | Renders `BulletinDocument`, multi-page zoom/stack math, wires new fields |
| `frontend/src/app/api/school/bulletin-templates/[id]/route.ts` | `GET` applies `normalizeConfig` |
| `frontend/scripts/backfill-bulletin-template-pages.ts` | **New.** `blocks → pages`, idempotent |
| `frontend/scripts/backfill-bulletin-template-pages.test.ts` | **New.** |
| `frontend/package.json` | New `db:backfill-bulletin-pages` script |
| `frontend/src/app/(school)/configuration/modele-bulletin/[id]/edit/page.tsx` | Decomposed: `PagesPanel`, `BlockPalette`, `BlockProperties`, per-page canvas |
| `frontend/src/messages/{fr,en,ht}/configuration.json` | New keys under `modeleBulletin` |
| `CLAUDE.md` | New carve-out sentence (printed content of the 3 new block types stays French) |

## Task 1: Pages/Blocks schema, `normalizeConfig`, client type mirror

**Files:**
- Modify: `frontend/src/lib/server/bulletin-templates.ts`
- Modify: `frontend/src/app/(school)/configuration/modele-bulletin/types.ts`
- Modify: `frontend/src/app/(school)/configuration/modele-bulletin/block-label.ts`
- Test: `frontend/src/lib/server/bulletin-templates.test.ts` (new)

**Interfaces:**
- Produces: server — `bulletinTemplateConfigSchema`, `BulletinTemplateConfig`, `normalizeConfig(raw: unknown): BulletinTemplateConfig`, `DEFAULT_BULLETIN_CONFIG`, `BLOCK_TYPES`, `LEGACY_BLOCK_TYPES`, `blockSchema`, `pageSchema`. Client — the same shape as plain interfaces/types in `types.ts`: `Block`, `BlockType`, `LegacyBlockType`, `Page`, `BulletinTemplateConfig`, `BLOCK_TYPES`, `LEGACY_BLOCK_TYPES`, `DRAGGABLE_BLOCK_TYPES`, `CoverField`.
- Consumes: nothing from other tasks (this is the foundation task).

- [ ] **Step 1: Rewrite `frontend/src/lib/server/bulletin-templates.ts`**

Replace the whole file with:

```ts
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

export const BLOCK_TYPES = [...LEGACY_BLOCK_TYPES, 'text', 'cover', 'criteriaGrids'] as const;
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
  // 'column': only meaningful on a `halves` page — starts the right-hand
  // CSS column at this block. Enforced by pageSchema's refine below, not
  // here, since validity depends on the containing page's `layout`.
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
});
const textBlockSchema = z.object({
  ...blockBase,
  type: z.literal('text'),
  text: z.string().max(2000),
  align: z.enum(['left', 'center', 'justify']),
  fontSize: z.number().min(8).max(20),
  bold: z.boolean(),
  italic: z.boolean(),
});
const coverFieldSchema = z.enum([
  'lastName',
  'firstName',
  'className',
  'studentNumber',
  'academicYear',
]);
const coverBlockSchema = z.object({
  ...blockBase,
  type: z.literal('cover'),
  sectionLabel: z.string().trim().max(60),
  titlePattern: z.string().trim().max(60),
  showLogo: z.boolean(),
  framed: z.boolean(),
  fields: z.array(coverFieldSchema),
});
const criteriaGridsBlockSchema = z.object({
  ...blockBase,
  type: z.literal('criteriaGrids'),
  showScaleHeader: z.boolean(),
});

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
]);
export type Block = z.infer<typeof blockSchema>;

export const pageSchema = z
  .object({
    id: z.string().trim().min(1).max(60),
    layout: z.enum(['full', 'halves']),
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
  .refine((page) => page.layout === 'halves' || page.blocks.every((b) => b.breakBefore == null), {
    message: 'breakBefore is only valid on a halves-layout page',
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
  content: { title: 'BULLETIN SCOLAIRE', footerMessage: null, pageNumberFormat: DEFAULT_PAGE_NUMBER_FORMAT },
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
// pass). Called at exactly 3 sites: getStudentBulletinView, the real
// bulletin print page, and GET /api/school/bulletin-templates/[id] (whose
// response also seeds the editor's live preview — see Ruling R3 in the
// plan this function ships with).
export function normalizeConfig(raw: unknown): BulletinTemplateConfig {
  const obj = raw as { pages?: unknown };
  if (Array.isArray(obj.pages)) {
    // Already migrated by a save that went through the current schema —
    // every writer of a `pages`-shaped config already sets
    // content.pageNumberFormat, so no further backfill is needed here.
    return raw as BulletinTemplateConfig;
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
        blocks: legacy.blocks.map(
          (b) => ({ id: b.id, type: b.id, visible: b.visible }) as Block,
        ),
      },
    ],
    columns: legacy.columns,
    signatures: legacy.signatures,
    typography: legacy.typography,
    content: { ...legacy.content, pageNumberFormat: DEFAULT_PAGE_NUMBER_FORMAT },
    layout: legacy.layout,
  };
}
```

- [ ] **Step 2: Rewrite `frontend/src/app/(school)/configuration/modele-bulletin/types.ts`**

```ts
// Hand-mirrored client-side type duplicate of frontend/src/lib/server/
// bulletin-templates.ts (which has `import 'server-only'`, so client
// components cannot import from it — not even a type-only import, per
// this codebase's established convention, see page-size.ts's identical
// note). Keep this file's shapes structurally identical to the server
// Zod schema's inferred types whenever either changes.
export type LegacyBlockType =
  | 'header'
  | 'studentInfo'
  | 'stats'
  | 'notes'
  | 'absences'
  | 'appreciation'
  | 'signatures';

export type BlockType = LegacyBlockType | 'text' | 'cover' | 'criteriaGrids';

export const LEGACY_BLOCK_TYPES: LegacyBlockType[] = [
  'header',
  'studentInfo',
  'stats',
  'notes',
  'absences',
  'appreciation',
  'signatures',
];

export const BLOCK_TYPES: BlockType[] = [...LEGACY_BLOCK_TYPES, 'text', 'cover', 'criteriaGrids'];

// Every type except header/studentInfo — those two always render in a
// fixed combined top row regardless of their position in `blocks` (see
// Ruling R4 in docs/superpowers/plans/2026-09-05-bulletin-pages-engine.md).
export const DRAGGABLE_BLOCK_TYPES: BlockType[] = BLOCK_TYPES.filter(
  (t) => t !== 'header' && t !== 'studentInfo',
);

interface BlockBase {
  id: string;
  visible: boolean;
  breakBefore?: 'column' | undefined;
}

export interface HeaderBlock extends BlockBase {
  type: 'header';
}
export interface StudentInfoBlock extends BlockBase {
  type: 'studentInfo';
}
export interface StatsBlock extends BlockBase {
  type: 'stats';
}
export interface NotesBlock extends BlockBase {
  type: 'notes';
}
export interface AbsencesBlock extends BlockBase {
  type: 'absences';
}
export interface AppreciationBlock extends BlockBase {
  type: 'appreciation';
  style?: 'box' | 'lines' | undefined;
  lines?: number | undefined;
}
export interface SignaturesLabels {
  director?: string | undefined;
  homeroom?: string | undefined;
  guardian?: string | undefined;
}
export interface SignaturesBlock extends BlockBase {
  type: 'signatures';
  labels?: SignaturesLabels | undefined;
}
export interface TextBlock extends BlockBase {
  type: 'text';
  text: string;
  align: 'left' | 'center' | 'justify';
  fontSize: number;
  bold: boolean;
  italic: boolean;
}
export type CoverField = 'lastName' | 'firstName' | 'className' | 'studentNumber' | 'academicYear';
export interface CoverBlock extends BlockBase {
  type: 'cover';
  sectionLabel: string;
  titlePattern: string;
  showLogo: boolean;
  framed: boolean;
  fields: CoverField[];
}
export interface CriteriaGridsBlock extends BlockBase {
  type: 'criteriaGrids';
  showScaleHeader: boolean;
}

export type Block =
  | HeaderBlock
  | StudentInfoBlock
  | StatsBlock
  | NotesBlock
  | AbsencesBlock
  | AppreciationBlock
  | SignaturesBlock
  | TextBlock
  | CoverBlock
  | CriteriaGridsBlock;

export interface Page {
  id: string;
  layout: 'full' | 'halves';
  showPageNumber: boolean;
  blocks: Block[];
}

export const DEFAULT_PAGE_NUMBER_FORMAT = '{n} / {total}';

export interface BulletinTemplateConfig {
  primaryColor: string;
  pageFormat: 'LETTER' | 'A4';
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  pages: Page[];
  columns: {
    coefficient: boolean;
    classAverage: boolean;
    minMax: boolean;
    appreciation: boolean;
    absences: boolean;
    rank: boolean;
  };
  signatures: { director: boolean; homeroom: boolean; guardian: boolean };
  typography: {
    schoolName: number;
    title: number;
    tableBody: number;
    tableHeader: number;
    noteValue: number;
    footer: number;
  };
  content: { title: string; footerMessage: string | null; pageNumberFormat: string };
  layout: {
    pageMargin: number;
    blockSpacing: number;
    borderWidth: number;
    borderStyle: 'solid' | 'dashed' | 'dotted';
    borderColor: string;
    cellPaddingX: number;
    cellPaddingY: number;
    tableLineHeight: number;
    showTableBackgrounds: boolean;
    logoSize?: number | undefined;
    signatureSize?: number | undefined;
  };
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  forkedFromId: string | null;
  primaryColor: string;
  updatedAt: string;
}

export interface TemplateListData {
  personal: TemplateRow[];
  global: TemplateRow[];
}

export interface TemplateDetail {
  id: string;
  schoolId: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  forkedFromId: string | null;
  config: BulletinTemplateConfig;
  isOwn: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: Update `frontend/src/app/(school)/configuration/modele-bulletin/block-label.ts`**

```ts
import type { BlockType } from './types';

export type BlockLabelT = (
  key:
    | 'header'
    | 'studentInfo'
    | 'stats'
    | 'notes'
    | 'absences'
    | 'appreciation'
    | 'signatures'
    | 'text'
    | 'cover'
    | 'criteriaGrids',
) => string;

export function blockLabel(type: BlockType, t: BlockLabelT): string {
  return t(type);
}
```

- [ ] **Step 4: Write `frontend/src/lib/server/bulletin-templates.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  bulletinTemplateConfigSchema,
  normalizeConfig,
  DEFAULT_BULLETIN_CONFIG,
  DEFAULT_PAGE_NUMBER_FORMAT,
} from './bulletin-templates';

function validConfig() {
  return structuredClone(DEFAULT_BULLETIN_CONFIG);
}

describe('bulletinTemplateConfigSchema', () => {
  it('accepts the default config', () => {
    expect(bulletinTemplateConfigSchema.safeParse(validConfig()).success).toBe(true);
  });

  it('rejects duplicate page ids', () => {
    const cfg = validConfig();
    cfg.pages.push(structuredClone(cfg.pages[0]!));
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('rejects duplicate block ids across different pages', () => {
    const cfg = validConfig();
    const secondPage = structuredClone(cfg.pages[0]!);
    secondPage.id = 'page-2';
    cfg.pages.push(secondPage);
    // Both pages now carry a block with id 'header' — unique-within-page
    // but not unique across the whole config.
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('rejects a legacy block type appearing twice on the same page', () => {
    const cfg = validConfig();
    cfg.pages[0]!.blocks.push({ id: 'stats-2', type: 'stats', visible: true });
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('allows a non-legacy block type to repeat on the same page', () => {
    const cfg = validConfig();
    cfg.pages[0]!.blocks.push(
      { id: 'text-1', type: 'text', visible: true, text: 'a', align: 'left', fontSize: 10, bold: false, italic: false },
      { id: 'text-2', type: 'text', visible: true, text: 'b', align: 'left', fontSize: 10, bold: false, italic: false },
    );
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it('rejects breakBefore on a full-layout page', () => {
    const cfg = validConfig();
    cfg.pages[0]!.blocks[0]!.breakBefore = 'column';
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('accepts breakBefore on a halves-layout page', () => {
    const cfg = validConfig();
    cfg.pages[0]!.layout = 'halves';
    cfg.pages[0]!.blocks[0]!.breakBefore = 'column';
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it('rejects more than 6 pages', () => {
    const cfg = validConfig();
    for (let i = 0; i < 6; i++) {
      const p = structuredClone(cfg.pages[0]!);
      p.id = `extra-${i}`;
      p.blocks = [{ id: `extra-block-${i}`, type: 'text', visible: true, text: 'x', align: 'left', fontSize: 10, bold: false, italic: false }];
      cfg.pages.push(p);
    }
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('rejects a page with zero blocks', () => {
    const cfg = validConfig();
    cfg.pages[0]!.blocks = [];
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });
});

describe('normalizeConfig', () => {
  it('converts a legacy flat-blocks config into a single full page, defaulting pageNumberFormat', () => {
    const legacy = {
      primaryColor: '#6c2bd9',
      pageFormat: 'LETTER',
      orientation: 'LANDSCAPE',
      blocks: [
        { id: 'header', visible: true },
        { id: 'stats', visible: false },
      ],
      columns: DEFAULT_BULLETIN_CONFIG.columns,
      signatures: DEFAULT_BULLETIN_CONFIG.signatures,
      typography: DEFAULT_BULLETIN_CONFIG.typography,
      content: { title: 'BULLETIN', footerMessage: null },
      layout: DEFAULT_BULLETIN_CONFIG.layout,
    };

    const result = normalizeConfig(legacy);

    expect(result.pages).toEqual([
      {
        id: 'page-1',
        layout: 'full',
        showPageNumber: false,
        blocks: [
          { id: 'header', type: 'header', visible: true },
          { id: 'stats', type: 'stats', visible: false },
        ],
      },
    ]);
    expect(result.content.pageNumberFormat).toBe(DEFAULT_PAGE_NUMBER_FORMAT);
    expect(result.content.title).toBe('BULLETIN');
  });

  it('returns an already-migrated config unchanged', () => {
    const migrated = validConfig();
    expect(normalizeConfig(migrated)).toEqual(migrated);
  });

  it('the parsed result of a normalized legacy config validates against the full schema', () => {
    const legacy = {
      primaryColor: '#6c2bd9',
      pageFormat: 'LETTER',
      orientation: 'LANDSCAPE',
      blocks: [{ id: 'header', visible: true }],
      columns: DEFAULT_BULLETIN_CONFIG.columns,
      signatures: DEFAULT_BULLETIN_CONFIG.signatures,
      typography: DEFAULT_BULLETIN_CONFIG.typography,
      content: { title: 'BULLETIN', footerMessage: null },
      layout: DEFAULT_BULLETIN_CONFIG.layout,
    };
    expect(bulletinTemplateConfigSchema.safeParse(normalizeConfig(legacy)).success).toBe(true);
  });
});
```

- [ ] **Step 5: Run tests, typecheck, lint, format**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-templates.test.ts`
Expected: PASS (10 tests). Then `pnpm typecheck && pnpm lint` from repo root — expect no errors from this file (callers not yet migrated will fail; that's expected until later tasks — do not fix those here).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/bulletin-templates.ts frontend/src/lib/server/bulletin-templates.test.ts frontend/src/app/\(school\)/configuration/modele-bulletin/types.ts frontend/src/app/\(school\)/configuration/modele-bulletin/block-label.ts
git commit -m "$(cat <<'EOF'
feat(bulletin): pages/blocks config schema and normalizeConfig

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `termLabel`, `BulletinRenderData` relocation, sample data

**Files:**
- Modify: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts`
- Modify: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`
- Modify: `frontend/src/app/(school)/bulletins/types.ts`
- Create: `frontend/src/components/bulletin/render-data.tsx`
- Modify: `frontend/src/components/bulletin/sample-bulletin-data.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 directly (this task doesn't touch `BulletinTemplateConfig`), but is the task that creates `BulletinRenderData`, consumed by every block renderer in Task 3.
- Produces: `StudentBulletinView.termLabel: string` (server), `StudentBulletinData.termLabel: string` + `.qualitativeSubjects` (client), `BulletinRenderData` interface (in `render-data.tsx`, superset of today's shape plus `firstName`, `lastName`, `schoolAddress`, `schoolPhone`, `schoolEmail`, `termLabel`, `academicYearLabel`, `qualitativeSubjects`), `fmt`, `ordinal`, `scoreColor`, `cellStyle`, `StatBox`, `SigBox`.

- [ ] **Step 1: Add `termLabel` to `StudentBulletinView`**

In `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts`, add the field to the interface, right after `academicYearLabel`:

```ts
  academicYearLabel: string;
  termLabel: string;
```

In the `shell` object literal (the one built before the `if (!term) return {...shell, ...}` early-return branch), add the field, computed once so no caller re-derives it:

```ts
    academicYearLabel: academicYear?.label ?? '',
    termLabel: term?.label ?? '',
```

- [ ] **Step 2: Update `get-bulletin-view.test.ts` to assert `termLabel`**

Read the file first, then add `termLabel: '<expected term label from the fixture>'` to each `expect(view).toMatchObject({...})` / `expect(view).toEqual({...})` assertion that lists the shell fields (the two tests named `'staff audience (default) keeps the roster navigation and reads every appreciation'` and `'student audience nulls the roster navigation and reads PUBLISHED rows only'` — read their existing `term` fixture to find the exact label string already mocked, e.g. `'Trimestre 1'`, and use that same string).

- [ ] **Step 3: Add fields to `StudentBulletinData`**

In `frontend/src/app/(school)/bulletins/types.ts`, add after `academicYearLabel`:

```ts
  academicYearLabel: string;
  termLabel: string;
```

And add, after `subjects`:

```ts
  subjects: BulletinSubjectRow[];
  qualitativeSubjects: {
    subjectName: string;
    ratingScale: string[];
    criteria: { label: string; level: number | null }[];
  }[];
```

- [ ] **Step 4: Create `frontend/src/components/bulletin/render-data.tsx`**

```ts
// The single data shape every bulletin block renderer reads from —
// extracted from the old monolithic BulletinCanvas.tsx so both server
// components (print pages) and client components (viewer, editor) can
// import it without going through the component that's being deleted.
// See .planning/banani/report-cards-viewer.md for why the viewer renders
// the school's own configured layout rather than reproducing Banani's
// (differently-styled) mockup.
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';

export interface BulletinSubjectRow {
  name: string;
  coefficient: number | null;
  average: number | null;
  classAverage: number | null;
  min: number | null;
  max: number | null;
  appreciation: string | null;
}

export interface BulletinRenderData {
  schoolName: string;
  schoolLogoUrl: string | null;
  directorSignatureUrl: string | null;
  period: string;
  academicYear: string;
  studentName: string;
  className: string;
  classSize: number;
  studentNumber: string;
  subjects: BulletinSubjectRow[];
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  generalAppreciation: string | null;
  absencesDays: number | null;
  retards: number | null;
  // Gained for the pages engine (spec §10.2) — additive: the fields above
  // stay as-is so the 7 legacy block renderers are unchanged verbatim.
  firstName: string;
  lastName: string;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  termLabel: string;
  academicYearLabel: string;
  qualitativeSubjects: {
    subjectName: string;
    ratingScale: string[];
    criteria: { label: string; level: number | null }[];
  }[];
}

export function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(2);
}
export function ordinal(n: number | null): string {
  return n == null ? '—' : `${n}${n === 1 ? 'er' : 'ème'}`;
}
export function scoreColor(avg: number | null): string {
  if (avg == null) return '#8884a0';
  if (avg < 8) return '#d93025';
  if (avg < 12) return '#f59e0b';
  return '#1a9e5c';
}
export function cellStyle(
  config: BulletinTemplateConfig,
  extra?: React.CSSProperties,
): React.CSSProperties {
  return {
    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
    borderBottomWidth: config.layout.borderWidth,
    borderBottomStyle: config.layout.borderStyle,
    borderBottomColor: config.layout.borderColor,
    ...extra,
  };
}

export function StatBox({
  label,
  value,
  color,
  tint,
}: {
  label: string;
  value: string;
  color: string;
  tint?: string;
}) {
  return (
    <div
      className="flex-1 rounded-md p-2.5 text-center"
      style={{ background: tint ?? `${color}0d` }}
    >
      <div className="text-base font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function SigBox({
  label,
  color,
  imageUrl,
  size = 32,
}: {
  label: string;
  color: string;
  imageUrl?: string | null;
  size?: number;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-end gap-1 rounded-md border-[1.5px] border-dashed p-2.5 pb-1.5"
      style={{ borderColor: `${color}80`, minHeight: Math.max(54, size + 22) }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={label}
          className="mb-1 w-auto object-contain"
          style={{ height: size }}
        />
      )}
      <div className="text-center text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}
```

- [ ] **Step 5: Update `sample-bulletin-data.ts`**

```ts
import type { BulletinRenderData } from './render-data';

// Illustrative-only fixture — used by the template editor's live preview
// AND by the server-side template PDF export (app/print/bulletin-template-preview)
// so a template author can see/export a realistic-looking bulletin without
// needing real class data. The Viewer builds the real BulletinRenderData
// shape from actual grades/appreciations for whichever student is being
// viewed — this fixture never reaches a real bulletin.
export const SAMPLE_BULLETIN_DATA: BulletinRenderData = {
  schoolName: 'École LesÉtoiles',
  schoolLogoUrl: null,
  directorSignatureUrl: null,
  period: 'Trimestre 2',
  academicYear: '2024–2025',
  studentName: 'Jean-Pierre M.',
  className: '3ème A',
  classSize: 28,
  studentNumber: 'N° 2024-0047',
  subjects: [
    {
      name: 'Mathématiques',
      coefficient: 4,
      average: 15.67,
      classAverage: 12.8,
      min: 6.5,
      max: 19.0,
      appreciation: 'Très bon trimestre',
    },
    {
      name: 'Français',
      coefficient: 4,
      average: 12.0,
      classAverage: 11.4,
      min: 5.0,
      max: 17.5,
      appreciation: 'Peut mieux faire',
    },
    {
      name: 'Sciences',
      coefficient: 3,
      average: 18.0,
      classAverage: 13.2,
      min: 8.0,
      max: 20.0,
      appreciation: 'Excellent travail',
    },
    {
      name: 'Anglais',
      coefficient: 3,
      average: 10.0,
      classAverage: 12.1,
      min: 4.5,
      max: 18.0,
      appreciation: 'Efforts nécessaires',
    },
    {
      name: 'Histoire-Géo',
      coefficient: 2,
      average: 16.5,
      classAverage: 11.9,
      min: 7.0,
      max: 19.5,
      appreciation: 'Très bonne maîtrise',
    },
  ],
  overallAverage: 14.38,
  classAverage: 12.5,
  rank: 4,
  rankedCount: 28,
  generalAppreciation:
    "Élève sérieux et investi qui fait preuve d'une bonne volonté dans l'ensemble des matières. Les résultats en sciences sont excellents et encourageants. Des efforts supplémentaires sont attendus en anglais pour consolider les acquis. Continuez ainsi !",
  absencesDays: 3,
  retards: 1,
  firstName: 'Jean-Pierre',
  lastName: 'M.',
  schoolAddress: '12 Rue des Écoles, Port-au-Prince',
  schoolPhone: '+509 1234 5678',
  schoolEmail: 'contact@lesetoiles.edu.ht',
  termLabel: 'Trimestre 2',
  academicYearLabel: '2024–2025',
  qualitativeSubjects: [
    {
      subjectName: 'Comportement',
      ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
      criteria: [
        { label: 'Respecte les consignes', level: 0 },
        { label: "Participe à l'oral", level: 1 },
        { label: 'Respecte ses camarades', level: 0 },
        { label: 'Range son matériel', level: 2 },
        { label: 'Fait preuve de politesse', level: 0 },
      ],
    },
    {
      subjectName: 'Développement physique',
      ratingScale: ['Excellent', 'Très bien', 'Bien', 'Assez bien'],
      criteria: [
        { label: 'Motricité globale', level: 1 },
        { label: 'Motricité fine', level: 0 },
        { label: 'Coordination', level: 1 },
        { label: 'Autonomie corporelle', level: 2 },
        { label: 'Endurance', level: 1 },
      ],
    },
  ],
};
```

- [ ] **Step 6: Run tests, typecheck**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`
Expected: PASS. `pnpm typecheck` will still report errors in files not yet migrated (`BulletinCanvas.tsx` importing the old local `BulletinRenderData`, `BulletinViewer.tsx`, editor, print pages, `sample-bulletin-data.ts`'s old importers) — expected until Tasks 3-8 land; do not fix those files here.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts frontend/src/app/\(school\)/bulletins/types.ts frontend/src/components/bulletin/render-data.tsx frontend/src/components/bulletin/sample-bulletin-data.ts
git commit -m "$(cat <<'EOF'
feat(bulletin): termLabel + relocate BulletinRenderData + qualitative sample data

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Block renderer files (all 10 types) + registry

**Files:**
- Create: `frontend/src/components/bulletin/blocks/header.tsx`
- Create: `frontend/src/components/bulletin/blocks/studentInfo.tsx`
- Create: `frontend/src/components/bulletin/blocks/stats.tsx`
- Create: `frontend/src/components/bulletin/blocks/notes.tsx`
- Create: `frontend/src/components/bulletin/blocks/absences.tsx`
- Create: `frontend/src/components/bulletin/blocks/appreciation.tsx`
- Create: `frontend/src/components/bulletin/blocks/signatures.tsx`
- Create: `frontend/src/components/bulletin/blocks/text.tsx`
- Create: `frontend/src/components/bulletin/blocks/cover.tsx`
- Create: `frontend/src/components/bulletin/blocks/criteriaGrids.tsx`
- Create: `frontend/src/components/bulletin/blocks/index.ts`

**Interfaces:**
- Consumes: `BulletinRenderData`, `cellStyle`, `fmt`, `ordinal`, `scoreColor`, `StatBox`, `SigBox` from `render-data.tsx` (Task 2); `Block`, `BulletinTemplateConfig`, block-specific interfaces from `configuration/modele-bulletin/types.ts` (Task 1).
- Produces: `renderBlock(props: { block: Block; config: BulletinTemplateConfig; data: BulletinRenderData }): React.ReactNode`, exported from `blocks/index.ts` — the single entry point Task 4's `BulletinPage.tsx` uses to render any block.

None of these files carry `'use client'` — they are pure functions with no hooks or event handlers (the wrapping div with click/drag handlers lives in `BulletinPage.tsx`, added in Task 4, exactly like today's `wrap()` in `BulletinCanvas.tsx`).

- [ ] **Step 1: `blocks/header.tsx`**

```tsx
import { LayoutTemplate } from 'lucide-react';
import type { HeaderBlock, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// Renders combined with studentInfo by BulletinPage.tsx's fixed top row —
// this file only renders the LEFT half of that row (logo, school name,
// title, period line). See Ruling R4 in
// docs/superpowers/plans/2026-09-05-bulletin-pages-engine.md.
export function render({
  config,
  data,
}: {
  block: HeaderBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const logoSize = config.layout.logoSize ?? 52;
  return (
    <>
      {data.schoolLogoUrl ? (
        <img
          src={data.schoolLogoUrl}
          alt={data.schoolName}
          className="shrink-0 rounded-md object-contain"
          style={{ height: logoSize, width: logoSize }}
        />
      ) : (
        <div
          className="flex shrink-0 items-center justify-center rounded-md border-[1.5px] border-dashed"
          style={{
            height: logoSize,
            width: logoSize,
            borderColor: `${config.primaryColor}80`,
            background: `${config.primaryColor}0d`,
          }}
        >
          <LayoutTemplate size={18} style={{ color: `${config.primaryColor}80` }} />
        </div>
      )}
      <div className="flex flex-1 flex-col items-center gap-0.5">
        <div
          className="font-extrabold"
          style={{ color: config.primaryColor, fontSize: config.typography.schoolName }}
        >
          {data.schoolName}
        </div>
        <div
          className="font-black tracking-widest text-[#1a1a2e] uppercase"
          style={{ fontSize: config.typography.title }}
        >
          {config.content.title}
        </div>
        <div className="text-[10px] text-muted-foreground">
          Année {data.academicYear} · {data.period}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: `blocks/studentInfo.tsx`**

```tsx
import type { StudentInfoBlock, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// Renders the RIGHT half of BulletinPage.tsx's fixed top row. See
// blocks/header.tsx and Ruling R4.
export function render({
  config,
  data,
}: {
  block: StudentInfoBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  return (
    <div
      className="min-w-[150px] rounded-md border p-2.5 text-right"
      style={{
        background: `${config.primaryColor}0d`,
        borderColor: `${config.primaryColor}30`,
      }}
    >
      <div className="text-xs font-extrabold text-[#1a1a2e] uppercase">{data.studentName}</div>
      <div className="mt-0.5 text-[10px] text-[#6b6b8d]">
        {data.className} · Effectif : {data.classSize}
      </div>
      <div className="text-[9px] text-muted-foreground">{data.studentNumber}</div>
    </div>
  );
}
```

- [ ] **Step 3: `blocks/stats.tsx`**

```tsx
import type { StatsBlock, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { fmt, ordinal, StatBox } from '../render-data';

export function render({
  config,
  data,
}: {
  block: StatsBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  return (
    <div className="flex gap-2.5">
      <StatBox
        label="Moyenne générale"
        value={fmt(data.overallAverage)}
        color={config.primaryColor}
      />
      {config.columns.rank && (
        <StatBox label="Rang dans la classe" value={ordinal(data.rank)} color="#1a9e5c" />
      )}
      {config.columns.absences && (
        <>
          <StatBox
            label="Absences (j.)"
            value={data.absencesDays == null ? '—' : String(data.absencesDays)}
            color="#f59e0b"
            tint="#fff8e1"
          />
          <StatBox
            label="Retards"
            value={data.retards == null ? '—' : String(data.retards)}
            color="#f59e0b"
            tint="#fff8e1"
          />
        </>
      )}
      <StatBox label="Moy. classe" value={fmt(data.classAverage)} color="#d93025" tint="#fdecea" />
    </div>
  );
}
```

- [ ] **Step 4: `blocks/notes.tsx`**

```tsx
import type { NotesBlock, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { cellStyle, fmt, ordinal, scoreColor } from '../render-data';

export function render({
  config,
  data,
}: {
  block: NotesBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  return (
    <table className="w-full border-collapse" style={{ lineHeight: config.layout.tableLineHeight }}>
      <thead>
        <tr style={{ background: config.primaryColor }}>
          <th
            className="text-left font-bold text-white"
            style={{
              padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
              fontSize: config.typography.tableHeader,
            }}
          >
            Matière
          </th>
          {config.columns.coefficient && (
            <th
              className="text-left font-bold text-white"
              style={{
                padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                fontSize: config.typography.tableHeader,
              }}
            >
              Coeff.
            </th>
          )}
          <th
            className="text-left font-bold text-white"
            style={{
              padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
              fontSize: config.typography.tableHeader,
            }}
          >
            Moy. élève
          </th>
          {config.columns.classAverage && (
            <th
              className="text-left font-bold text-white"
              style={{
                padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                fontSize: config.typography.tableHeader,
              }}
            >
              Moy. classe
            </th>
          )}
          {config.columns.minMax && (
            <>
              <th
                className="text-left font-bold text-white"
                style={{
                  padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                  fontSize: config.typography.tableHeader,
                }}
              >
                Min.
              </th>
              <th
                className="text-left font-bold text-white"
                style={{
                  padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                  fontSize: config.typography.tableHeader,
                }}
              >
                Max.
              </th>
            </>
          )}
          {config.columns.appreciation && (
            <th
              className="text-left font-bold text-white"
              style={{
                padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                fontSize: config.typography.tableHeader,
              }}
            >
              Appréciation
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {data.subjects.map((s, i) => (
          <tr
            key={s.name}
            style={
              config.layout.showTableBackgrounds && i % 2 === 1
                ? { background: '#faf9ff' }
                : undefined
            }
          >
            <td style={cellStyle(config, { fontSize: config.typography.tableBody })}>
              <strong>{s.name}</strong>
            </td>
            {config.columns.coefficient && (
              <td style={cellStyle(config, { fontSize: config.typography.noteValue })}>
                {s.coefficient ?? '—'}
              </td>
            )}
            <td
              className="font-bold"
              style={cellStyle(config, {
                color: scoreColor(s.average),
                fontSize: config.typography.noteValue,
              })}
            >
              {fmt(s.average)}
            </td>
            {config.columns.classAverage && (
              <td style={cellStyle(config, { fontSize: config.typography.noteValue })}>
                {fmt(s.classAverage)}
              </td>
            )}
            {config.columns.minMax && (
              <>
                <td style={cellStyle(config, { fontSize: config.typography.noteValue })}>
                  {fmt(s.min)}
                </td>
                <td style={cellStyle(config, { fontSize: config.typography.noteValue })}>
                  {fmt(s.max)}
                </td>
              </>
            )}
            {config.columns.appreciation && (
              <td
                className="text-[#6b6b8d] italic"
                style={cellStyle(config, { fontSize: config.typography.noteValue })}
              >
                {s.appreciation ?? '—'}
              </td>
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr
          style={{
            borderTopWidth: config.layout.borderWidth || 1,
            borderTopStyle: config.layout.borderStyle,
            borderTopColor: config.primaryColor,
            ...(config.layout.showTableBackgrounds
              ? { background: `${config.primaryColor}14` }
              : undefined),
          }}
        >
          <td
            className="font-bold"
            colSpan={1 + (config.columns.coefficient ? 1 : 0)}
            style={{
              padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
              fontSize: config.typography.tableBody,
            }}
          >
            Moyenne générale
          </td>
          <td
            colSpan={
              1 +
              (config.columns.classAverage ? 1 : 0) +
              (config.columns.minMax ? 2 : 0) +
              (config.columns.appreciation ? 1 : 0)
            }
            style={{ padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px` }}
          >
            <span className="font-bold" style={{ fontSize: 12, color: config.primaryColor }}>
              {fmt(data.overallAverage)} / 20
            </span>
            <span className="ml-2.5 text-muted-foreground" style={{ fontSize: 10 }}>
              Rang : {ordinal(data.rank)} / {data.rankedCount} élèves
            </span>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
```

- [ ] **Step 5: `blocks/absences.tsx`**

```tsx
import { CalendarX } from 'lucide-react';
import type { AbsencesBlock, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

export function render({
  data,
}: {
  block: AbsencesBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  return (
    <div>
      <div className="mb-1.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
        Absences &amp; Retards
      </div>
      <div className="flex gap-1.5">
        <div className="flex flex-1 items-center gap-1.5 rounded-md bg-[#fff8e1] px-2.5 py-1.5">
          <CalendarX size={14} className="shrink-0 text-[#f59e0b]" />
          <div>
            <div className="text-caption font-extrabold text-[#f59e0b]">
              {data.absencesDays == null ? '—' : `${data.absencesDays} jours`}
            </div>
            <div className="text-[9px] text-muted-foreground">Absences totales</div>
          </div>
        </div>
        <div className="flex flex-1 items-center gap-1.5 rounded-md bg-[#fdecea] px-2.5 py-1.5">
          <CalendarX size={14} className="shrink-0 text-[#d93025]" />
          <div>
            <div className="text-caption font-extrabold text-[#d93025]">
              {data.retards == null ? '—' : data.retards}
            </div>
            <div className="text-[9px] text-muted-foreground">Retards</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `blocks/appreciation.tsx`**

```tsx
import type { AppreciationBlock, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// `style: 'lines'` renders the general appreciation as ruled lines instead
// of the default boxed paragraph — spec §9.1: "le texte de l'appréciation
// générale posé sur N lignes réglées, lignes vides si absent."
export function render({
  block,
  data,
}: {
  block: AppreciationBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  if (block.style === 'lines') {
    const lineCount = block.lines ?? 3;
    const text = data.generalAppreciation ?? '';
    return (
      <div>
        <div className="mb-1.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
          Appréciation générale du conseil de classe
        </div>
        <div>
          {Array.from({ length: lineCount }).map((_, i) => (
            <div
              key={i}
              className="border-b border-[#c9c4dd] text-2xs leading-[22px] text-[#1a1a2e] italic"
            >
              {i === 0 ? text : ''}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#e8e4f6] bg-[#faf9ff] p-2.5">
      <div className="mb-1 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
        Appréciation générale du conseil de classe
      </div>
      <div className="text-2xs leading-relaxed text-[#1a1a2e] italic">
        {data.generalAppreciation || 'Aucune appréciation générale saisie.'}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `blocks/signatures.tsx`**

```tsx
import type { SignaturesBlock, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { SigBox } from '../render-data';

export function render({
  block,
  config,
  data,
}: {
  block: SignaturesBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  return (
    <div>
      <div className="mb-1.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
        Signatures
      </div>
      <div className="flex gap-3.5">
        {config.signatures.director && (
          <SigBox
            label={block.labels?.director ?? 'Signature du Directeur'}
            color={config.primaryColor}
            imageUrl={data.directorSignatureUrl}
            size={config.layout.signatureSize ?? 32}
          />
        )}
        {config.signatures.homeroom && (
          <SigBox
            label={block.labels?.homeroom ?? 'Signature du Titulaire de classe'}
            color={config.primaryColor}
          />
        )}
        {config.signatures.guardian && (
          <SigBox
            label={block.labels?.guardian ?? 'Signature du Parent / Tuteur'}
            color={config.primaryColor}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: `blocks/text.tsx`**

```tsx
import type { TextBlock, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

const ALIGN_CLASS: Record<TextBlock['align'], string> = {
  left: 'text-left',
  center: 'text-center',
  justify: 'text-justify',
};

export function render({
  block,
}: {
  block: TextBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const paragraphs = block.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div
      className={ALIGN_CLASS[block.align]}
      style={{
        fontSize: block.fontSize,
        fontWeight: block.bold ? 700 : 400,
        fontStyle: block.italic ? 'italic' : 'normal',
      }}
    >
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-2 whitespace-pre-line last:mb-0">
          {p}
        </p>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: `blocks/cover.tsx`**

```tsx
import { LayoutTemplate } from 'lucide-react';
import type { CoverBlock, CoverField, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

const FIELD_LABEL: Record<CoverField, string> = {
  lastName: 'Nom',
  firstName: 'Prénom',
  className: 'Classe',
  studentNumber: 'Code',
  academicYear: 'Année Académique',
};

function fieldValue(field: CoverField, data: BulletinRenderData): string {
  switch (field) {
    case 'lastName':
      return data.lastName;
    case 'firstName':
      return data.firstName;
    case 'className':
      return data.className;
    case 'studentNumber':
      return data.studentNumber;
    case 'academicYear':
      return data.academicYearLabel;
  }
}

export function render({
  block,
  config,
  data,
}: {
  block: CoverBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const title = block.titlePattern.replace('{term}', data.termLabel);
  const content = (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      {block.showLogo &&
        (data.schoolLogoUrl ? (
          <img
            src={data.schoolLogoUrl}
            alt={data.schoolName}
            className="h-16 w-16 rounded-md object-contain"
          />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-md border-[1.5px] border-dashed"
            style={{ borderColor: `${config.primaryColor}80`, background: `${config.primaryColor}0d` }}
          >
            <LayoutTemplate size={22} style={{ color: `${config.primaryColor}80` }} />
          </div>
        ))}
      <div
        className="rounded-md border-2 px-4 py-2 font-black uppercase"
        style={{ borderColor: config.primaryColor, color: config.primaryColor, fontSize: config.typography.schoolName }}
      >
        {data.schoolName}
      </div>
      {data.schoolAddress && <div className="text-2xs text-muted-foreground">{data.schoolAddress}</div>}
      {data.schoolPhone && <div className="text-2xs text-muted-foreground">{data.schoolPhone}</div>}
      <div className="text-xs font-semibold tracking-wide text-[#1a1a2e] uppercase">
        {block.sectionLabel}
      </div>
      <div className="font-black uppercase" style={{ fontSize: config.typography.title, color: config.primaryColor }}>
        {title}
      </div>
      <div className="mt-4 flex w-full max-w-xs flex-col gap-2 text-left">
        {block.fields.map((field) => (
          <div key={field} className="flex items-baseline gap-2 border-b border-[#c9c4dd] pb-1">
            <span className="shrink-0 text-2xs font-semibold text-muted-foreground">
              {FIELD_LABEL[field]} :
            </span>
            <span className="text-xs text-[#1a1a2e]">{fieldValue(field, data) || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
  if (!block.framed) return content;
  return (
    <div className="h-full rounded-2xl border-2 border-dashed" style={{ borderColor: config.primaryColor }}>
      {content}
    </div>
  );
}
```

- [ ] **Step 10: `blocks/criteriaGrids.tsx`**

```tsx
import type { CriteriaGridsBlock, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

export function render({
  block,
  config,
  data,
}: {
  block: CriteriaGridsBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  if (data.qualitativeSubjects.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {data.qualitativeSubjects.map((subject) => (
        <table
          key={subject.subjectName}
          className="w-full border-collapse"
          style={{ breakInside: 'avoid', lineHeight: config.layout.tableLineHeight }}
        >
          <caption
            className="mb-1 text-left font-extrabold uppercase"
            style={{ fontSize: config.typography.tableBody, color: config.primaryColor }}
          >
            {subject.subjectName}
          </caption>
          {block.showScaleHeader !== false && (
            <thead>
              <tr style={{ background: config.primaryColor }}>
                <th
                  className="text-left font-bold text-white"
                  style={{
                    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                    fontSize: config.typography.tableHeader,
                  }}
                >
                  Critère
                </th>
                {subject.ratingScale.map((label) => (
                  <th
                    key={label}
                    className="text-center font-bold text-white"
                    style={{
                      padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
                      fontSize: config.typography.tableHeader,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {subject.criteria.map((criterion) => (
              <tr key={criterion.label}>
                <td style={{ padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`, fontSize: config.typography.tableBody }}>
                  {criterion.label}
                </td>
                {subject.ratingScale.map((_, levelIndex) => (
                  <td
                    key={levelIndex}
                    className="text-center"
                    style={{ padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`, fontSize: config.typography.noteValue }}
                  >
                    {criterion.level === levelIndex ? '✓' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}
```

- [ ] **Step 11: `blocks/index.ts` — the registry**

```ts
import type { Block, BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { render as renderHeader } from './header';
import { render as renderStudentInfo } from './studentInfo';
import { render as renderStats } from './stats';
import { render as renderNotes } from './notes';
import { render as renderAbsences } from './absences';
import { render as renderAppreciation } from './appreciation';
import { render as renderSignatures } from './signatures';
import { render as renderText } from './text';
import { render as renderCover } from './cover';
import { render as renderCriteriaGrids } from './criteriaGrids';

export function renderBlock({
  block,
  config,
  data,
}: {
  block: Block;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  switch (block.type) {
    case 'header':
      return renderHeader({ block, config, data });
    case 'studentInfo':
      return renderStudentInfo({ block, config, data });
    case 'stats':
      return renderStats({ block, config, data });
    case 'notes':
      return renderNotes({ block, config, data });
    case 'absences':
      return renderAbsences({ block, config, data });
    case 'appreciation':
      return renderAppreciation({ block, config, data });
    case 'signatures':
      return renderSignatures({ block, config, data });
    case 'text':
      return renderText({ block, config, data });
    case 'cover':
      return renderCover({ block, config, data });
    case 'criteriaGrids':
      return renderCriteriaGrids({ block, config, data });
  }
}
```

- [ ] **Step 12: Typecheck this directory in isolation**

Run: `pnpm typecheck` — expect errors ONLY in files this plan hasn't migrated yet (`BulletinCanvas.tsx`, `BulletinViewer.tsx`, editor, print pages). Every file created in this task must show zero errors of its own.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/components/bulletin/blocks
git commit -m "$(cat <<'EOF'
feat(bulletin): per-type block renderer files and registry

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `BulletinPage` + `BulletinDocument`

**Files:**
- Create: `frontend/src/components/bulletin/BulletinPage.tsx`
- Create: `frontend/src/components/bulletin/BulletinDocument.tsx`

**Interfaces:**
- Consumes: `renderBlock` from `blocks/index.ts` (Task 3); `Page`, `Block`, `BulletinTemplateConfig` from `types.ts` (Task 1); `BulletinRenderData` from `render-data.tsx` (Task 2); `getPageWidthPx`/`getPageHeightPx`/`PAGE_PX_PER_IN`/`PAGE_SIZES_IN` from `page-size.ts` (unchanged).
- Produces: `BulletinPage` (props below), `BulletinDocument` (props below), `PAGE_GAP_PX` (exported constant, natural/unscaled px gap between stacked sheets — Task 6's viewer needs it to compute total scaled height).

```ts
// BulletinPage props
{
  page: Page;
  pageIndex: number;       // 0-based, for the page-number footer's {n}
  totalPages: number;      // for the page-number footer's {total}
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
  chrome?: boolean;        // default true, same meaning as BulletinCanvas's chrome prop
  selected?: { pageId: string; blockId: string } | undefined;
  onSelect?: (pageId: string, blockId: string) => void;
  dragBlockId?: string | null;
  onDragStart?: (blockId: string) => void;
  onDrop?: (blockId: string) => void;
  onDragEnd?: () => void;
}

// BulletinDocument props
{
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
  chrome?: boolean;
  selected?: { pageId: string; blockId: string } | undefined;
  onSelect?: (pageId: string, blockId: string) => void;
  dragBlockId?: string | null;
  onDragStart?: (blockId: string) => void;
  onDrop?: (blockId: string) => void;
  onDragEnd?: () => void;
}
```

- [ ] **Step 1: `frontend/src/components/bulletin/BulletinPage.tsx`**

```tsx
'use client';

import { GripVertical } from 'lucide-react';
import { DRAGGABLE_BLOCK_TYPES, type Page, type BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from './render-data';
import { renderBlock } from './blocks';
import { render as renderHeader } from './blocks/header';
import { render as renderStudentInfo } from './blocks/studentInfo';
import { getPageHeightPx } from './page-size';

export function BulletinPage({
  page,
  pageIndex,
  totalPages,
  config,
  data,
  chrome = true,
  selected,
  onSelect,
  dragBlockId,
  onDragStart,
  onDrop,
  onDragEnd,
}: {
  page: Page;
  pageIndex: number;
  totalPages: number;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
  chrome?: boolean;
  selected?: { pageId: string; blockId: string } | undefined;
  onSelect?: (pageId: string, blockId: string) => void;
  dragBlockId?: string | null;
  onDragStart?: (blockId: string) => void;
  onDrop?: (blockId: string) => void;
  onDragEnd?: () => void;
}) {
  const interactive = onSelect != null;
  const draggingEnabled = onDragStart != null && onDrop != null;

  const headerBlock = page.blocks.find((b) => b.type === 'header');
  const studentInfoBlock = page.blocks.find((b) => b.type === 'studentInfo');
  const restBlocks = page.blocks.filter((b) => b.type !== 'header' && b.type !== 'studentInfo');
  const showTopRow = (headerBlock?.visible ?? false) || (studentInfoBlock?.visible ?? false);

  const wrap = (block: (typeof restBlocks)[number], content: React.ReactNode) => {
    if (!block.visible) return null;
    const reorderable = draggingEnabled && DRAGGABLE_BLOCK_TYPES.includes(block.type);
    const isLastVisible =
      restBlocks.filter((b) => b.visible).slice(-1)[0]?.id === block.id;
    return (
      <div
        key={block.id}
        onClick={() => onSelect?.(page.id, block.id)}
        draggable={reorderable}
        onDragStart={reorderable ? () => onDragStart?.(block.id) : undefined}
        onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
        onDrop={reorderable ? () => onDrop?.(block.id) : undefined}
        onDragEnd={reorderable ? onDragEnd : undefined}
        style={{
          marginBottom: config.layout.blockSpacing,
          marginTop: block.type === 'signatures' && isLastVisible ? 'auto' : undefined,
          opacity: dragBlockId === block.id ? 0.4 : 1,
          breakInside: block.breakBefore ? undefined : 'avoid',
          breakBefore: block.breakBefore === 'column' ? 'column' : undefined,
          flexShrink: 0,
        }}
        className={`relative rounded ${interactive ? 'cursor-pointer' : ''} ${reorderable ? 'cursor-grab' : ''} ${
          selected?.pageId === page.id && selected.blockId === block.id
            ? 'outline outline-2 outline-primary'
            : ''
        }`}
      >
        {reorderable && (
          <span className="absolute top-1/2 -left-5 -translate-y-1/2 text-muted-foreground">
            <GripVertical size={14} />
          </span>
        )}
        {content}
      </div>
    );
  };

  const pageNumberText = config.content.pageNumberFormat
    .replace('{n}', String(pageIndex + 1))
    .replace('{total}', String(totalPages));

  return (
    <div
      className={`print-bulletin-canvas bulletin-print-root relative flex flex-col bg-white ${chrome ? 'overflow-hidden rounded-[2px] shadow-2xl' : ''}`}
      style={{ minHeight: getPageHeightPx(config) }}
    >
      <div
        className="h-1.5 shrink-0"
        style={{
          background: `linear-gradient(90deg, ${config.primaryColor}, var(--color-bulletin-gradient-end))`,
        }}
      />

      {showTopRow && (
        <div
          onClick={() => onSelect?.(page.id, (headerBlock ?? studentInfoBlock)!.id)}
          className={`flex shrink-0 items-center gap-0 border-b-[1.5px] px-5 py-3.5 ${interactive ? 'cursor-pointer' : ''}`}
          style={{ borderColor: `${config.primaryColor}30`, background: '#fdfcff' }}
        >
          {headerBlock?.visible && renderHeader({ block: headerBlock, config, data })}
          {studentInfoBlock?.visible && renderStudentInfo({ block: studentInfoBlock, config, data })}
        </div>
      )}

      <div
        className="flex flex-1 flex-col"
        style={{
          padding: config.layout.pageMargin,
          columnCount: page.layout === 'halves' ? 2 : undefined,
          columnGap: page.layout === 'halves' ? config.layout.blockSpacing * 2 : undefined,
        }}
      >
        {restBlocks.map((block) => wrap(block, renderBlock({ block, config, data })))}

        {config.content.footerMessage && (
          <div
            className="shrink-0 text-center text-muted-foreground italic"
            style={{ fontSize: config.typography.footer }}
          >
            {config.content.footerMessage}
          </div>
        )}
      </div>

      {page.showPageNumber && (
        <div
          className="shrink-0 pb-2 text-center text-muted-foreground"
          style={{ fontSize: config.typography.footer }}
        >
          {pageNumberText}
        </div>
      )}

      <div
        className="h-1.5 shrink-0"
        style={{
          background: `linear-gradient(90deg, ${config.primaryColor}, var(--color-bulletin-gradient-end))`,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: `frontend/src/components/bulletin/BulletinDocument.tsx`**

```tsx
'use client';

import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from './render-data';
import { BulletinPage } from './BulletinPage';

// Natural (unscaled) px gap between stacked sheets — exported so callers
// that scale the whole document (BulletinViewer, the editor) can compute
// the total document height without duplicating this constant.
export const PAGE_GAP_PX = 24;

export function BulletinDocument({
  config,
  data,
  chrome = true,
  selected,
  onSelect,
  dragBlockId,
  onDragStart,
  onDrop,
  onDragEnd,
}: {
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
  chrome?: boolean;
  selected?: { pageId: string; blockId: string } | undefined;
  onSelect?: (pageId: string, blockId: string) => void;
  dragBlockId?: string | null;
  onDragStart?: (blockId: string) => void;
  onDrop?: (blockId: string) => void;
  onDragEnd?: () => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: PAGE_GAP_PX }}>
      {config.pages.map((page, index) => (
        <div
          key={page.id}
          style={index < config.pages.length - 1 ? { breakAfter: 'page' } : undefined}
        >
          <BulletinPage
            page={page}
            pageIndex={index}
            totalPages={config.pages.length}
            config={config}
            data={data}
            chrome={chrome}
            selected={selected}
            onSelect={onSelect}
            dragBlockId={dragBlockId}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck` — no errors from `BulletinPage.tsx`/`BulletinDocument.tsx` themselves.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/bulletin/BulletinPage.tsx frontend/src/components/bulletin/BulletinDocument.tsx
git commit -m "$(cat <<'EOF'
feat(bulletin): BulletinPage and BulletinDocument, one sheet per config page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Migrate the 2 print pages

**Files:**
- Modify: `frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx`
- Modify: `frontend/src/app/print/bulletin-template-preview/page.tsx`

**Interfaces:**
- Consumes: `BulletinDocument` (Task 4), `normalizeConfig` (Task 1, real print page only), `BulletinRenderData` (Task 2), `SAMPLE_BULLETIN_DATA` (Task 2).

- [ ] **Step 1: Rewrite `frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx`**

```tsx
import { verifyPrintToken } from '@/lib/server/bulletin-pdf/print-token';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { normalizeConfig } from '@/lib/server/bulletin-templates';
import { BulletinDocument } from '@/components/bulletin/BulletinDocument';
import type { BulletinRenderData } from '@/components/bulletin/render-data';

export const dynamic = 'force-dynamic';

// Standalone print target for the server-side PDF pipeline (Puppeteer
// navigates here, see lib/server/bulletin-pdf/generate.ts). Authorized by a
// short-lived signed token bound to exactly one (schoolId, studentId,
// termId) tuple — never a session cookie, since headless Chromium has no
// browser session. Renders the same BulletinDocument the Viewer shows on
// screen, so the generated PDF is byte-for-byte what a school configured.
export default async function PrintBulletinPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string; termId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { studentId, termId } = await params;
  const { token } = await searchParams;

  const payload = token ? verifyPrintToken(token) : null;
  if (!payload || payload.studentId !== studentId || payload.termId !== termId) {
    return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Lien invalide ou expiré.</p>;
  }

  const view = await getStudentBulletinView(
    payload.schoolId,
    studentId,
    termId,
    payload.audience ?? 'staff',
  );
  if (!view || !view.template) {
    return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Bulletin indisponible.</p>;
  }

  const config = normalizeConfig(view.template.config);
  const renderData: BulletinRenderData = {
    schoolName: view.schoolName,
    schoolLogoUrl: view.schoolLogoUrl,
    directorSignatureUrl: view.directorSignatureUrl,
    period: view.termLabel,
    academicYear: view.academicYearLabel,
    studentName: `${view.firstName} ${view.lastName}`,
    className: view.className,
    classSize: view.classSize,
    studentNumber: `N° ${view.studentNumber}`,
    subjects: view.subjects.map((s) => ({
      name: s.subjectName,
      coefficient: s.coefficient,
      average: s.average,
      classAverage: s.classAverage,
      min: s.min,
      max: s.max,
      appreciation: s.appreciation,
    })),
    overallAverage: view.overallAverage,
    classAverage: view.classAverage,
    rank: view.rank,
    rankedCount: view.rankedCount,
    generalAppreciation: view.generalAppreciation,
    absencesDays: null,
    retards: null,
    firstName: view.firstName,
    lastName: view.lastName,
    schoolAddress: view.schoolAddress,
    schoolPhone: view.schoolPhone,
    schoolEmail: view.schoolEmail,
    termLabel: view.termLabel,
    academicYearLabel: view.academicYearLabel,
    qualitativeSubjects: view.qualitativeSubjects,
  };

  return (
    <>
      {/* Puppeteer prints with preferCSSPageSize -> this @page rule drives
          the actual paper size + orientation. margin:0 is deliberate — the
          PDF must be a literal 1:1 match of the on-screen Viewer, which
          renders the bulletin edge-to-edge with no outer gutter. Any
          spacing the school wants around the content is authored inside
          the template itself (config.layout.pageMargin), not injected
          here. chrome={false} strips the on-screen card look (shadow,
          rounded corners) so the PDF is the real page, not a floating
          card. Each sheet already carries its own break-after:page (see
          BulletinDocument.tsx) except the last one. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@page{size:${config.pageFormat === 'LETTER' ? 'letter' : 'A4'} ${config.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait'};margin:0} body{margin:0}`,
        }}
      />
      <BulletinDocument config={config} data={renderData} chrome={false} />
    </>
  );
}
```

- [ ] **Step 2: Rewrite `frontend/src/app/print/bulletin-template-preview/page.tsx`**

```tsx
import { verifyTemplatePreviewToken } from '@/lib/server/bulletin-pdf/print-token';
import { BulletinDocument } from '@/components/bulletin/BulletinDocument';
import { SAMPLE_BULLETIN_DATA } from '@/components/bulletin/sample-bulletin-data';

export const dynamic = 'force-dynamic';

// Standalone print target for the template editor's "Exporter PDF" button
// (see lib/server/bulletin-pdf/generate.ts's generateBulletinTemplatePreviewPdf).
// Unlike app/print/bulletin/[studentId]/[termId], the config travels IN the
// signed token instead of being re-read from the DB — so the exported PDF
// reflects the editor's current in-memory state even before "Enregistrer".
// The editor always sends a config that already validated against the full
// pages-shaped schema, so no normalizeConfig call is needed here.
export default async function PrintBulletinTemplatePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const payload = token ? verifyTemplatePreviewToken(token) : null;
  if (!payload) {
    return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Lien invalide ou expiré.</p>;
  }

  const { config } = payload;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `@page{size:${config.pageFormat === 'LETTER' ? 'letter' : 'A4'} ${config.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait'};margin:0} body{margin:0}`,
        }}
      />
      <BulletinDocument config={config} data={SAMPLE_BULLETIN_DATA} chrome={false} />
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck` — no errors from either of these 2 files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/print/bulletin/\[studentId\]/\[termId\]/page.tsx frontend/src/app/print/bulletin-template-preview/page.tsx
git commit -m "$(cat <<'EOF'
feat(bulletin): migrate print/PDF pages to BulletinDocument

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migrate `BulletinViewer.tsx`

**Files:**
- Modify: `frontend/src/components/bulletin/BulletinViewer.tsx`

**Interfaces:**
- Consumes: `BulletinDocument`, `PAGE_GAP_PX` (Task 4), `getPageWidthPx`/`getPageHeightPx` (unchanged, from `page-size.ts` directly now instead of via `BulletinCanvas`'s re-export), `normalizeConfig` is NOT called here (the API response already carries a normalized `config` once Task 7 lands on the read routes this component's `data.template.config` comes from — `GET /api/school/students/[id]/bulletin` reads `getStudentBulletinView`, which Task 2/5's `normalizeConfig` usage already covers upstream).

- [ ] **Step 1: Update `BulletinViewer.tsx`'s imports, `renderData`, and the page-stack rendering**

Replace the import block (lines 38-44 of the current file):

```tsx
import {
  BulletinDocument,
  PAGE_GAP_PX,
} from '@/components/bulletin/BulletinDocument';
import { getPageHeightPx, getPageWidthPx } from '@/components/bulletin/page-size';
import type { BulletinRenderData } from '@/components/bulletin/render-data';
import type { StudentBulletinData } from '@/app/(school)/bulletins/types';
```

Replace the `renderData` construction (the `const termLabel = ...` line and the `const renderData: BulletinRenderData = {...}` block):

```tsx
  const termLabel = data.termLabel;
  const renderData: BulletinRenderData = {
    schoolName: data.schoolName,
    schoolLogoUrl: data.schoolLogoUrl,
    directorSignatureUrl: data.directorSignatureUrl,
    period: termLabel,
    academicYear: data.academicYearLabel,
    studentName: `${data.firstName} ${data.lastName}`,
    className: data.className,
    classSize: data.classSize,
    studentNumber: `N° ${data.studentNumber}`,
    subjects: data.subjects.map((s) => ({
      name: s.subjectName,
      coefficient: s.coefficient,
      average: s.average,
      classAverage: s.classAverage,
      min: s.min,
      max: s.max,
      appreciation: s.appreciation,
    })),
    overallAverage: data.overallAverage,
    classAverage: data.classAverage,
    rank: data.rank,
    rankedCount: data.rankedCount,
    generalAppreciation: data.generalAppreciation,
    absencesDays: null,
    retards: null,
    firstName: data.firstName,
    lastName: data.lastName,
    schoolAddress: data.schoolAddress,
    schoolPhone: data.schoolPhone,
    schoolEmail: data.schoolEmail,
    termLabel,
    academicYearLabel: data.academicYearLabel,
    qualitativeSubjects: data.qualitativeSubjects,
  };
```

Replace the page-rendering block inside `<div id="bulletin-page-wrap" ...>` (the IIFE that renders one `<BulletinCanvas>`):

```tsx
            {data.template ? (
              (() => {
                const naturalWidth = getPageWidthPx(data.template.config);
                const naturalHeight = getPageHeightPx(data.template.config);
                const pageCount = data.template.config.pages.length;
                const documentNaturalHeight =
                  pageCount * naturalHeight + (pageCount - 1) * PAGE_GAP_PX;
                const scaledWidth = Math.round(naturalWidth * (zoom / 100));
                const scaledHeight = Math.round(documentNaturalHeight * (zoom / 100));
                return (
                  <div className="mx-auto" style={{ width: scaledWidth, height: scaledHeight }}>
                    <div
                      style={{
                        width: naturalWidth,
                        height: documentNaturalHeight,
                        transform: `scale(${zoom / 100})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      <BulletinDocument config={data.template.config} data={renderData} />
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="mx-auto w-fit rounded-md bg-card p-10 text-center text-sm text-muted-foreground">
                Aucun modèle de bulletin disponible.
              </div>
            )}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck` — no errors from this file. `StudentBulletinData.template.config` already resolves to the `pages`-shaped `BulletinTemplateConfig` via `BulletinTemplateRef` in `bulletins/types.ts` (unchanged reference to `configuration/modele-bulletin/types`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/bulletin/BulletinViewer.tsx
git commit -m "$(cat <<'EOF'
feat(bulletin): migrate BulletinViewer to the multi-page BulletinDocument

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `GET` route `normalizeConfig` + backfill script

**Files:**
- Modify: `frontend/src/app/api/school/bulletin-templates/[id]/route.ts`
- Create: `frontend/scripts/backfill-bulletin-template-pages.ts`
- Create: `frontend/scripts/backfill-bulletin-template-pages.test.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: `normalizeConfig` (Task 1).

- [ ] **Step 1: Apply `normalizeConfig` in the `GET` handler**

In `frontend/src/app/api/school/bulletin-templates/[id]/route.ts`, replace the existing `import { bulletinTemplateConfigSchema } from '@/lib/server/bulletin-templates';` line with:

```ts
import { bulletinTemplateConfigSchema, normalizeConfig } from '@/lib/server/bulletin-templates';
```

Replace the `GET` handler's success response:

```ts
    return NextResponse.json(
      { ...tpl, config: normalizeConfig(tpl.config), isOwn: tpl.schoolId === mySchool.schoolId },
      { headers: { 'x-request-id': ctx.requestId } },
    );
```

- [ ] **Step 2: Write `frontend/scripts/backfill-bulletin-template-pages.ts`**

```ts
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
```

- [ ] **Step 3: Write `frontend/scripts/backfill-bulletin-template-pages.test.ts`**

```ts
// scripts/backfill-bulletin-template-pages
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './backfill-bulletin-template-pages';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('scripts/backfill-bulletin-template-pages', () => {
  it('converts a legacy flat-blocks row into a pages-shaped config', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl1',
        config: {
          primaryColor: '#6c2bd9',
          pageFormat: 'LETTER',
          orientation: 'LANDSCAPE',
          blocks: [{ id: 'header', visible: true }],
          columns: {},
          signatures: {},
          typography: {},
          content: { title: 'BULLETIN', footerMessage: null },
          layout: {},
        },
      },
    ] as never);
    prismaMock.bulletinTemplate.update.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl1' },
      data: {
        config: expect.objectContaining({
          pages: [
            {
              id: 'page-1',
              layout: 'full',
              showPageNumber: false,
              blocks: [{ id: 'header', type: 'header', visible: true }],
            },
          ],
        }),
      },
    });
    logSpy.mockRestore();
  });

  it('is idempotent — skips rows that already have pages', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl2',
        config: { pages: [{ id: 'page-1', layout: 'full', showPageNumber: false, blocks: [] }] },
      },
    ] as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.update).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 4: Add the npm script**

In `frontend/package.json`, alongside the existing `db:backfill-bulletin-*` entries:

```json
    "db:backfill-bulletin-pages": "tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/backfill-bulletin-template-pages.ts",
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter frontend exec vitest run scripts/backfill-bulletin-template-pages.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/school/bulletin-templates/\[id\]/route.ts frontend/scripts/backfill-bulletin-template-pages.ts frontend/scripts/backfill-bulletin-template-pages.test.ts frontend/package.json
git commit -m "$(cat <<'EOF'
feat(bulletin): normalizeConfig on the template GET route + pages backfill script

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Editor — `PagesPanel` + `BlockPalette` + generalized drag-and-drop

**Files:**
- Modify: `frontend/src/app/(school)/configuration/modele-bulletin/[id]/edit/page.tsx`
- Modify: `frontend/src/messages/fr/configuration.json`
- Modify: `frontend/src/messages/en/configuration.json`
- Modify: `frontend/src/messages/ht/configuration.json`

**Interfaces:**
- Consumes: `Page`, `Block`, `BlockType`, `BLOCK_TYPES`, `LEGACY_BLOCK_TYPES`, `DRAGGABLE_BLOCK_TYPES` (Task 1), `BulletinPage` (Task 4, renders exactly the currently-selected page).
- Produces: editor local state `currentPageId: string`, replacing the old single-page `config` mutation helpers with page-aware ones other tasks (Task 9) build on: `patchPage(pageId, patch)`, `patchBlock(pageId, blockId, patch)`, `addBlock(pageId, type)`, `removeBlock(pageId, blockId)` (only for non-legacy types — legacy types are add/removed via visibility, never structurally deleted, to keep `DEFAULT_BULLETIN_CONFIG` semantics: a template always carries all 7 legacy types, just possibly `visible: false`).

This task is the larger of the two editor tasks: it replaces the single-page assumption baked into `edit/page.tsx` (one `orderedBlocks`, one canvas) with a page-aware model, but leaves the right-hand properties panel (the 3 global tabs) completely alone — that panel's JSX in the current file is untouched by this task.

- [ ] **Step 1: Add i18n keys (fr, then mirror en/ht)**

In `frontend/src/messages/fr/configuration.json`, under `modeleBulletin`, add (alongside the existing `block.*` keys):

```json
    "block": {
      "header": "En-tête",
      "studentInfo": "Infos élève",
      "stats": "Statistiques",
      "notes": "Tableau de notes",
      "absences": "Absences",
      "appreciation": "Appréciation",
      "signatures": "Signatures",
      "text": "Texte libre",
      "cover": "Couverture",
      "criteriaGrids": "Grilles qualitatives"
    },
```

And, under `modeleBulletin.editor`, add a new `pagesPanel` group (replacing the old `blocksPanel` group — keep `blocksPanel` too, since Task 9 still needs its `hideBlock`/`showBlock` keys reused for the block list inside a page):

```json
      "pagesPanel": {
        "title": "Pages",
        "addPage": "Ajouter une page",
        "duplicatePage": "Dupliquer la page",
        "deletePage": "Supprimer la page",
        "pageLabel": "Page {n}",
        "layoutLabel": "Disposition",
        "layoutFull": "Pleine page",
        "layoutHalves": "Deux colonnes",
        "showPageNumber": "Afficher le numéro de page",
        "overflowWarning": "Le contenu dépasse la page"
      },
      "blockPalette": {
        "title": "Ajouter un bloc",
        "alreadyOnPage": "Déjà sur cette page"
      },
```

Mirror the same key structure in `frontend/src/messages/en/configuration.json` (real English copy, not a placeholder):

```json
    "block": {
      "header": "Header",
      "studentInfo": "Student info",
      "stats": "Statistics",
      "notes": "Grade table",
      "absences": "Absences",
      "appreciation": "Comment",
      "signatures": "Signatures",
      "text": "Free text",
      "cover": "Cover",
      "criteriaGrids": "Qualitative grids"
    },
```

```json
      "pagesPanel": {
        "title": "Pages",
        "addPage": "Add a page",
        "duplicatePage": "Duplicate page",
        "deletePage": "Delete page",
        "pageLabel": "Page {n}",
        "layoutLabel": "Layout",
        "layoutFull": "Full page",
        "layoutHalves": "Two columns",
        "showPageNumber": "Show page number",
        "overflowWarning": "Content overflows the page"
      },
      "blockPalette": {
        "title": "Add a block",
        "alreadyOnPage": "Already on this page"
      },
```

And in `frontend/src/messages/ht/configuration.json` (Haitian Creole, best-effort — the file already carries the `_review` flag at file level):

```json
    "block": {
      "header": "Antèt",
      "studentInfo": "Enfo elèv",
      "stats": "Estatistik",
      "notes": "Tablo nòt",
      "absences": "Absans",
      "appreciation": "Apresyasyon",
      "signatures": "Siyati",
      "text": "Tèks lib",
      "cover": "Kouvèti",
      "criteriaGrids": "Grij kalitatif"
    },
```

```json
      "pagesPanel": {
        "title": "Paj",
        "addPage": "Ajoute yon paj",
        "duplicatePage": "Double paj la",
        "deletePage": "Efase paj la",
        "pageLabel": "Paj {n}",
        "layoutLabel": "Dispozisyon",
        "layoutFull": "Paj antye",
        "layoutHalves": "De kolòn",
        "showPageNumber": "Montre nimewo paj la",
        "overflowWarning": "Kontni a depase paj la"
      },
      "blockPalette": {
        "title": "Ajoute yon blòk",
        "alreadyOnPage": "Deja sou paj sa a"
      },
```

- [ ] **Step 2: Replace the editor's block-mutation helpers and add page-mutation helpers**

In `edit/page.tsx`, replace `toggleBlock` and `reorder` (which today operate on `config.blocks`) and add `currentPageId` state, right after the existing `const [dragId, setDragId] = useState<BlockId | null>(null);` line — rename that state to match the new per-page drag model and add page-tracking state:

```tsx
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
```

Remove the old `const [selected, setSelected] = useState<BlockId>('header');` and `const [dragId, setDragId] = useState<BlockId | null>(null);` lines (both replaced above and by `selected` below).

Add, replacing `selected`:

```tsx
  const [selected, setSelected] = useState<{ pageId: string; blockId: string } | null>(null);
```

Seed `currentPageId`/`selected` alongside the existing config-seeding effect — extend the effect that sets `setConfig`/`setNameInput`:

```tsx
  useEffect(() => {
    if (data && seededForId.current !== params.id) {
      setConfig(data.config);
      setNameInput(data.name);
      seededForId.current = params.id;
      const firstPage = data.config.pages[0];
      if (firstPage) {
        setCurrentPageId(firstPage.id);
        setSelected({ pageId: firstPage.id, blockId: firstPage.blocks[0]?.id ?? firstPage.id });
      }
    }
  }, [data, params.id]);
```

Replace `toggleBlock` and `reorder` with page/block-scoped versions:

```tsx
  function currentPage(c: BulletinTemplateConfig): BulletinTemplateConfig['pages'][number] | undefined {
    return c.pages.find((p) => p.id === currentPageId);
  }

  function patchPage(pageId: string, patch: Partial<BulletinTemplateConfig['pages'][number]>) {
    setConfig((c) =>
      c ? { ...c, pages: c.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)) } : c,
    );
  }

  function toggleBlock(pageId: string, blockId: string) {
    setConfig((c) =>
      c
        ? {
            ...c,
            pages: c.pages.map((p) =>
              p.id !== pageId
                ? p
                : {
                    ...p,
                    blocks: p.blocks.map((b) =>
                      b.id === blockId ? { ...b, visible: !b.visible } : b,
                    ),
                  },
            ),
          }
        : c,
    );
  }

  function reorder(pageId: string, targetBlockId: string) {
    if (!dragBlockId || dragBlockId === targetBlockId || !config) return;
    const page = config.pages.find((p) => p.id === pageId);
    if (!page) return;
    const blocks = [...page.blocks];
    const from = blocks.findIndex((b) => b.id === dragBlockId);
    const to = blocks.findIndex((b) => b.id === targetBlockId);
    if (from < 0 || to < 0) return;
    const [moved] = blocks.splice(from, 1);
    if (!moved) return;
    blocks.splice(to, 0, moved);
    patchPage(pageId, { blocks });
  }

  function addBlock(pageId: string, type: BlockType) {
    setConfig((c) => {
      if (!c) return c;
      const page = c.pages.find((p) => p.id === pageId);
      if (!page) return c;
      const id = `${type}-${Date.now()}`;
      const newBlock: Block =
        type === 'text'
          ? { id, type, visible: true, text: '', align: 'left', fontSize: 12, bold: false, italic: false }
          : type === 'cover'
            ? {
                id,
                type,
                visible: true,
                sectionLabel: '',
                titlePattern: 'Bulletin du {term}',
                showLogo: true,
                framed: true,
                fields: ['lastName', 'firstName', 'className'],
              }
            : type === 'criteriaGrids'
              ? { id, type, visible: true, showScaleHeader: true }
              : ({ id, type, visible: true } as Block);
      return {
        ...c,
        pages: c.pages.map((p) => (p.id === pageId ? { ...p, blocks: [...p.blocks, newBlock] } : p)),
      };
    });
  }

  function removeBlock(pageId: string, blockId: string) {
    setConfig((c) =>
      c
        ? {
            ...c,
            pages: c.pages.map((p) =>
              p.id !== pageId ? p : { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) },
            ),
          }
        : c,
    );
  }

  function addPage() {
    setConfig((c) => {
      if (!c || c.pages.length >= 6) return c;
      const id = `page-${Date.now()}`;
      const newPage = {
        id,
        layout: 'full' as const,
        showPageNumber: false,
        blocks: [{ id: `text-${Date.now()}`, type: 'text' as const, visible: true, text: '', align: 'left' as const, fontSize: 12, bold: false, italic: false }],
      };
      setCurrentPageId(id);
      return { ...c, pages: [...c.pages, newPage] };
    });
  }

  function duplicatePage(pageId: string) {
    setConfig((c) => {
      if (!c || c.pages.length >= 6) return c;
      const source = c.pages.find((p) => p.id === pageId);
      if (!source) return c;
      const suffix = Date.now();
      const copy = {
        ...source,
        id: `${source.id}-copy-${suffix}`,
        blocks: source.blocks.map((b) => ({ ...b, id: `${b.id}-copy-${suffix}` })),
      };
      setCurrentPageId(copy.id);
      const index = c.pages.findIndex((p) => p.id === pageId);
      const pages = [...c.pages];
      pages.splice(index + 1, 0, copy);
      return { ...c, pages };
    });
  }

  function deletePage(pageId: string) {
    setConfig((c) => {
      if (!c || c.pages.length <= 1) return c;
      const index = c.pages.findIndex((p) => p.id === pageId);
      const pages = c.pages.filter((p) => p.id !== pageId);
      const fallback = pages[Math.max(0, index - 1)];
      if (fallback) setCurrentPageId(fallback.id);
      return { ...c, pages };
    });
  }
```

Add the imports this needs, alongside the existing ones:

```tsx
import {
  BLOCK_TYPES,
  LEGACY_BLOCK_TYPES,
  DRAGGABLE_BLOCK_TYPES,
} from '../../types';
import type { Block, BlockType, BulletinTemplateConfig } from '../../types';
import { getPageHeightPx, getPageWidthPx } from '@/components/bulletin/page-size';
import type { BulletinRenderData } from '@/components/bulletin/render-data';
import { BulletinPage as BulletinPageCanvas } from '@/components/bulletin/BulletinPage';
```

Remove the old `import { BulletinCanvas, getPageHeightPx, getPageWidthPx, type BulletinRenderData } from '@/components/bulletin/BulletinCanvas';` line entirely — replaced by the three imports above (`getPageHeightPx`/`getPageWidthPx` now come from `@/components/bulletin/page-size` directly, matching every other migrated caller in this plan; `types.ts` no longer exports `REORDERABLE_BLOCK_IDS` as of Task 1, which replaced it with `DRAGGABLE_BLOCK_TYPES` — drop any remaining reference to the old name).

- [ ] **Step 3: Replace the left "block list" panel with `PagesPanel` (page tabs + current page's block list) and add `BlockPalette`**

Replace the entire `{/* Left: block list */}` JSX block (from `{data.isOwn && (` through its matching closing `)}`) with:

```tsx
          {/* Left: pages + current page's blocks */}
          {data.isOwn && config && (
            <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-3.5">
              <div className="mb-2.5 text-2xs font-bold tracking-wide text-muted-foreground uppercase">
                {t('pagesPanel.title')}
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {config.pages.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setCurrentPageId(p.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                      currentPageId === p.id
                        ? 'border-primary/40 bg-secondary text-primary'
                        : 'border-border bg-background text-foreground'
                    }`}
                  >
                    {t('pagesPanel.pageLabel', { n: i + 1 })}
                  </button>
                ))}
              </div>
              <div className="mb-3 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={addPage}
                  disabled={config.pages.length >= 6}
                  className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-2xs font-medium text-foreground disabled:opacity-40"
                >
                  {t('pagesPanel.addPage')}
                </button>
                {currentPageId && (
                  <>
                    <button
                      type="button"
                      onClick={() => duplicatePage(currentPageId)}
                      disabled={config.pages.length >= 6}
                      className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-2xs font-medium text-foreground disabled:opacity-40"
                    >
                      {t('pagesPanel.duplicatePage')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePage(currentPageId)}
                      disabled={config.pages.length <= 1}
                      className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-2xs font-medium text-destructive-foreground disabled:opacity-40"
                    >
                      {t('pagesPanel.deletePage')}
                    </button>
                  </>
                )}
              </div>

              {currentPageId &&
                (() => {
                  const page = config.pages.find((p) => p.id === currentPageId);
                  if (!page) return null;
                  return (
                    <>
                      <div className="mb-3 flex flex-col gap-2 border-b border-border pb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">
                            {t('pagesPanel.layoutLabel')}
                          </span>
                          <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
                            <button
                              type="button"
                              onClick={() => patchPage(page.id, { layout: 'full' })}
                              className={`rounded px-2 py-0.5 text-2xs font-medium ${page.layout === 'full' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                            >
                              {t('pagesPanel.layoutFull')}
                            </button>
                            <button
                              type="button"
                              onClick={() => patchPage(page.id, { layout: 'halves' })}
                              className={`rounded px-2 py-0.5 text-2xs font-medium ${page.layout === 'halves' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                            >
                              {t('pagesPanel.layoutHalves')}
                            </button>
                          </div>
                        </div>
                        <SwitchRow
                          label={t('pagesPanel.showPageNumber')}
                          checked={page.showPageNumber}
                          onChange={(v) => patchPage(page.id, { showPageNumber: v })}
                        />
                      </div>

                      <p className="mb-2.5 text-2xs text-muted-foreground">{t('blocksPanel.hint')}</p>
                      {page.blocks.map((b) => {
                        const draggable = DRAGGABLE_BLOCK_TYPES.includes(b.type);
                        const isLegacy = (LEGACY_BLOCK_TYPES as readonly string[]).includes(b.type);
                        return (
                          <div
                            key={b.id}
                            draggable={draggable}
                            onDragStart={() => draggable && setDragBlockId(b.id)}
                            onDragOver={(e) => draggable && e.preventDefault()}
                            onDrop={() => draggable && reorder(page.id, b.id)}
                            onDragEnd={() => setDragBlockId(null)}
                            onClick={() => setSelected({ pageId: page.id, blockId: b.id })}
                            className={`mb-1 flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs font-medium ${
                              selected?.pageId === page.id && selected.blockId === b.id
                                ? 'border-primary/40 bg-secondary text-primary'
                                : 'border-border bg-background text-foreground'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={draggable ? 'cursor-grab text-muted-foreground' : 'text-transparent'}>
                                <GripVertical size={13} />
                              </span>
                              <span>{blockLabel(b.type, tBlock)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBlock(page.id, b.id);
                                }}
                                className={b.visible ? 'text-foreground' : 'text-muted-foreground opacity-40'}
                                aria-label={b.visible ? t('blocksPanel.hideBlock') : t('blocksPanel.showBlock')}
                              >
                                <Eye size={12} />
                              </button>
                              {!isLegacy && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeBlock(page.id, b.id);
                                    if (selected?.blockId === b.id) setSelected(null);
                                  }}
                                  className="text-muted-foreground"
                                  aria-label={t('pagesPanel.deletePage')}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      <div className="mt-3 border-t border-border pt-3">
                        <div className="mb-2 text-2xs font-bold tracking-wide text-muted-foreground uppercase">
                          {t('blockPalette.title')}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {BLOCK_TYPES.map((type) => {
                            const isLegacy = (LEGACY_BLOCK_TYPES as readonly string[]).includes(type);
                            const alreadyPresent = isLegacy && page.blocks.some((b) => b.type === type);
                            return (
                              <button
                                key={type}
                                type="button"
                                disabled={alreadyPresent}
                                title={alreadyPresent ? t('blockPalette.alreadyOnPage') : undefined}
                                onClick={() => addBlock(page.id, type)}
                                className="rounded-md border border-border bg-background px-2 py-1 text-2xs font-medium text-foreground disabled:opacity-30"
                              >
                                {blockLabel(type, tBlock)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
            </div>
          )}
```

- [ ] **Step 4: Update the canvas panel to render only the current page**

Replace the `<BulletinCanvas ... />` invocation inside the canvas panel with `BulletinPageCanvas`, and its surrounding size math (the current `naturalSize`/`scaledSize` `useMemo`s stay as-is — they already read `getPageWidthPx(config)`/`getPageHeightPx(config)`, unaffected by the pages change since page size is still global):

```tsx
                    {(() => {
                      const page = config.pages.find((p) => p.id === currentPageId) ?? config.pages[0];
                      if (!page) return null;
                      const pageIndex = config.pages.findIndex((p) => p.id === page.id);
                      return (
                        <BulletinPageCanvas
                          page={page}
                          pageIndex={pageIndex}
                          totalPages={config.pages.length}
                          config={config}
                          data={previewData}
                          chrome={false}
                          selected={selected ?? undefined}
                          onSelect={(pageId, blockId) => setSelected({ pageId, blockId })}
                          dragBlockId={dragBlockId}
                          onDragStart={setDragBlockId}
                          onDrop={(blockId) => reorder(page.id, blockId)}
                          onDragEnd={() => setDragBlockId(null)}
                        />
                      );
                    })()}
```

Update `previewData`'s type annotation to `BulletinRenderData` (imported from `render-data`, per Step 2) — its value expression (`{...SAMPLE_BULLETIN_DATA, schoolLogoUrl, directorSignatureUrl}`) needs no change since `SAMPLE_BULLETIN_DATA` already carries every new field after Task 2.

- [ ] **Step 5: Typecheck, format, lint**

Run: `pnpm typecheck` — resolve any remaining reference to the old `BlockId`/`selected: BlockId`/single-page `config.blocks` left over from before this task's edits (this file still has the properties panel referencing `blockLabel(selected, tBlock)` in the header of that panel — leave that call as-is for now: Task 9 rewrites that whole panel section and will fix the `selected` shape mismatch there. If typecheck fails on that line specifically, it is expected and resolved by Task 9, not this task — do not patch around it with a workaround; note it in your report as `DONE_WITH_CONCERNS` naming the exact line, so the reviewer confirms Task 9 covers it before approving.)

Run `pnpm format && pnpm lint` and fix any formatting/lint issues in files this task touched.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(school\)/configuration/modele-bulletin/\[id\]/edit/page.tsx frontend/src/messages/fr/configuration.json frontend/src/messages/en/configuration.json frontend/src/messages/ht/configuration.json
git commit -m "$(cat <<'EOF'
feat(bulletin editor): PagesPanel + BlockPalette, drag-and-drop for all block types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Editor — `BlockProperties` panel + overflow warning + delete `BulletinCanvas.tsx`

**Files:**
- Modify: `frontend/src/app/(school)/configuration/modele-bulletin/[id]/edit/page.tsx`
- Delete: `frontend/src/components/bulletin/BulletinCanvas.tsx`
- Modify: `frontend/src/messages/fr/configuration.json`
- Modify: `frontend/src/messages/en/configuration.json`
- Modify: `frontend/src/messages/ht/configuration.json`

**Interfaces:**
- Consumes: `selected: { pageId, blockId } | null` state, `patchBlock` helper (new in this task), block interfaces from `types.ts` (`AppreciationBlock`, `SignaturesBlock`, `TextBlock`, `CoverBlock`, `CriteriaGridsBlock`).

By the end of this task, `BulletinCanvas.tsx` has zero remaining importers (confirm with a grep before deleting) and is removed — the last of the plan's 4 real callers (this editor) has migrated in Task 8.

- [ ] **Step 1: Add `patchBlock` and the block-tab visibility helper**

Add, alongside the other mutation helpers from Task 8:

```tsx
  function patchBlock(pageId: string, blockId: string, patch: Partial<Block>) {
    setConfig((c) =>
      c
        ? {
            ...c,
            pages: c.pages.map((p) =>
              p.id !== pageId
                ? p
                : {
                    ...p,
                    blocks: p.blocks.map((b) =>
                      b.id === blockId ? ({ ...b, ...patch } as Block) : b,
                    ),
                  },
            ),
          }
        : c,
    );
  }

  const BLOCK_TAB_TYPES: BlockType[] = ['appreciation', 'signatures', 'text', 'cover', 'criteriaGrids'];
  const selectedBlock = config?.pages
    .find((p) => p.id === selected?.pageId)
    ?.blocks.find((b) => b.id === selected?.blockId);
  const showBlockTab = selectedBlock != null && BLOCK_TAB_TYPES.includes(selectedBlock.type);
```

Update the `Tab` type to include the new tab:

```tsx
type Tab = 'style' | 'content' | 'spacing' | 'block';
```

Guard `propTab` so switching to a block without a "Ce bloc" tab falls back to `style` — add an effect near the other `useEffect`s:

```tsx
  useEffect(() => {
    if (propTab === 'block' && !showBlockTab) setPropTab('style');
  }, [propTab, showBlockTab]);
```

- [ ] **Step 2: Fix the properties panel header to read the new `selected` shape**

Replace the header block inside `{/* Right: properties */}` (the `<div className="mb-3 flex items-center gap-2">...</div>` block referencing `BLOCK_ICON[selected]`/`blockLabel(selected, tBlock)`):

```tsx
                <div className="mb-3 flex items-center gap-2">
                  <div>
                    <div className="text-caption font-bold text-foreground">
                      {selectedBlock ? blockLabel(selectedBlock.type, tBlock) : ''}
                    </div>
                    <div className="text-2xs text-muted-foreground">{t('selectedBlock')}</div>
                  </div>
                </div>
```

(`BLOCK_ICON` was keyed by the old 7-entry `BlockId` — since it is no longer used after this change, remove the `BLOCK_ICON` constant and its now-unused `PanelTop`/`User`/`BarChart2`/`Table`/`CalendarX`/`MessageSquare`/`PenLine` icon imports if `pnpm lint` flags them as unused; keep any of those still referenced elsewhere in the file.)

Update the tab bar to conditionally include `'block'`:

```tsx
                <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
                  {(['style', 'content', 'spacing', ...(showBlockTab ? (['block'] as const) : [])] as Tab[]).map(
                    (tabKey) => (
                      <button
                        key={tabKey}
                        type="button"
                        onClick={() => setPropTab(tabKey)}
                        className={`flex-1 rounded px-1 py-1 text-2xs font-medium ${propTab === tabKey ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
                      >
                        {t(`tabs.${tabKey}`)}
                      </button>
                    ),
                  )}
                </div>
```

- [ ] **Step 3: Add the `block` tab's content, per selected block type**

Add, after the existing `{propTab === 'spacing' && (...)}` block, before the closing `</div>` of the properties column:

```tsx
              {propTab === 'block' && selected && selectedBlock && (
                <>
                  {selectedBlock.type === 'appreciation' && (
                    <PropSection title={t('blockProperties.appreciationTitle')} last>
                      <PropSelectRow
                        label={t('blockProperties.appreciationStyle')}
                        value={selectedBlock.style ?? 'box'}
                        options={[
                          { value: 'box', label: t('blockProperties.appreciationStyleBox') },
                          { value: 'lines', label: t('blockProperties.appreciationStyleLines') },
                        ]}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            style: v as 'box' | 'lines',
                          })
                        }
                      />
                      {selectedBlock.style === 'lines' && (
                        <PropNumberRow
                          label={t('blockProperties.appreciationLines')}
                          value={selectedBlock.lines ?? 3}
                          min={3}
                          max={12}
                          onChange={(v) => patchBlock(selected.pageId, selected.blockId, { lines: v })}
                        />
                      )}
                    </PropSection>
                  )}

                  {selectedBlock.type === 'signatures' && (
                    <PropSection title={t('blockProperties.signaturesLabelsTitle')} last>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.signatureDirectorLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={selectedBlock.labels?.director ?? ''}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            labels: { ...selectedBlock.labels, director: e.target.value },
                          })
                        }
                        className="mb-2 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.signatureHomeroomLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={selectedBlock.labels?.homeroom ?? ''}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            labels: { ...selectedBlock.labels, homeroom: e.target.value },
                          })
                        }
                        className="mb-2 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.signatureGuardianLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={selectedBlock.labels?.guardian ?? ''}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            labels: { ...selectedBlock.labels, guardian: e.target.value },
                          })
                        }
                        className="w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                    </PropSection>
                  )}

                  {selectedBlock.type === 'text' && (
                    <PropSection title={t('blockProperties.textTitle')} last>
                      <textarea
                        maxLength={2000}
                        rows={8}
                        value={selectedBlock.text}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, { text: e.target.value })
                        }
                        className="mb-2.5 w-full resize-none rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <PropSelectRow
                        label={t('blockProperties.textAlign')}
                        value={selectedBlock.align}
                        options={[
                          { value: 'left', label: t('blockProperties.alignLeft') },
                          { value: 'center', label: t('blockProperties.alignCenter') },
                          { value: 'justify', label: t('blockProperties.alignJustify') },
                        ]}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            align: v as 'left' | 'center' | 'justify',
                          })
                        }
                      />
                      <PropSliderRow
                        label={t('blockProperties.textFontSize')}
                        value={selectedBlock.fontSize}
                        min={8}
                        max={20}
                        suffix="px"
                        onChange={(v) => patchBlock(selected.pageId, selected.blockId, { fontSize: v })}
                      />
                      <SwitchRow
                        label={t('blockProperties.textBold')}
                        checked={selectedBlock.bold}
                        onChange={(v) => patchBlock(selected.pageId, selected.blockId, { bold: v })}
                      />
                      <SwitchRow
                        label={t('blockProperties.textItalic')}
                        checked={selectedBlock.italic}
                        onChange={(v) => patchBlock(selected.pageId, selected.blockId, { italic: v })}
                      />
                    </PropSection>
                  )}

                  {selectedBlock.type === 'cover' && (
                    <PropSection title={t('blockProperties.coverTitle')} last>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.coverSectionLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={selectedBlock.sectionLabel}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, { sectionLabel: e.target.value })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.coverTitlePattern')}
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={selectedBlock.titlePattern}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, { titlePattern: e.target.value })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <SwitchRow
                        label={t('blockProperties.coverShowLogo')}
                        checked={selectedBlock.showLogo}
                        onChange={(v) => patchBlock(selected.pageId, selected.blockId, { showLogo: v })}
                      />
                      <SwitchRow
                        label={t('blockProperties.coverFramed')}
                        checked={selectedBlock.framed}
                        onChange={(v) => patchBlock(selected.pageId, selected.blockId, { framed: v })}
                      />
                      <div className="mt-2 text-xs font-medium text-foreground">
                        {t('blockProperties.coverFields')}
                      </div>
                      {(['lastName', 'firstName', 'className', 'studentNumber', 'academicYear'] as const).map(
                        (field) => (
                          <SwitchRow
                            key={field}
                            label={t(`blockProperties.coverField.${field}`)}
                            checked={selectedBlock.fields.includes(field)}
                            onChange={(v) =>
                              patchBlock(selected.pageId, selected.blockId, {
                                fields: v
                                  ? [...selectedBlock.fields, field]
                                  : selectedBlock.fields.filter((f) => f !== field),
                              })
                            }
                          />
                        ),
                      )}
                    </PropSection>
                  )}

                  {selectedBlock.type === 'criteriaGrids' && (
                    <PropSection title={t('blockProperties.criteriaGridsTitle')} last>
                      <SwitchRow
                        label={t('blockProperties.showScaleHeader')}
                        checked={selectedBlock.showScaleHeader}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, { showScaleHeader: v })
                        }
                      />
                    </PropSection>
                  )}
                </>
              )}
```

- [ ] **Step 4: Add the overflow warning**

Add a ref and effect near the existing `canvasContainerRef`:

```tsx
  const pageContentRef = useRef<HTMLDivElement>(null);
  const [overflowingPages, setOverflowingPages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!config || !pageContentRef.current) return;
    const el = pageContentRef.current;
    const natH = getPageHeightPx(config);
    setOverflowingPages((prev) => {
      const next = new Set(prev);
      const page = config.pages.find((p) => p.id === currentPageId);
      if (!page) return prev;
      if (el.scrollHeight > natH) next.add(page.id);
      else next.delete(page.id);
      return next;
    });
  }, [config, currentPageId, zoom]);
```

Attach `pageContentRef` to the natural-size wrapper div that holds `<BulletinPageCanvas>` (the `style={{ width: naturalSize.width, height: naturalSize.height, transform: ... }}` div added in Task 8 Step 4):

```tsx
                  <div
                    ref={pageContentRef}
                    className="rounded-[2px] bg-white shadow-2xl"
                    style={{
                      width: naturalSize.width,
                      height: naturalSize.height,
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: 'top left',
                    }}
                  >
```

Show the warning as an amber marker on the matching page tab in `PagesPanel` (Task 8's page-tab buttons) — update that button's className/content:

```tsx
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setCurrentPageId(p.id)}
                    className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${
                      currentPageId === p.id
                        ? 'border-primary/40 bg-secondary text-primary'
                        : 'border-border bg-background text-foreground'
                    }`}
                  >
                    {t('pagesPanel.pageLabel', { n: i + 1 })}
                    {overflowingPages.has(p.id) && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-warning"
                        title={t('pagesPanel.overflowWarning')}
                      />
                    )}
                  </button>
```

- [ ] **Step 5: Add the new i18n keys (fr, en, ht)**

In `frontend/src/messages/fr/configuration.json`, under `modeleBulletin.editor`, add:

```json
      "tabs": {
        "style": "Style",
        "content": "Contenu",
        "spacing": "Espacement",
        "block": "Ce bloc"
      },
      "blockProperties": {
        "appreciationTitle": "Appréciation générale",
        "appreciationStyle": "Présentation",
        "appreciationStyleBox": "Encadré",
        "appreciationStyleLines": "Lignes réglées",
        "appreciationLines": "Nombre de lignes",
        "signaturesLabelsTitle": "Libellés des signatures",
        "signatureDirectorLabel": "Libellé signature directeur",
        "signatureHomeroomLabel": "Libellé signature titulaire",
        "signatureGuardianLabel": "Libellé signature parent",
        "textTitle": "Texte",
        "textAlign": "Alignement",
        "alignLeft": "Gauche",
        "alignCenter": "Centré",
        "alignJustify": "Justifié",
        "textFontSize": "Taille de police",
        "textBold": "Gras",
        "textItalic": "Italique",
        "coverTitle": "Couverture",
        "coverSectionLabel": "Libellé de section",
        "coverTitlePattern": "Titre (utilisez {term} pour le trimestre)",
        "coverShowLogo": "Afficher le logo",
        "coverFramed": "Cadre arrondi",
        "coverFields": "Lignes d'identité",
        "coverField": {
          "lastName": "Nom",
          "firstName": "Prénom",
          "className": "Classe",
          "studentNumber": "Code",
          "academicYear": "Année académique"
        },
        "criteriaGridsTitle": "Grilles qualitatives",
        "showScaleHeader": "Afficher l'en-tête de l'échelle"
      },
```

(the existing `tabs` object with only `style`/`content`/`spacing` is replaced by the 4-key version above — this is the same JSON key path, not a new sibling; update it in place.)

Mirror in `frontend/src/messages/en/configuration.json`:

```json
      "tabs": {
        "style": "Style",
        "content": "Content",
        "spacing": "Spacing",
        "block": "This block"
      },
      "blockProperties": {
        "appreciationTitle": "General comment",
        "appreciationStyle": "Presentation",
        "appreciationStyleBox": "Boxed",
        "appreciationStyleLines": "Ruled lines",
        "appreciationLines": "Number of lines",
        "signaturesLabelsTitle": "Signature labels",
        "signatureDirectorLabel": "Director signature label",
        "signatureHomeroomLabel": "Homeroom signature label",
        "signatureGuardianLabel": "Guardian signature label",
        "textTitle": "Text",
        "textAlign": "Alignment",
        "alignLeft": "Left",
        "alignCenter": "Center",
        "alignJustify": "Justify",
        "textFontSize": "Font size",
        "textBold": "Bold",
        "textItalic": "Italic",
        "coverTitle": "Cover",
        "coverSectionLabel": "Section label",
        "coverTitlePattern": "Title (use {term} for the term)",
        "coverShowLogo": "Show logo",
        "coverFramed": "Rounded frame",
        "coverFields": "Identity lines",
        "coverField": {
          "lastName": "Last name",
          "firstName": "First name",
          "className": "Class",
          "studentNumber": "Code",
          "academicYear": "Academic year"
        },
        "criteriaGridsTitle": "Qualitative grids",
        "showScaleHeader": "Show the scale header"
      },
```

And in `frontend/src/messages/ht/configuration.json`:

```json
      "tabs": {
        "style": "Style",
        "content": "Kontni",
        "spacing": "Espasman",
        "block": "Blòk sa a"
      },
      "blockProperties": {
        "appreciationTitle": "Apresyasyon jeneral",
        "appreciationStyle": "Prezantasyon",
        "appreciationStyleBox": "Ankadre",
        "appreciationStyleLines": "Liy regle",
        "appreciationLines": "Kantite liy",
        "signaturesLabelsTitle": "Etikèt siyati",
        "signatureDirectorLabel": "Etikèt siyati direktè",
        "signatureHomeroomLabel": "Etikèt siyati titilè",
        "signatureGuardianLabel": "Etikèt siyati paran",
        "textTitle": "Tèks",
        "textAlign": "Alinyman",
        "alignLeft": "Goch",
        "alignCenter": "Sant",
        "alignJustify": "Jistifye",
        "textFontSize": "Gwosè polis",
        "textBold": "Gra",
        "textItalic": "Italik",
        "coverTitle": "Kouvèti",
        "coverSectionLabel": "Etikèt seksyon",
        "coverTitlePattern": "Tit (itilize {term} pou trimès la)",
        "coverShowLogo": "Montre logo a",
        "coverFramed": "Ankadreman won",
        "coverFields": "Liy idantite",
        "coverField": {
          "lastName": "Non",
          "firstName": "Prenon",
          "className": "Klas",
          "studentNumber": "Kòd",
          "academicYear": "Ane akademik"
        },
        "criteriaGridsTitle": "Grij kalitatif",
        "showScaleHeader": "Montre antèt echèl la"
      },
```

- [ ] **Step 6: Delete `BulletinCanvas.tsx`**

```bash
grep -rn "BulletinCanvas" frontend/src --include=*.tsx --include=*.ts
```

Confirm the only remaining hits are inside `BulletinCanvas.tsx` itself (about to be deleted) — if any other file still imports it, stop and fix that file first (it means an earlier task's migration was incomplete). Once confirmed:

```bash
rm frontend/src/components/bulletin/BulletinCanvas.tsx
```

- [ ] **Step 7: Run the full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` from repo root. All must pass. `locales.test.ts` will fail if any of the 3 message files drifted out of key-parity — fix before proceeding.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/\(school\)/configuration/modele-bulletin/\[id\]/edit/page.tsx frontend/src/messages/fr/configuration.json frontend/src/messages/en/configuration.json frontend/src/messages/ht/configuration.json
git rm frontend/src/components/bulletin/BulletinCanvas.tsx
git commit -m "$(cat <<'EOF'
feat(bulletin editor): per-block-type properties panel, overflow warning, delete BulletinCanvas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: CLAUDE.md documentation + final self-review gate

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none (documentation-only task).

- [ ] **Step 1: Add the CLAUDE.md carve-out + feature summary**

Add a new paragraph to CLAUDE.md's i18n section (`## Design system` → the "Internationalisation" sub-section), immediately after the sentence documenting the existing 7-block-type French carve-out ("its five duplicated `fmt()`/`mentionClass()`/`moyColor()` copies..." — locate the sentence that ends the paragraph mentioning `Configuration.modeleBulletin`'s printed-content carve-out, or, if none names it explicitly yet, append this as a new sentence at the end of that whole paragraph):

```markdown
Bulletin templates gained a `pages`/`blocks` engine (2026-09-05, see
docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md):
a template's `config` holds an array of pages (`full` or two-column
`halves` layout, optional page numbering), each with typed blocks
(`header`, `studentInfo`, `stats`, `notes`, `absences`, `appreciation`,
`signatures`, `text`, `cover`, `criteriaGrids`) rendered by
`frontend/src/components/bulletin/BulletinDocument.tsx` →
`BulletinPage.tsx` → one file per type under `components/bulletin/blocks/`.
A template saved before this shipped is never eagerly migrated in the
database — `normalizeConfig()` in `frontend/src/lib/server/
bulletin-templates.ts` converts an old flat `blocks` array into a single
`full` page at read time, called by `getStudentBulletinView`, the real
print page, and the template editor's `GET` route (which also seeds the
editor's live preview from the same response). The 3 new block types'
printed content (free text, cover fields, qualitative-subject grids) stays
hardcoded French by design, the same carve-out already applied to the 7
original block types: printed bulletins are an official school document.
```

- [ ] **Step 2: Self-review the whole plan's diff against the spec**

Read `docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md` §9-§11 and the relevant parts of §13-§14 one more time, and confirm, item by item:

- §9's `config`/`Page`/`Block` shape → Task 1. Confirmed field-for-field, including `pages` 1-6, page/block id uniqueness config-wide, legacy-type-once-per-page, `breakBefore` only on `halves`.
- §9.1's block option table → Task 1 (schema) + Task 3 (renderers) for all 10 types.
- §9.2's `normalizeConfig` + 3 call sites → Task 1 (function) + Task 2/5/7 (call sites) — see Ruling R3 for why there are 3, not 4.
- §10.1's component decomposition → Tasks 3-4 (`BulletinPage`/`BulletinDocument`/`blocks/*`), Task 9 (`BulletinCanvas` deletion).
- §10.2's `BulletinRenderData` additions → Task 2.
- §10.3's print/PDF behavior (unchanged contract, `break-after: page` per sheet) → Task 5, `BulletinDocument.tsx`'s per-page wrapper in Task 4.
- §10.4's viewer stacking → Task 6.
- §11's editor decomposition (`PagesPanel`, `BlockPalette`, `BlockProperties`, one-page-at-a-time canvas, overflow warning, read-only/fork gating unchanged) → Tasks 8-9.
- §13's backfill script → Task 7.
- §14's schema/normalizeConfig tests → Task 1's test file.

- [ ] **Step 3: Placeholder scan**

Confirm no task above contains "TBD"/"add error handling"/"similar to Task N" without code/"write tests for the above" without actual test code. (This plan was authored with every step carrying complete code; this step is the author's own re-read, not a new deliverable.)

- [ ] **Step 4: Type consistency scan**

Confirm identifiers agree across tasks: `renderBlock` (Task 3, used by Task 4's `BulletinPage.tsx`), `PAGE_GAP_PX` (Task 4, used by Task 6), `BulletinRenderData` (Task 2, used by Tasks 3-6), `patchPage`/`patchBlock`/`addBlock`/`removeBlock`/`addPage`/`duplicatePage`/`deletePage` (Task 8, used by Task 9), `DRAGGABLE_BLOCK_TYPES`/`LEGACY_BLOCK_TYPES`/`BLOCK_TYPES` (Task 1, used by Tasks 3-4 and 8-9).

- [ ] **Step 5: Run the full gate one final time**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` from repo root. All must pass before this plan is considered complete.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document the bulletin pages/blocks engine in CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```
