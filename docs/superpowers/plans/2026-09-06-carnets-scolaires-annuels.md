# Carnets scolaires annuels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two global bulletin templates, « Carnet scolaire (3e cycle et secondaire) » and « Carnet scolaire (primaire) », that reproduce the two Word documents in `bulletin_template/` and print every period of the school year on one document (Notes/Sur per period, Total, Moyenne, Place, a Décisions table, one signature pair per period).

**Architecture:** `getStudentBulletinView` gains an optional `year` payload (one entry per period of the academic year) computed by a pure `buildYearData()` only when the resolved template contains an annual block. Three new block types (`yearGrid`, `yearDecisions`, `yearSignatures`) render that payload; the `cover` block gains the fields and options the carnet cover needs; the `text` block substitutes `{eleve}`/`{classe}`/`{annee}`/`{periode}`/`{ecole}`; pages gain a `sidebar` layout (main column + adjustable aside) for the grid + signatures page. Every new config field is optional, so existing templates validate and render unchanged. No database migration.

**Tech Stack:** Next.js 16 App Router, Prisma 5 (read-only here, no schema change), Zod, Vitest (`prismaMock` from `vitest-mock-extended`, `react-dom/server` `renderToStaticMarkup` for renderer tests), next-intl fr/ht/en with `locales.test.ts` key parity, Tailwind v4, Radix `Select` via `BareSelect`/`SelectItem`.

**Spec:** `docs/superpowers/specs/2026-09-06-carnets-scolaires-annuels-design.md` (the binding authority; §2 holds the validated calculation rules). Builds on `docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md` (pages/blocks engine, per-level template) whose three plans are already merged to local `develop`.

## Global Constraints

- Before every commit: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must all pass (repo standard, `CLAUDE.md`). Run them from the repo root.
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`: never silence with `any`; optional fields are typed `?: T | undefined` in `types.ts` (the file's existing convention).
- Conventional Commits; `git add` explicit paths only, never `git add -A`; never `--no-verify`.
- No AI-tell copy in any user-facing string (UI, `frontend/src/messages/*/*.json`, printed bulletin text): no em dash `—`, use `.`, `,`, `:` or `·`. Code comments and commit messages are free.
- Printed bulletin content (block headings such as « Matières », « Total », « Moyenne », « Place », « Décisions », « Signatures », « Contrôle », « Moyenne Générale », roman numerals, cover field labels) is hardcoded French by design, the same carve-out as the ten existing block types (spec 2026-09-05 §10).
- Calculation rules (spec §2, verbatim): `Sur` of a subject = `Subject.maxScore × (ClassSubject.coefficient ?? 1)`; `Notes` = subject average on 20 ÷ 20 × Sur, rounded to a tenth, empty when the subject has no grade; `Total` = sums over ALL numeric subjects of the class (Sur total identical for every student, an ungraded subject brings 0 points); `Moyenne` = Total Notes ÷ Total Sur × 10 rounded to a tenth; `Place` = competition rank on that average among classmates with an average; a period with no published grade in the class stays entirely empty; `Coefficient` = sum of the subject coefficients; `Moyenne Générale` = sum of the averages of the graded periods, its coefficient = sum of their coefficient sums.
- Student audience: only `PUBLISHED` evaluations, the student keeps their own rank, `ranking`/roster navigation stay null (unchanged rules of `getStudentBulletinView`).
- Annual data is computed only when the resolved template contains a `yearGrid`, `yearDecisions` or `yearSignatures` block (visible or not); no extra query otherwise.
- Every field added to a template config is optional; `normalizeConfig` is not modified; a config saved before this plan validates and renders identically.
- Client type mirror: every change to the Zod schema in `frontend/src/lib/server/bulletin-templates.ts` is mirrored structurally in `frontend/src/app/(school)/configuration/modele-bulletin/types.ts` (client components cannot import the server module, not even types).
- Editor controls use the app's components (`BareSelect`/`SelectItem` through `PropSelectRow`, `SwitchRow`, `PropSliderRow`), never a raw `<select>`.
- Seeded global templates never contain a school name, address, phone or logo; those come from the printing school's data.
- Block and page ids inside a seeded config are unique across the whole config (existing engine rule).
- Dev DB commands: none are needed by this plan's tasks. The final verification task runs `pnpm db:seed-bulletin-templates` only after the human partner confirms (it writes two global rows to the shared dev DB).

## Rulings

**R1 — Shared `YearData` types live in `frontend/src/components/bulletin/render-data.tsx`.** The server module `year-data.ts` and `get-bulletin-view.ts` import them with `import type` (erased at build time), the client renderers import them directly. Putting them in a server module would break the client; duplicating them would drift. Cost if wrong: a type-only import from a component file in server code is unusual here but harmless.

**R2 — Task 1 ships the three new renderers as their "no annual data" path (`return null`).** `renderBlock`'s exhaustive `never` switch fails `pnpm typecheck` the moment a block type exists without a case, and the editor's `blockLabel` fails without message keys. Task 1 therefore adds the schema, the client types, the block names in the three locales and three renderers that only implement the spec rule « sans `year`, le bloc rend `null` », with a test for that rule. Tasks 3 and 4 complete them.

**R3 — Subject order is the existing view query's order.** `getStudentBulletinView` already loads `classSubjects` sorted by `subject.domain asc, subject.name asc` (nulls last) for the notes table; the annual grid reuses that array (no second query) and the primary carnet's domain headings follow from it. Spec §2.4 records this.

**R4 — One evaluation query, not two.** When the template needs annual data, the view fetches the evaluations of every term of the year in the single existing `evaluation.findMany` (`termId: { in: termIds }`) and filters the current term's rows in memory for the per-term table; otherwise the query is exactly what it was. Cost if wrong: none for non-annual templates; for annual ones one wider query replaces one narrow query.

---

### Task 1: Schema, client types, block names, null renderers

**Files:**
- Modify: `frontend/src/lib/server/bulletin-templates.ts` (block schemas around lines 40-145)
- Modify: `frontend/src/app/(school)/configuration/modele-bulletin/types.ts`
- Modify: `frontend/src/app/(school)/configuration/modele-bulletin/block-label.ts`
- Modify: `frontend/src/messages/fr/configuration.json`, `frontend/src/messages/ht/configuration.json`, `frontend/src/messages/en/configuration.json` (`modeleBulletin.block`)
- Create: `frontend/src/components/bulletin/blocks/yearGrid.tsx`, `yearDecisions.tsx`, `yearSignatures.tsx`
- Modify: `frontend/src/components/bulletin/blocks/index.ts`
- Test: `frontend/src/lib/server/bulletin-templates.test.ts`, `frontend/src/components/bulletin/blocks/blocks.test.tsx`

**Interfaces:**
- Produces (server): `yearGridBlockSchema`, `yearDecisionsBlockSchema`, `yearSignaturesBlockSchema` in the `blockSchema` union; `coverFieldSchema` with `'fullName' | 'nisu'`; cover options `frameStyle: 'dashed' | 'solid' | 'rounded'`, `uppercase?: boolean`, `logoPosition?: 'top' | 'belowTitle'`, `fieldLabels?: { [field]?: string }`; `pageSchema.layout: 'full' | 'halves' | 'sidebar'`, `asideWidth?: number` (15..40); `export const YEAR_BLOCK_TYPES = ['yearGrid', 'yearDecisions', 'yearSignatures'] as const`; `export function templateNeedsYear(config: Pick<BulletinTemplateConfig, 'pages'>): boolean`.
- Produces (client `types.ts`): `YearGridBlock { type: 'yearGrid'; showDomains?: boolean; notesLabel?: string; maxLabel?: string }`, `YearDecisionsBlock { type: 'yearDecisions'; title?: string }`, `YearSignaturesBlock { type: 'yearSignatures'; title?: string; labels?: { director?: string; guardian?: string } }`, `CoverField` extended, `CoverBlock` extended, `Page.layout` extended, `Page.asideWidth?`, `YEAR_BLOCK_TYPES`.

- [ ] **Step 1: Write the failing schema tests**

Append to `frontend/src/lib/server/bulletin-templates.test.ts`, inside `describe('bulletinTemplateConfigSchema', …)` (copy the `structuredClone(DEFAULT_BULLETIN_CONFIG)` style of the neighbouring tests):

```ts
  it('accepts the three annual block types with their optional presentation fields', () => {
    const cfg = structuredClone(DEFAULT_BULLETIN_CONFIG);
    cfg.pages[0]!.blocks = [
      { id: 'g', type: 'yearGrid', visible: true, showDomains: true, notesLabel: 'Notes', maxLabel: 'Sur' },
      { id: 'd', type: 'yearDecisions', visible: true, title: 'Décisions' },
      {
        id: 's',
        type: 'yearSignatures',
        visible: true,
        title: 'Signatures',
        labels: { director: 'Direction', guardian: 'Les Parents' },
      },
    ];
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it('accepts the cover fields fullName and nisu, the rounded frame, uppercase, logoPosition and fieldLabels', () => {
    const cfg = structuredClone(DEFAULT_BULLETIN_CONFIG);
    cfg.pages[0]!.blocks = [
      {
        id: 'c',
        type: 'cover',
        visible: true,
        sectionLabel: 'Section primaire',
        titlePattern: 'Carnet scolaire',
        showLogo: true,
        framed: true,
        frameStyle: 'rounded',
        uppercase: false,
        logoPosition: 'belowTitle',
        fields: ['fullName', 'className', 'nisu', 'academicYear'],
        fieldLabels: { academicYear: 'Année Scolaire' },
      },
    ];
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(true);
    (cfg.pages[0]!.blocks[0] as { logoPosition: string }).logoPosition = 'left';
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('accepts a sidebar page with an asideWidth between 15 and 40 and breakBefore on it', () => {
    const cfg = structuredClone(DEFAULT_BULLETIN_CONFIG);
    cfg.pages[0] = {
      id: 'grille',
      layout: 'sidebar',
      asideWidth: 22,
      showPageNumber: false,
      blocks: [
        { id: 'g', type: 'yearGrid', visible: true },
        { id: 's', type: 'yearSignatures', visible: true, breakBefore: 'column' },
      ],
    };
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(true);
    cfg.pages[0].asideWidth = 50;
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('templateNeedsYear is true only when a page holds an annual block', () => {
    const cfg = structuredClone(DEFAULT_BULLETIN_CONFIG);
    expect(templateNeedsYear(cfg)).toBe(false);
    cfg.pages[0]!.blocks.push({ id: 'd', type: 'yearDecisions', visible: false });
    expect(templateNeedsYear(cfg)).toBe(true);
  });
```

Add `templateNeedsYear` to the file's import from `./bulletin-templates`.

- [ ] **Step 2: Run the schema tests, expect failures**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-templates.test.ts`
Expected: the four new tests FAIL (unknown discriminator values, `templateNeedsYear` not exported).

- [ ] **Step 3: Extend the Zod schema**

In `frontend/src/lib/server/bulletin-templates.ts`:

```ts
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
```

After `criteriaGridsBlockSchema`:

```ts
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
```

Add the three schemas to `blockSchema`'s `z.discriminatedUnion` after `criteriaGridsBlockSchema`.

Page schema:

```ts
export const pageSchema = z
  .object({
    id: z.string().trim().min(1).max(60),
    layout: z.enum(['full', 'halves', 'sidebar']),
    // Width of the aside column of a `sidebar` page, in percent of the
    // printable width. Read only when layout === 'sidebar'; absent = 25.
    asideWidth: z.number().min(15).max(40).optional(),
    showPageNumber: z.boolean(),
    blocks: z.array(blockSchema).min(1),
  })
  .refine(/* unchanged legacy-count refine */)
  .refine((page) => page.layout !== 'full' || page.blocks.every((b) => b.breakBefore == null), {
    message: 'breakBefore is only valid on a halves- or sidebar-layout page',
  });
```

Update the comment on `blockBase.breakBefore` to mention `sidebar` ("starts the right-hand CSS column on a halves page, the aside column on a sidebar page").

After `export type BulletinTemplateConfig = …`:

```ts
// True when at least one page (visible block or not) holds an annual block:
// getStudentBulletinView only pays for the year-wide computation then.
export function templateNeedsYear(config: Pick<BulletinTemplateConfig, 'pages'>): boolean {
  return config.pages.some((p) =>
    p.blocks.some((b) => (YEAR_BLOCK_TYPES as readonly string[]).includes(b.type)),
  );
}
```

- [ ] **Step 4: Mirror the client types**

In `frontend/src/app/(school)/configuration/modele-bulletin/types.ts`:

```ts
export type BlockType =
  | LegacyBlockType
  | 'text'
  | 'cover'
  | 'criteriaGrids'
  | 'yearGrid'
  | 'yearDecisions'
  | 'yearSignatures';

export const YEAR_BLOCK_TYPES = ['yearGrid', 'yearDecisions', 'yearSignatures'] as const;

export const BLOCK_TYPES: BlockType[] = [
  ...LEGACY_BLOCK_TYPES,
  'text',
  'cover',
  'criteriaGrids',
  ...YEAR_BLOCK_TYPES,
];
```

```ts
export type CoverField =
  | 'lastName'
  | 'firstName'
  | 'fullName'
  | 'className'
  | 'studentNumber'
  | 'nisu'
  | 'academicYear';
export interface CoverBlock extends BlockBase {
  type: 'cover';
  sectionLabel: string;
  titlePattern: string;
  showLogo: boolean;
  framed: boolean;
  frameStyle?: 'dashed' | 'solid' | 'rounded' | undefined;
  /** Absent = true: school name, section label and title in capitals. */
  uppercase?: boolean | undefined;
  /** Absent = 'top'. 'belowTitle' puts the logo between the title and the identity lines. */
  logoPosition?: 'top' | 'belowTitle' | undefined;
  fields: CoverField[];
  /** Per-field label override; absent fields keep the default French label. */
  fieldLabels?: Partial<Record<CoverField, string>> | undefined;
}
/** Matières × périodes grid of the annual carnet (spec 2026-09-06 §4.1). */
export interface YearGridBlock extends BlockBase {
  type: 'yearGrid';
  /** Print a bold heading row each time the subject domain changes. */
  showDomains?: boolean | undefined;
  notesLabel?: string | undefined;
  maxLabel?: string | undefined;
}
export interface YearDecisionsBlock extends BlockBase {
  type: 'yearDecisions';
  title?: string | undefined;
}
export interface YearSignaturesLabels {
  director?: string | undefined;
  guardian?: string | undefined;
}
export interface YearSignaturesBlock extends BlockBase {
  type: 'yearSignatures';
  title?: string | undefined;
  labels?: YearSignaturesLabels | undefined;
}
```

Add the three to the `Block` union; extend `Page`:

```ts
export interface Page {
  id: string;
  layout: 'full' | 'halves' | 'sidebar';
  /** Percent width of the aside column of a sidebar page; absent = 25. */
  asideWidth?: number | undefined;
  showPageNumber: boolean;
  blocks: Block[];
}
```

`block-label.ts`: add `| 'yearGrid' | 'yearDecisions' | 'yearSignatures'` to the `key` union of `BlockLabelT`.

- [ ] **Step 5: Block names in the three locales**

In `modeleBulletin.block` of each file add, after `"criteriaGrids"`:

- fr: `"yearGrid": "Grille annuelle"`, `"yearDecisions": "Décisions de l'année"`, `"yearSignatures": "Signatures par période"`
- en: `"yearGrid": "Annual grid"`, `"yearDecisions": "Year decisions"`, `"yearSignatures": "Signatures per period"`
- ht: `"yearGrid": "Griy anyèl"`, `"yearDecisions": "Desizyon ane a"`, `"yearSignatures": "Siyati pa peryòd"`

- [ ] **Step 6: Write the failing renderer tests (null without annual data)**

Append to `frontend/src/components/bulletin/blocks/blocks.test.tsx` (add the three imports next to the existing renderer imports):

```ts
import { render as renderYearGrid } from './yearGrid';
import { render as renderYearDecisions } from './yearDecisions';
import { render as renderYearSignatures } from './yearSignatures';

describe('annual blocks without annual data', () => {
  it('render nothing when the view carries no `year` payload', () => {
    expect(renderYearGrid({ block: { id: 'g', type: 'yearGrid', visible: true }, config, data })).toBeNull();
    expect(
      renderYearDecisions({ block: { id: 'd', type: 'yearDecisions', visible: true }, config, data }),
    ).toBeNull();
    expect(
      renderYearSignatures({ block: { id: 's', type: 'yearSignatures', visible: true }, config, data }),
    ).toBeNull();
  });
});
```

- [ ] **Step 7: Create the three renderers (null path only) and register them**

`frontend/src/components/bulletin/blocks/yearGrid.tsx`:

```tsx
import type {
  YearGridBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// Matières × périodes grid of the annual carnet (spec 2026-09-06 §4.1).
// Completed in Task 3; without `data.year` the block prints nothing.
export function render({
  data,
}: {
  block: YearGridBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  if (!('year' in data) || data.year == null) return null;
  return null;
}
```

`frontend/src/components/bulletin/blocks/yearDecisions.tsx`:

```tsx
import type {
  YearDecisionsBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// « Décisions » table of the annual carnet (spec 2026-09-06 §4.1).
// Completed in Task 4; without `data.year` the block prints nothing.
export function render({
  data,
}: {
  block: YearDecisionsBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  if (!('year' in data) || data.year == null) return null;
  return null;
}
```

`frontend/src/components/bulletin/blocks/yearSignatures.tsx`:

```tsx
import type {
  YearSignaturesBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// « Signatures » box of the annual carnet (spec 2026-09-06 §4.1).
// Completed in Task 4; without `data.year` the block prints nothing.
export function render({
  data,
}: {
  block: YearSignaturesBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  if (!('year' in data) || data.year == null) return null;
  return null;
}
```

(`'year' in data` keeps this compiling before Task 2 adds the field; Tasks 3 and 4 replace the bodies.)

In `blocks/index.ts` add the three imports and cases:

```ts
    case 'yearGrid':
      return renderYearGrid({ block, config, data });
    case 'yearDecisions':
      return renderYearDecisions({ block, config, data });
    case 'yearSignatures':
      return renderYearSignatures({ block, config, data });
```

- [ ] **Step 8: Run the tests, typecheck, lint**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-templates.test.ts src/components/bulletin/blocks/blocks.test.tsx src/lib/locales.test.ts` then `pnpm typecheck && pnpm lint`
Expected: all PASS (the editor compiles because the new block types need no required fields and their labels exist).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/server/bulletin-templates.ts frontend/src/lib/server/bulletin-templates.test.ts "frontend/src/app/(school)/configuration/modele-bulletin/types.ts" "frontend/src/app/(school)/configuration/modele-bulletin/block-label.ts" frontend/src/messages/fr/configuration.json frontend/src/messages/ht/configuration.json frontend/src/messages/en/configuration.json frontend/src/components/bulletin/blocks/yearGrid.tsx frontend/src/components/bulletin/blocks/yearDecisions.tsx frontend/src/components/bulletin/blocks/yearSignatures.tsx frontend/src/components/bulletin/blocks/index.ts frontend/src/components/bulletin/blocks/blocks.test.tsx
git commit -m "feat(bulletin): annual block types, sidebar page layout and cover options in the template schema"
```

---

### Task 2: Annual data end to end (types, pure builder, view wiring, render data)

**Files:**
- Modify: `frontend/src/components/bulletin/render-data.tsx` (types + `year?` + `nisu`)
- Create: `frontend/src/lib/server/bulletin-pdf/year-data.ts`
- Test: `frontend/src/lib/server/bulletin-pdf/year-data.test.ts` (create)
- Modify: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts`
- Test: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`
- Modify: `frontend/src/components/bulletin/BulletinViewer.tsx:143-177`, `frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx:41-75`, `frontend/src/components/bulletin/sample-bulletin-data.ts`, `frontend/src/components/bulletin/blocks/blocks.test.tsx` and `frontend/src/components/bulletin/BulletinPage.test.tsx` fixtures (add `nisu: null`)

**Interfaces:**
- Produces (in `render-data.tsx`):
  ```ts
  export interface YearTermSubject { subjectName: string; domain: string | null; points: number | null; maxPoints: number }
  export interface YearTermData { termId: string; label: string; order: number; hasGrades: boolean; subjects: YearTermSubject[]; totalPoints: number | null; totalMax: number; average10: number | null; rank: number | null; rankedCount: number; coefficientSum: number }
  export interface YearData { terms: YearTermData[]; generalAverage: number | null; generalCoefficient: number }
  ```
  `BulletinRenderData` gains `nisu: string | null` (required) and `year?: YearData | undefined`.
- Produces (server): `buildYearData(input: BuildYearDataInput): YearData` with
  ```ts
  export interface YearEvaluation { termId: string; classSubjectId: string; coefficient: number; maxScore: number; status: string; countsTowardAverage: boolean; grades: { studentId: string; score: number | null; absent: boolean }[] }
  export interface BuildYearDataInput { terms: { id: string; label: string; order: number }[]; classSubjects: { id: string; subjectName: string; domain: string | null; maxScore: number; coefficient: number | null }[]; evaluations: YearEvaluation[]; studentId: string; classmateIds: string[] }
  ```
- `StudentBulletinView` gains `nisu: string | null` and `year?: YearData`.

- [ ] **Step 1: Add the shared types and fields to `render-data.tsx`**

After `BulletinSubjectRow`:

```ts
// Annual carnet payload (spec 2026-09-06 §3.1). Built server-side by
// lib/server/bulletin-pdf/year-data.ts, read by the yearGrid/yearDecisions/
// yearSignatures renderers. Declared here (Ruling R1) so both sides share it.
export interface YearTermSubject {
  subjectName: string;
  domain: string | null;
  /** Notes: points on `maxPoints`, null when the student has no grade. */
  points: number | null;
  /** Sur: Subject.maxScore × coefficient. */
  maxPoints: number;
}
export interface YearTermData {
  termId: string;
  label: string;
  order: number;
  /** At least one classmate has an average for this period. */
  hasGrades: boolean;
  subjects: YearTermSubject[];
  totalPoints: number | null;
  totalMax: number;
  /** Total ÷ Sur × 10, rounded to a tenth. */
  average10: number | null;
  rank: number | null;
  rankedCount: number;
  coefficientSum: number;
}
export interface YearData {
  terms: YearTermData[];
  /** Sum of average10 over the periods where the student has one. */
  generalAverage: number | null;
  generalCoefficient: number;
}
```

In `BulletinRenderData`, after `qualitativeSubjects`:

```ts
  // Spec 2026-09-06: carnet cover « NISU » line and the annual payload,
  // present only when the resolved template holds an annual block.
  nisu: string | null;
  year?: YearData | undefined;
```

Add `nisu: null,` to the `data` fixtures of `blocks.test.tsx` and `BulletinPage.test.tsx`, and to `SAMPLE_BULLETIN_DATA` (`nisu: '0123456789'`) plus this sample `year` (4 periods, two graded):

```ts
  year: {
    terms: [
      {
        termId: 'c1',
        label: '1er contrôle',
        order: 1,
        hasGrades: true,
        subjects: [
          { subjectName: 'Mathématiques', domain: 'Sciences', points: 62.7, maxPoints: 80 },
          { subjectName: 'Sciences', domain: 'Sciences', points: 54, maxPoints: 60 },
          { subjectName: 'Français', domain: 'Lettres', points: 48, maxPoints: 80 },
          { subjectName: 'Anglais', domain: 'Lettres', points: 30, maxPoints: 60 },
          { subjectName: 'Histoire-Géo', domain: null, points: 33, maxPoints: 40 },
        ],
        totalPoints: 227.7,
        totalMax: 320,
        average10: 7.1,
        rank: 4,
        rankedCount: 28,
        coefficientSum: 16,
      },
      {
        termId: 'c2',
        label: '2ème contrôle',
        order: 2,
        hasGrades: true,
        subjects: [
          { subjectName: 'Mathématiques', domain: 'Sciences', points: 58, maxPoints: 80 },
          { subjectName: 'Sciences', domain: 'Sciences', points: 51, maxPoints: 60 },
          { subjectName: 'Français', domain: 'Lettres', points: 52, maxPoints: 80 },
          { subjectName: 'Anglais', domain: 'Lettres', points: null, maxPoints: 60 },
          { subjectName: 'Histoire-Géo', domain: null, points: 30, maxPoints: 40 },
        ],
        totalPoints: 191,
        totalMax: 320,
        average10: 6,
        rank: 6,
        rankedCount: 28,
        coefficientSum: 16,
      },
      {
        termId: 'c3',
        label: '3ème contrôle',
        order: 3,
        hasGrades: false,
        subjects: [
          { subjectName: 'Mathématiques', domain: 'Sciences', points: null, maxPoints: 80 },
          { subjectName: 'Sciences', domain: 'Sciences', points: null, maxPoints: 60 },
          { subjectName: 'Français', domain: 'Lettres', points: null, maxPoints: 80 },
          { subjectName: 'Anglais', domain: 'Lettres', points: null, maxPoints: 60 },
          { subjectName: 'Histoire-Géo', domain: null, points: null, maxPoints: 40 },
        ],
        totalPoints: null,
        totalMax: 320,
        average10: null,
        rank: null,
        rankedCount: 0,
        coefficientSum: 16,
      },
      {
        termId: 'c4',
        label: '4ème contrôle',
        order: 4,
        hasGrades: false,
        subjects: [
          { subjectName: 'Mathématiques', domain: 'Sciences', points: null, maxPoints: 80 },
          { subjectName: 'Sciences', domain: 'Sciences', points: null, maxPoints: 60 },
          { subjectName: 'Français', domain: 'Lettres', points: null, maxPoints: 80 },
          { subjectName: 'Anglais', domain: 'Lettres', points: null, maxPoints: 60 },
          { subjectName: 'Histoire-Géo', domain: null, points: null, maxPoints: 40 },
        ],
        totalPoints: null,
        totalMax: 320,
        average10: null,
        rank: null,
        rankedCount: 0,
        coefficientSum: 16,
      },
    ],
    generalAverage: 13.1,
    generalCoefficient: 32,
  },
```

- [ ] **Step 2: Write the failing builder tests**

Create `frontend/src/lib/server/bulletin-pdf/year-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildYearData, type BuildYearDataInput, type YearEvaluation } from './year-data';

const terms = [
  { id: 't1', label: '1er contrôle', order: 1 },
  { id: 't2', label: '2ème contrôle', order: 2 },
  { id: 't3', label: '3ème contrôle', order: 3 },
];
// Maths: max 10, coef 4 → Sur 40. Français: max 20, coef 2 → Sur 40.
// Anglais: max 50, coef null (counts as 1) → Sur 50.
const classSubjects = [
  { id: 'cs_math', subjectName: 'Mathématiques', domain: 'Sciences', maxScore: 10, coefficient: 4 },
  { id: 'cs_fr', subjectName: 'Français', domain: 'Lettres', maxScore: 20, coefficient: 2 },
  { id: 'cs_en', subjectName: 'Anglais', domain: null, maxScore: 50, coefficient: null },
];
const ev = (
  termId: string,
  classSubjectId: string,
  maxScore: number,
  scores: Record<string, number | null>,
  extra: Partial<YearEvaluation> = {},
): YearEvaluation => ({
  termId,
  classSubjectId,
  coefficient: 1,
  maxScore,
  status: 'PUBLISHED',
  countsTowardAverage: true,
  grades: Object.entries(scores).map(([studentId, score]) => ({ studentId, score, absent: false })),
  ...extra,
});
const base: BuildYearDataInput = {
  terms,
  classSubjects,
  evaluations: [
    // t1: self 8/10 in maths (→ 32/40), 15/20 in français (→ 30/40), 40/50 in anglais (→ 40/50).
    ev('t1', 'cs_math', 10, { self: 8, mate: 5 }),
    ev('t1', 'cs_fr', 20, { self: 15, mate: 15 }),
    ev('t1', 'cs_en', 50, { self: 40, mate: 20 }),
    // t2: only maths graded, self 7/10 (→ 28/40), mate absent.
    ev('t2', 'cs_math', 10, { self: 7, mate: null }),
    // t3: a draft evaluation must not count.
    ev('t3', 'cs_math', 10, { self: 10, mate: 10 }, { status: 'DRAFT' }),
  ],
  studentId: 'self',
  classmateIds: ['self', 'mate'],
};

describe('buildYearData', () => {
  it('Sur = maxScore × coefficient (1 when unset), identical for every period', () => {
    const year = buildYearData(base);
    expect(year.terms.map((t) => t.subjects.map((s) => s.maxPoints))).toEqual([
      [40, 40, 50],
      [40, 40, 50],
      [40, 40, 50],
    ]);
    expect(year.terms.every((t) => t.totalMax === 130)).toBe(true);
    expect(year.terms.every((t) => t.coefficientSum === 7)).toBe(true);
  });

  it('Notes = average on 20 brought to Sur, rounded to a tenth; Total, Moyenne and Place per period', () => {
    const t1 = buildYearData(base).terms[0]!;
    expect(t1.subjects.map((s) => s.points)).toEqual([32, 30, 40]);
    expect(t1.totalPoints).toBe(102);
    expect(t1.average10).toBe(7.8); // 102 / 130 × 10 = 7.846…
    expect(t1.hasGrades).toBe(true);
    expect(t1.rank).toBe(1);
    expect(t1.rankedCount).toBe(2);
  });

  it('an ungraded subject prints empty but keeps its Sur in the total', () => {
    const t2 = buildYearData(base).terms[1]!;
    expect(t2.subjects.map((s) => s.points)).toEqual([28, null, null]);
    expect(t2.totalPoints).toBe(28);
    expect(t2.totalMax).toBe(130);
    expect(t2.average10).toBe(2.2); // 28 / 130 × 10 = 2.15…
    // The classmate has no grade at all this period: ranked alone.
    expect(t2.rank).toBe(1);
    expect(t2.rankedCount).toBe(1);
  });

  it('a period with no published grade in the class stays entirely empty', () => {
    const t3 = buildYearData(base).terms[2]!;
    expect(t3.hasGrades).toBe(false);
    expect(t3.subjects.every((s) => s.points === null)).toBe(true);
    expect(t3.totalPoints).toBeNull();
    expect(t3.average10).toBeNull();
    expect(t3.rank).toBeNull();
    expect(t3.rankedCount).toBe(0);
  });

  it('a student without any grade in a graded period gets null values but the period keeps hasGrades', () => {
    const year = buildYearData({ ...base, studentId: 'ghost', classmateIds: ['self', 'mate', 'ghost'] });
    const t1 = year.terms[0]!;
    expect(t1.hasGrades).toBe(true);
    expect(t1.totalPoints).toBeNull();
    expect(t1.average10).toBeNull();
    expect(t1.rank).toBeNull();
    expect(t1.rankedCount).toBe(2);
  });

  it('shares the rank between tied classmates (competition ranking)', () => {
    const year = buildYearData({
      ...base,
      evaluations: [ev('t1', 'cs_math', 10, { self: 8, mate: 8, third: 2 })],
      classmateIds: ['self', 'mate', 'third'],
    });
    expect(year.terms[0]!.rank).toBe(1);
    expect(year.terms[0]!.rankedCount).toBe(3);
    const third = buildYearData({
      ...base,
      studentId: 'third',
      evaluations: [ev('t1', 'cs_math', 10, { self: 8, mate: 8, third: 2 })],
      classmateIds: ['self', 'mate', 'third'],
    });
    expect(third.terms[0]!.rank).toBe(3);
  });

  it('Moyenne Générale sums the averages of the graded periods, its coefficient sums theirs', () => {
    const year = buildYearData(base);
    expect(year.generalAverage).toBe(10); // 7.8 + 2.2
    expect(year.generalCoefficient).toBe(14);
    const empty = buildYearData({ ...base, evaluations: [] });
    expect(empty.generalAverage).toBeNull();
    expect(empty.generalCoefficient).toBe(0);
  });

  it('keeps the periods in order and the subjects in the given order', () => {
    const year = buildYearData({ ...base, terms: [terms[2]!, terms[0]!, terms[1]!] });
    expect(year.terms.map((t) => t.label)).toEqual(['1er contrôle', '2ème contrôle', '3ème contrôle']);
    expect(year.terms[0]!.subjects.map((s) => s.subjectName)).toEqual([
      'Mathématiques',
      'Français',
      'Anglais',
    ]);
  });
});
```

- [ ] **Step 3: Run the builder tests, expect failure**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-pdf/year-data.test.ts`
Expected: FAIL, module `./year-data` not found.

- [ ] **Step 4: Implement `year-data.ts`**

```ts
// Annual carnet computation (spec 2026-09-06 §2 and §3.2). Pure: no Prisma,
// so the calculation rules are unit-tested without a database. The per-
// subject average on 20 comes from grades.ts's subjectAverageFor (published
// + counted evaluations only, absent/ungraded excluded), then is brought to
// the subject's Sur = maxScore × coefficient. Totals run over EVERY numeric
// subject of the class, so Sur is the same for every student and an ungraded
// subject contributes 0 points (the school's rule, validated 2026-09-06).
import 'server-only';
import { competitionRank, roundToTenth, subjectAverageFor } from '@/lib/server/grades';
import type { YearData, YearTermData } from '@/components/bulletin/render-data';

export interface YearEvaluation {
  termId: string;
  classSubjectId: string;
  coefficient: number;
  maxScore: number;
  status: string;
  countsTowardAverage: boolean;
  grades: { studentId: string; score: number | null; absent: boolean }[];
}

export interface BuildYearDataInput {
  terms: { id: string; label: string; order: number }[];
  classSubjects: {
    id: string;
    subjectName: string;
    domain: string | null;
    maxScore: number;
    coefficient: number | null;
  }[];
  evaluations: YearEvaluation[];
  studentId: string;
  classmateIds: string[];
}

interface StudentTermPoints {
  points: (number | null)[];
  total: number | null;
  average10: number | null;
}

export function buildYearData(input: BuildYearDataInput): YearData {
  const { classSubjects, studentId, classmateIds } = input;
  const maxPoints = classSubjects.map((cs) => cs.maxScore * (cs.coefficient ?? 1));
  const totalMax = maxPoints.reduce((sum, m) => sum + m, 0);
  const coefficientSum = classSubjects.reduce((sum, cs) => sum + (cs.coefficient ?? 1), 0);

  const byTerm = new Map<string, Map<string, YearEvaluation[]>>();
  for (const ev of input.evaluations) {
    const bySubject = byTerm.get(ev.termId) ?? new Map<string, YearEvaluation[]>();
    const list = bySubject.get(ev.classSubjectId) ?? [];
    list.push(ev);
    bySubject.set(ev.classSubjectId, list);
    byTerm.set(ev.termId, bySubject);
  }

  const pointsFor = (
    bySubject: Map<string, YearEvaluation[]>,
    sid: string,
  ): StudentTermPoints => {
    let any = false;
    let total = 0;
    const points = classSubjects.map((cs, i) => {
      const avg = subjectAverageFor(bySubject.get(cs.id) ?? [], sid);
      if (avg == null) return null;
      any = true;
      const p = roundToTenth((avg / 20) * maxPoints[i]!);
      total += p;
      return p;
    });
    if (!any || totalMax === 0) return { points, total: null, average10: null };
    return {
      points,
      total: roundToTenth(total),
      average10: roundToTenth((total / totalMax) * 10),
    };
  };

  const terms: YearTermData[] = [...input.terms]
    .sort((a, b) => a.order - b.order)
    .map((term) => {
      const bySubject = byTerm.get(term.id) ?? new Map<string, YearEvaluation[]>();
      const own = pointsFor(bySubject, studentId);
      const ranked = classmateIds
        .map((id) => ({ studentId: id, average10: pointsFor(bySubject, id).average10 }))
        .filter((r): r is { studentId: string; average10: number } => r.average10 != null)
        .sort((a, b) => b.average10 - a.average10);
      const ranks = competitionRank(ranked, (r) => r.average10);
      const rankEntry = ranked.findIndex((r) => r.studentId === studentId);
      return {
        termId: term.id,
        label: term.label,
        order: term.order,
        hasGrades: ranked.length > 0,
        subjects: classSubjects.map((cs, i) => ({
          subjectName: cs.subjectName,
          domain: cs.domain,
          points: own.points[i] ?? null,
          maxPoints: maxPoints[i]!,
        })),
        totalPoints: own.total,
        totalMax,
        average10: own.average10,
        rank: rankEntry >= 0 ? ranks[rankEntry]! : null,
        rankedCount: ranked.length,
        coefficientSum,
      };
    });

  const graded = terms.filter((t) => t.average10 != null);
  return {
    terms,
    generalAverage: graded.length
      ? roundToTenth(graded.reduce((sum, t) => sum + (t.average10 ?? 0), 0))
      : null,
    generalCoefficient: graded.reduce((sum, t) => sum + t.coefficientSum, 0),
  };
}
```

Note: `pointsFor` is called once per classmate per term (the same loop shape `classGeneralAverages` already runs per term); a class of 40 students × 4 periods × 25 subjects is a few thousand `subjectAverageFor` calls, fine.

- [ ] **Step 5: Run the builder tests, expect PASS**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-pdf/year-data.test.ts`
Expected: 8 passed. (If the `average10` expectations differ by a rounding of the intermediate `total`, the test values above are the authority: 102/130×10 = 7.846 → 7.8; 28/130×10 = 2.153 → 2.2; 7.8 + 2.2 = 10.)

- [ ] **Step 6: Write the failing view tests**

Append to `describe('getStudentBulletinView', …)` in `get-bulletin-view.test.ts`:

```ts
  it('computes no annual payload and queries only the current term when the template has no annual block', async () => {
    const view = await getStudentBulletinView('school_1', 'stu_1', 'term_1');
    expect(view?.year).toBeUndefined();
    expect(view?.nisu).toBeNull();
    expect(
      (prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>).termId,
    ).toBe('term_1');
  });

  it('computes the annual payload over every term of the year when the template holds an annual block', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 'stu_1',
      schoolId: 'school_1',
      firstName: 'Nadia',
      lastName: 'Joseph',
      studentNumber: 'EL-2025-002',
      nisu: '0123456789',
      dateOfBirth: null,
    } as never);
    prismaMock.term.findMany.mockResolvedValue([
      { id: 'term_1', label: '1er contrôle', order: 1, startDate: T_START, endDate: T_END },
      { id: 'term_2', label: '2ème contrôle', order: 2, startDate: T_END, endDate: T_END },
    ] as never);
    // normalizeConfig falls back to the DEFAULT config when a pages-shaped
    // config fails the schema, so the mock must be a complete valid config.
    prismaMock.bulletinTemplate.findFirst.mockResolvedValue({
      id: 'tpl_year',
      name: 'Carnet',
      config: {
        ...DEFAULT_BULLETIN_CONFIG,
        pages: [
          {
            id: 'p',
            layout: 'full',
            showPageNumber: false,
            blocks: [{ id: 'g', type: 'yearGrid', visible: true }],
          },
        ],
      },
      isActive: true,
    } as never);
    prismaMock.classSubject.findMany.mockResolvedValue([
      {
        id: 'cs_1',
        classId: 'cls_1',
        subjectId: 'sub_1',
        coefficient: 4,
        subject: { name: 'Mathématiques', domain: 'Sciences', maxScore: 10 },
        teacher: null,
      },
    ] as never);
    prismaMock.evaluation.findMany.mockResolvedValue([
      {
        id: 'ev_1',
        classSubjectId: 'cs_1',
        termId: 'term_1',
        coefficient: 1,
        maxScore: 20,
        status: 'PUBLISHED',
        countsTowardAverage: true,
        grades: [
          { studentId: 'stu_0', score: 10, absent: false },
          { studentId: 'stu_1', score: 16, absent: false },
        ],
      },
      {
        id: 'ev_2',
        classSubjectId: 'cs_1',
        termId: 'term_2',
        coefficient: 1,
        maxScore: 20,
        status: 'PUBLISHED',
        countsTowardAverage: true,
        grades: [{ studentId: 'stu_1', score: 10, absent: false }],
      },
    ] as never);

    const view = await getStudentBulletinView('school_1', 'stu_1', 'term_1');

    expect(view?.nisu).toBe('0123456789');
    expect(
      (prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>).termId,
    ).toEqual({ in: ['term_1', 'term_2'] });
    // The per-term table still only sees the current term's evaluations.
    expect(view?.subjects[0]?.average).toBe(16);
    expect(view?.year?.terms.map((t) => t.label)).toEqual(['1er contrôle', '2ème contrôle']);
    expect(view?.year?.terms[0]?.subjects[0]).toEqual({
      subjectName: 'Mathématiques',
      domain: 'Sciences',
      points: 32,
      maxPoints: 40,
    });
    expect(view?.year?.terms[0]?.average10).toBe(8);
    expect(view?.year?.terms[0]?.rank).toBe(1);
    expect(view?.year?.terms[1]?.average10).toBe(5);
    expect(view?.year?.generalAverage).toBe(13);
    expect(view?.year?.generalCoefficient).toBe(8);
  });
```

Add `DEFAULT_BULLETIN_CONFIG` to the test file's import from `@/lib/server/bulletin-templates`.

- [ ] **Step 7: Run the view tests, expect the two new ones to fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`

- [ ] **Step 8: Wire the view**

In `get-bulletin-view.ts`:

- Imports: add `import { buildYearData } from './year-data';`, add `templateNeedsYear` to the import from `@/lib/server/bulletin-templates`, and `import type { YearData } from '@/components/bulletin/render-data';`.
- `StudentBulletinView`: add `nisu: string | null;` after `studentNumber`, and after `generalAppreciation`:
  ```ts
  // Annual carnet payload (spec 2026-09-06 §3), only when the resolved
  // template holds an annual block; absent otherwise.
  year?: YearData;
  ```
- `shell`: add `nisu: student.nisu ?? null,` after `studentNumber`.
- Replace the evaluations query block:

```ts
  // Annual templates need every period of the year: one wider query
  // instead of a second one (Ruling R4); the per-term table below filters
  // the current period in memory.
  const needsYear = shell.template ? templateNeedsYear(shell.template.config) : false;
  const termIds = terms.map((t) => t.id);
  const [allEvaluations, appreciations] = await Promise.all([
    classSubjectIds.length === 0
      ? Promise.resolve([])
      : prisma.evaluation.findMany({
          where: {
            classSubjectId: { in: classSubjectIds },
            termId: needsYear ? { in: termIds } : term.id,
            ...publishedOnly,
          },
          include: { grades: true },
        }),
    prisma.appreciation.findMany({ where: { studentId, termId: term.id, ...publishedOnly } }),
  ]);
  const evaluations = needsYear
    ? allEvaluations.filter((ev) => ev.termId === term.id)
    : allEvaluations;
```

- Before the final `return`, compute:

```ts
  const year: YearData | undefined = needsYear
    ? buildYearData({
        terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
        classSubjects: classSubjects.map((cs) => ({
          id: cs.id,
          subjectName: cs.subject.name,
          domain: cs.subject.domain,
          maxScore: cs.subject.maxScore,
          coefficient: cs.coefficient,
        })),
        evaluations: allEvaluations,
        studentId,
        classmateIds,
      })
    : undefined;
```

and add `...(year ? { year } : {}),` to the returned object (never `year: undefined`, `exactOptionalPropertyTypes`).

- [ ] **Step 9: Propagate to the two real render-data mappings**

`BulletinViewer.tsx` (the `renderData` literal) and `app/print/bulletin/[studentId]/[termId]/page.tsx` (the `renderData` literal): add

```ts
    nisu: data.nisu,            // `view.nisu` in the print page
    ...(data.year ? { year: data.year } : {}),
```

`BulletinViewer.tsx` reads its response through the `StudentBulletinData` type (`useApi<StudentBulletinData>`); find its declaration (in the viewer file or the module it imports it from) and add `nisu: string | null;` and `year?: YearData | undefined;` (`import type { YearData } from './render-data'`). The editor's `previewData` spreads `SAMPLE_BULLETIN_DATA`, nothing to change there.

- [ ] **Step 10: Run the suite, typecheck, lint**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-pdf src/components/bulletin` then `pnpm typecheck && pnpm lint`
Expected: PASS. If an existing view test asserted `where.termId === 'term_1'` on the evaluation query it still passes (the default template has no annual block).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/bulletin/render-data.tsx frontend/src/components/bulletin/sample-bulletin-data.ts frontend/src/components/bulletin/blocks/blocks.test.tsx frontend/src/components/bulletin/BulletinPage.test.tsx frontend/src/lib/server/bulletin-pdf/year-data.ts frontend/src/lib/server/bulletin-pdf/year-data.test.ts frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts frontend/src/components/bulletin/BulletinViewer.tsx "frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx"
git commit -m "feat(bulletin): annual carnet data (points on Sur, per-period average and rank) on the bulletin view"
```

---

### Task 3: `yearGrid` renderer

**Files:**
- Modify: `frontend/src/components/bulletin/blocks/yearGrid.tsx`
- Test: `frontend/src/components/bulletin/blocks/blocks.test.tsx`

**Interfaces:**
- Consumes `data.year` (`YearData`, Task 2), `block.showDomains`, `block.notesLabel`, `block.maxLabel`.
- Produces the shared helpers `fmtPoints(n: number | null): string` (`''` for null, French decimal comma, no trailing `.0`) and `place(n: number | null): string` (`''`, `'1er'`, `'2e'`…) exported from `yearGrid.tsx` for Task 4.

- [ ] **Step 1: Write the failing tests**

In `blocks.test.tsx`, add `import { SAMPLE_BULLETIN_DATA } from '../sample-bulletin-data';` and:

```ts
describe('yearGrid block', () => {
  const dataWithYear: BulletinRenderData = { ...data, year: SAMPLE_BULLETIN_DATA.year };

  it('prints one two-column group per period with Notes/Sur sub-headers and a border on every cell', () => {
    const out = html(renderYearGrid({ block: { id: 'g', type: 'yearGrid', visible: true }, config, data: dataWithYear }));
    expect(out).toContain('Matières');
    for (const label of ['1er contrôle', '2ème contrôle', '3ème contrôle', '4ème contrôle']) {
      expect(out).toContain(`colspan="2"`);
      expect(out).toContain(label);
    }
    expect(out.match(/>Notes</g)).toHaveLength(4);
    expect(out.match(/>Sur</g)).toHaveLength(4);
    expect(out).toContain('border:1px solid #1a1a2e');
  });

  it('prints points with a decimal comma, Sur only for graded periods, and empty cells otherwise', () => {
    const out = html(renderYearGrid({ block: { id: 'g', type: 'yearGrid', visible: true }, config, data: dataWithYear }));
    expect(out).toContain('>62,7<');
    expect(out).toContain('>80<');
    // Anglais has no grade in the 2nd period: empty Notes cell, Sur still printed.
    expect(out).toContain('>60<');
    // The two ungraded periods print no Sur at all: 5 subjects × 2 graded periods = 10 Sur cells.
    expect(out.match(/>(80|60|40)</g)).toHaveLength(10);
  });

  it('prints Total, Moyenne and Place rows', () => {
    const out = html(renderYearGrid({ block: { id: 'g', type: 'yearGrid', visible: true }, config, data: dataWithYear }));
    expect(out).toContain('>Total<');
    expect(out).toContain('>227,7<');
    expect(out).toContain('>320<');
    expect(out).toContain('>Moyenne<');
    expect(out).toContain('>7,1<');
    expect(out).toContain('>Place<');
    expect(out).toContain('>4e<');
    expect(out).toContain('>6e<');
  });

  it('prints a bold domain heading row when the domain changes and showDomains is on', () => {
    const on = html(renderYearGrid({ block: { id: 'g', type: 'yearGrid', visible: true, showDomains: true }, config, data: dataWithYear }));
    expect(on).toContain('>Sciences<');
    expect(on).toContain('>Lettres<');
    const off = html(renderYearGrid({ block: { id: 'g', type: 'yearGrid', visible: true }, config, data: dataWithYear }));
    expect(off).not.toContain('>Lettres<');
  });

  it('uses the custom Notes/Sur labels', () => {
    const out = html(renderYearGrid({ block: { id: 'g', type: 'yearGrid', visible: true, notesLabel: 'Pts', maxLabel: 'Max' }, config, data: dataWithYear }));
    expect(out.match(/>Pts</g)).toHaveLength(4);
    expect(out.match(/>Max</g)).toHaveLength(4);
  });
});
```

(Adjust the `>(80|60|40)<` count if `place()`/other cells collide: the domain rows print no numbers, the Total row prints `320` which is not in the alternation.)

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter frontend exec vitest run src/components/bulletin/blocks/blocks.test.tsx`

- [ ] **Step 3: Implement the renderer**

```tsx
import { Fragment } from 'react';
import type {
  YearGridBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData, YearTermData } from '../render-data';

// Matières × périodes grid of the annual carnet (spec 2026-09-06 §4.1):
// Word-style table, a thin border on every cell, one two-column group
// (Notes, Sur) per period of the year, then Total / Moyenne / Place rows.
export const INK = '#1a1a2e';

/** French decimal comma, no trailing zero, empty for null. */
export function fmtPoints(n: number | null): string {
  return n == null ? '' : String(n).replace('.', ',');
}
/** Rank as printed on the carnet: 1er, 2e, 3e…; empty for null. */
export function place(n: number | null): string {
  return n == null ? '' : n === 1 ? '1er' : `${n}e`;
}

export function render({
  block,
  config,
  data,
}: {
  block: YearGridBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const year = data.year;
  if (!year || year.terms.length === 0) return null;
  const terms: YearTermData[] = year.terms;
  const subjects = terms[0]!.subjects;
  const notesLabel = block.notesLabel ?? 'Notes';
  const maxLabel = block.maxLabel ?? 'Sur';

  const cell: React.CSSProperties = {
    border: `1px solid ${INK}`,
    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
    color: INK,
  };
  const head: React.CSSProperties = { ...cell, fontSize: config.typography.tableHeader, fontWeight: 700 };
  const body: React.CSSProperties = { ...cell, fontSize: config.typography.tableBody };
  const num: React.CSSProperties = { ...body, textAlign: 'center', fontSize: config.typography.noteValue };

  const rows: React.ReactNode[] = [];
  let lastDomain: string | null = null;
  subjects.forEach((subject, i) => {
    if (block.showDomains && subject.domain && subject.domain !== lastDomain) {
      rows.push(
        <tr key={`domain-${subject.domain}`}>
          <td style={{ ...body, fontWeight: 700 }}>{subject.domain}</td>
          {terms.map((t) => (
            <Fragment key={t.termId}>
              <td style={cell} />
              <td style={cell} />
            </Fragment>
          ))}
        </tr>,
      );
    }
    lastDomain = subject.domain;
    rows.push(
      <tr key={subject.subjectName}>
        <td style={body}>{subject.subjectName}</td>
        {terms.map((t) => {
          const s = t.subjects[i];
          return (
            <Fragment key={t.termId}>
              <td style={num}>{fmtPoints(s?.points ?? null)}</td>
              <td style={num}>{t.hasGrades && s ? String(s.maxPoints) : ''}</td>
            </Fragment>
          );
        })}
      </tr>,
    );
  });

  const footRow = (label: string, left: (t: YearTermData) => string, right: (t: YearTermData) => string) => (
    <tr>
      <td style={{ ...body, fontWeight: 700 }}>{label}</td>
      {terms.map((t) => (
        <Fragment key={t.termId}>
          <td style={{ ...num, fontWeight: 700 }}>{left(t)}</td>
          <td style={{ ...num, fontWeight: 700 }}>{right(t)}</td>
        </Fragment>
      ))}
    </tr>
  );

  return (
    <table
      className="w-full border-collapse"
      style={{ lineHeight: config.layout.tableLineHeight, breakInside: 'avoid' }}
    >
      <thead>
        <tr>
          <th rowSpan={2} style={{ ...head, textAlign: 'left', width: '32%', fontSize: config.typography.tableBody + 1 }}>
            Matières
          </th>
          {terms.map((t) => (
            <th key={t.termId} colSpan={2} style={{ ...head, textAlign: 'center' }}>
              {t.label}
            </th>
          ))}
        </tr>
        <tr>
          {terms.map((t) => (
            <Fragment key={t.termId}>
              <th style={{ ...head, textAlign: 'center', fontWeight: 400 }}>{notesLabel}</th>
              <th style={{ ...head, textAlign: 'center', fontWeight: 400 }}>{maxLabel}</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows}
        {footRow('Total', (t) => fmtPoints(t.totalPoints), (t) => (t.hasGrades ? String(t.totalMax) : ''))}
        {footRow('Moyenne', (t) => fmtPoints(t.average10), () => '')}
        {footRow('Place', (t) => place(t.rank), () => '')}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `pnpm --filter frontend exec vitest run src/components/bulletin/blocks/blocks.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/bulletin/blocks/yearGrid.tsx frontend/src/components/bulletin/blocks/blocks.test.tsx
git commit -m "feat(bulletin): yearGrid block, the Matières × périodes table of the annual carnet"
```

---

### Task 4: `yearDecisions` and `yearSignatures` renderers

**Files:**
- Modify: `frontend/src/components/bulletin/blocks/yearDecisions.tsx`, `frontend/src/components/bulletin/blocks/yearSignatures.tsx`
- Test: `frontend/src/components/bulletin/blocks/blocks.test.tsx`

**Interfaces:**
- Consumes `data.year`, `fmtPoints`/`INK` from `./yearGrid`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('yearDecisions block', () => {
  const dataWithYear: BulletinRenderData = { ...data, year: SAMPLE_BULLETIN_DATA.year };

  it('prints one roman-numbered row per period with Moyenne and Coefficient, then Moyenne Générale', () => {
    const out = html(renderYearDecisions({ block: { id: 'd', type: 'yearDecisions', visible: true }, config, data: dataWithYear }));
    expect(out).toContain('>Décisions<');
    expect(out).toContain('>Contrôle<');
    expect(out).toContain('>Moyenne<');
    expect(out).toContain('>Coefficient<');
    for (const n of ['I', 'II', 'III', 'IV']) expect(out).toContain(`>${n}<`);
    expect(out).toContain('>7,1<');
    expect(out).toContain('>6<');
    expect(out.match(/>16</g)).toHaveLength(2); // coefficient printed for the two graded periods only
    expect(out).toContain('>Moyenne Générale<');
    expect(out).toContain('>13,1<');
    expect(out).toContain('>32<');
  });

  it('uses the custom title', () => {
    const out = html(renderYearDecisions({ block: { id: 'd', type: 'yearDecisions', visible: true, title: 'Bilan' }, config, data: dataWithYear }));
    expect(out).toContain('>Bilan<');
    expect(out).not.toContain('>Décisions<');
  });
});

describe('yearSignatures block', () => {
  const dataWithYear: BulletinRenderData = { ...data, year: SAMPLE_BULLETIN_DATA.year };

  it('prints a Signatures heading and one Direction + Les Parents pair per period', () => {
    const out = html(renderYearSignatures({ block: { id: 's', type: 'yearSignatures', visible: true }, config, data: dataWithYear }));
    expect(out).toContain('>Signatures<');
    expect(out.match(/>Direction</g)).toHaveLength(4);
    expect(out.match(/>Les Parents</g)).toHaveLength(4);
  });

  it('uses the custom title and labels', () => {
    const out = html(renderYearSignatures({ block: { id: 's', type: 'yearSignatures', visible: true, title: 'Visas', labels: { director: 'La direction', guardian: 'Le parent' } }, config, data: dataWithYear }));
    expect(out).toContain('>Visas<');
    expect(out.match(/>La direction</g)).toHaveLength(4);
    expect(out.match(/>Le parent</g)).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement `yearDecisions.tsx`**

```tsx
import type {
  YearDecisionsBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { INK, fmtPoints } from './yearGrid';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// « Décisions » table of the annual carnet (spec 2026-09-06 §4.1): one row
// per period (roman numeral, Moyenne on 10, Coefficient = sum of the subject
// coefficients), then the Moyenne Générale row (sum of the graded periods).
export function render({
  block,
  config,
  data,
}: {
  block: YearDecisionsBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const year = data.year;
  if (!year || year.terms.length === 0) return null;
  const cell: React.CSSProperties = {
    border: `1px solid ${INK}`,
    padding: `${config.layout.cellPaddingY}px ${config.layout.cellPaddingX}px`,
    color: INK,
    fontSize: config.typography.tableBody,
  };
  const center: React.CSSProperties = { ...cell, textAlign: 'center' };
  return (
    <div>
      <div
        className="mb-2 font-bold underline"
        style={{ color: INK, fontSize: config.typography.tableBody + 1 }}
      >
        {block.title ?? 'Décisions'}
      </div>
      <table className="w-full border-collapse" style={{ lineHeight: config.layout.tableLineHeight }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Contrôle</th>
            <th style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Moyenne</th>
            <th style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Coefficient</th>
          </tr>
        </thead>
        <tbody>
          {year.terms.map((t, i) => (
            <tr key={t.termId}>
              <td style={{ ...cell, fontWeight: 700 }}>{ROMAN[i] ?? String(i + 1)}</td>
              <td style={center}>{fmtPoints(t.average10)}</td>
              <td style={center}>{t.hasGrades ? String(t.coefficientSum) : ''}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }}>Moyenne Générale</td>
            <td style={{ ...center, fontWeight: 700 }}>{fmtPoints(year.generalAverage)}</td>
            <td style={{ ...center, fontWeight: 700 }}>
              {year.generalAverage == null ? '' : String(year.generalCoefficient)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Implement `yearSignatures.tsx`**

```tsx
import type {
  YearSignaturesBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { INK } from './yearGrid';

// « Signatures » box of the annual carnet (spec 2026-09-06 §4.1): a framed
// column with a rounded title box, then one « Direction » line and one
// « Les Parents » line per period, spread over the available height.
// BulletinPage gives this block the full column height (Task 6).
export function render({
  block,
  config,
  data,
}: {
  block: YearSignaturesBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const year = data.year;
  if (!year || year.terms.length === 0) return null;
  const director = block.labels?.director ?? 'Direction';
  const guardian = block.labels?.guardian ?? 'Les Parents';
  const fontSize = config.typography.tableBody;
  const line = (label: string, bold: boolean) => (
    <div>
      <div className="border-b" style={{ borderColor: INK, minHeight: 22 }} />
      <div
        className="mt-0.5 text-center"
        style={{ color: INK, fontSize, fontWeight: bold ? 700 : 400 }}
      >
        {label}
      </div>
    </div>
  );
  return (
    <div className="flex h-full flex-col border px-3 py-3" style={{ borderColor: INK }}>
      <div
        className="mx-auto mb-3 rounded-lg border px-5 py-1.5 text-center font-bold"
        style={{ borderColor: INK, color: INK, fontSize: fontSize + 3 }}
      >
        {block.title ?? 'Signatures'}
      </div>
      <div className="flex flex-1 flex-col justify-around gap-4">
        {year.terms.map((t) => (
          <div key={t.termId} className="flex flex-col gap-3" data-term-id={t.termId}>
            {line(director, true)}
            {line(guardian, false)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests, typecheck, lint, commit**

```bash
git add frontend/src/components/bulletin/blocks/yearDecisions.tsx frontend/src/components/bulletin/blocks/yearSignatures.tsx frontend/src/components/bulletin/blocks/blocks.test.tsx
git commit -m "feat(bulletin): yearDecisions and yearSignatures blocks of the annual carnet"
```

---

### Task 5: Cover options and text variables

**Files:**
- Modify: `frontend/src/components/bulletin/blocks/cover.tsx`, `frontend/src/components/bulletin/blocks/text.tsx`
- Test: `frontend/src/components/bulletin/blocks/blocks.test.tsx`

**Interfaces:**
- Produces `substituteVariables(text: string, data: BulletinRenderData): string` exported from `text.tsx` (variables `{eleve}` → `studentName`, `{classe}` → `className`, `{annee}` → `academicYearLabel`, `{periode}` → `termLabel`, `{ecole}` → `schoolName`; unknown `{x}` left as is).

- [ ] **Step 1: Write the failing tests**

```ts
describe('cover block, carnet options', () => {
  const coverBlock = {
    id: 'c',
    type: 'cover' as const,
    visible: true,
    sectionLabel: 'Section primaire',
    titlePattern: 'Carnet scolaire',
    showLogo: false,
    framed: true,
    fields: ['fullName', 'className', 'nisu', 'academicYear'] as const,
  };
  const dataWithNisu: BulletinRenderData = { ...data, nisu: '0123456789' };

  it('prints Elève (full name) and NISU with their default labels, and renames a field through fieldLabels', () => {
    const out = html(renderCover({ block: { ...coverBlock, fields: [...coverBlock.fields], fieldLabels: { academicYear: 'Année Scolaire' } }, config, data: dataWithNisu }));
    expect(out).toContain('Elève :');
    expect(out).toContain('Jonathan Alexis');
    expect(out).toContain('NISU :');
    expect(out).toContain('0123456789');
    expect(out).toContain('Année Scolaire :');
    expect(out).not.toContain('Année Académique');
  });

  it('keeps capitals by default and prints as typed with uppercase: false', () => {
    const upper = html(renderCover({ block: { ...coverBlock, fields: [...coverBlock.fields] }, config, data: dataWithNisu }));
    expect(upper).toContain('uppercase');
    const typed = html(renderCover({ block: { ...coverBlock, fields: [...coverBlock.fields], uppercase: false }, config, data: dataWithNisu }));
    expect(typed).not.toContain('uppercase');
  });

  it('draws the rounded frame and places the logo below the title on request', () => {
    const out = html(renderCover({ block: { ...coverBlock, fields: [...coverBlock.fields], frameStyle: 'rounded', showLogo: true, logoPosition: 'belowTitle' }, config, data: dataWithNisu }));
    expect(out).toContain('border-radius:40px');
    // Logo placeholder (no logo url) comes after the title text.
    expect(out.indexOf('Carnet scolaire')).toBeLessThan(out.indexOf('lucide'));
  });
});

describe('text block variables', () => {
  it('replaces {eleve}, {classe}, {annee}, {periode}, {ecole} and leaves unknown variables', () => {
    const out = html(renderText({ block: { id: 't', type: 'text', visible: true, text: 'Nom {eleve} · {classe} · {annee} · {periode} · {ecole} · {autre}', align: 'left', fontSize: 10, bold: false, italic: false }, config, data }));
    expect(out).toContain('Nom Jonathan Alexis · Kindergarten A · 2026-2027 · 1er Trimestre · École Les Étoiles · {autre}');
  });
});
```

(`lucide` appears in the placeholder SVG's class `lucide lucide-layout-template`; if the SVG markup has no such class, assert on `<svg` instead.)

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement the cover options**

In `cover.tsx`:

```ts
const FIELD_LABEL: Record<CoverField, string> = {
  lastName: 'Nom',
  firstName: 'Prénom',
  fullName: 'Elève',
  className: 'Classe',
  studentNumber: 'Code',
  nisu: 'NISU',
  academicYear: 'Année Académique',
};

function fieldValue(field: CoverField, data: BulletinRenderData): string {
  switch (field) {
    case 'lastName':
      return data.lastName;
    case 'firstName':
      return data.firstName;
    case 'fullName':
      return data.studentName;
    case 'className':
      return data.className;
    case 'studentNumber':
      return data.studentNumber;
    case 'nisu':
      return data.nisu ?? '';
    case 'academicYear':
      return data.academicYearLabel;
  }
}
```

In `render`: `const upper = block.uppercase ?? true;` and `const caseClass = upper ? 'uppercase' : '';`. Build the logo element once (`const logo = block.showLogo ? (…existing img/placeholder…) : null;`) and render it at the top when `(block.logoPosition ?? 'top') === 'top'`, or between the title `div` and the fields `div` when `'belowTitle'`. Replace the three `uppercase` class usages (school name, section label, title) with `${caseClass}`. Field label: `{block.fieldLabels?.[field] ?? FIELD_LABEL[field]} :`. Frame:

```tsx
  const rounded = block.frameStyle === 'rounded';
  return (
    <div
      className={`h-full border-2 ${rounded ? 'border-solid' : block.frameStyle === 'solid' ? 'rounded-2xl border-solid' : 'rounded-2xl border-dashed'}`}
      style={{ borderColor: config.primaryColor, ...(rounded ? { borderRadius: 40 } : {}) }}
    >
```

- [ ] **Step 4: Implement the text variables**

In `text.tsx`:

```ts
// Placeholders a template author can type in a text block (spec 2026-09-06
// §4.2); an unknown {name} is printed as typed.
const VARIABLES: Record<string, (d: BulletinRenderData) => string> = {
  eleve: (d) => d.studentName,
  classe: (d) => d.className,
  annee: (d) => d.academicYearLabel,
  periode: (d) => d.termLabel,
  ecole: (d) => d.schoolName,
};
export function substituteVariables(text: string, data: BulletinRenderData): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const read = VARIABLES[key];
    return read ? read(data) : match;
  });
}
```

`render` now destructures `data` and uses `substituteVariables(block.text, data)` before the paragraph split.

- [ ] **Step 5: Run tests, typecheck, lint, commit**

```bash
git add frontend/src/components/bulletin/blocks/cover.tsx frontend/src/components/bulletin/blocks/text.tsx frontend/src/components/bulletin/blocks/blocks.test.tsx
git commit -m "feat(bulletin): cover fields Elève/NISU, rounded frame, case and logo options, text variables"
```

---

### Task 6: `sidebar` page layout

**Files:**
- Modify: `frontend/src/components/bulletin/BulletinPage.tsx`
- Test: `frontend/src/components/bulletin/BulletinPage.test.tsx`

**Interfaces:**
- Consumes `page.layout === 'sidebar'`, `page.asideWidth` (Task 1).
- Behaviour: blocks before the first `breakBefore: 'column'` go to the main column, the rest to the aside; `yearSignatures` and vertically aligned text blocks stretch to the column height; the sheet has a fixed height like `halves`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('sidebar layout', () => {
  const sidebarPage: Page = {
    id: 'grille',
    layout: 'sidebar',
    asideWidth: 22,
    showPageNumber: false,
    blocks: [
      { id: 'line', type: 'text', visible: true, text: 'Nom', align: 'left', fontSize: 10, bold: true, italic: false },
      { id: 'grid', type: 'yearGrid', visible: true },
      { id: 'sig', type: 'yearSignatures', visible: true, breakBefore: 'column' },
    ],
  };
  const render = (p: Page) =>
    renderToStaticMarkup(
      <BulletinPage page={p} pageIndex={0} totalPages={1} config={DEFAULT_BULLETIN_CONFIG} data={{ ...data, year: SAMPLE_BULLETIN_DATA.year }} chrome={false} />,
    );

  it('splits the blocks into a main column and an aside at the first breakBefore, aside width from asideWidth', () => {
    const out = render(sidebarPage);
    expect(out).toContain('grid-template-columns:minmax(0, 1fr) 22%');
    const main = out.slice(out.indexOf('data-testid="bulletin-page-main"'), out.indexOf('data-testid="bulletin-page-aside"'));
    expect(main).toContain('data-block-id="line"');
    expect(main).toContain('data-block-id="grid"');
    expect(main).not.toContain('data-block-id="sig"');
    const aside = out.slice(out.indexOf('data-testid="bulletin-page-aside"'));
    expect(aside).toContain('data-block-id="sig"');
  });

  it('defaults the aside width to 25% and puts every block in the main column without a breakBefore', () => {
    const out = render({ ...sidebarPage, asideWidth: undefined, blocks: sidebarPage.blocks.map((b) => ({ ...b, breakBefore: undefined })) });
    expect(out).toContain('grid-template-columns:minmax(0, 1fr) 25%');
    const aside = out.slice(out.indexOf('data-testid="bulletin-page-aside"'));
    expect(aside).not.toContain('data-block-id=');
  });

  it('stretches the yearSignatures block to the column height', () => {
    const out = render(sidebarPage);
    const sig = out.slice(out.indexOf('data-block-id="sig"'));
    expect(sig.slice(0, 400)).toContain('flex-grow:1');
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement**

In `BulletinPage.tsx`:

```ts
  const halves = page.layout === 'halves';
  const sidebar = page.layout === 'sidebar';
  // Fixed-height sheets: halves (CSS columns) and sidebar (two grid tracks)
  // both need a definite height so a column can stretch to the page.
  const fixedHeight = halves || sidebar;
  const asideWidth = page.asideWidth ?? 25;
```

After `restBlocks`:

```ts
  // Sidebar layout (spec 2026-09-06 §4.3): everything before the first
  // `breakBefore: 'column'` goes to the main column, the rest to the aside.
  const splitAt = sidebar ? restBlocks.findIndex((b) => b.breakBefore === 'column') : -1;
  const mainBlocks = splitAt >= 0 ? restBlocks.slice(0, splitAt) : restBlocks;
  const asideBlocks = splitAt >= 0 ? restBlocks.slice(splitAt) : [];
```

In `wrap()`:

```ts
    const fillsSpace =
      (block.type === 'text' && (block.verticalAlign ?? 'top') !== 'top') ||
      block.type === 'yearSignatures';
    …
          marginBottom: fillsSpace ? 0 : config.layout.blockSpacing,
          marginTop: !halves && block.type === 'signatures' && isLastVisible ? 'auto' : undefined,
          height: fillsSpace && halves ? '100%' : undefined,
          flexGrow: fillsSpace && !halves ? 1 : undefined,
          opacity: dragBlockId === block.id ? 0.4 : 1,
          breakInside: block.breakBefore ? undefined : 'avoid',
          breakBefore: halves && block.breakBefore === 'column' ? 'column' : undefined,
          flexShrink: halves ? undefined : 0,
```

Sheet style: `fixedHeight ? { height: getPageHeightPx(config), breakInside: 'avoid' } : { minHeight: getPageHeightPx(config) }`.

Blocks container:

```tsx
      <div
        data-testid="bulletin-page-blocks"
        className={halves ? 'flex-1' : sidebar ? 'grid min-h-0 flex-1' : 'flex flex-1 flex-col'}
        style={{
          padding: config.layout.pageMargin,
          ...(halves
            ? { minHeight: 0, flex: '1 1 auto', columnCount: 2, columnFill: 'auto', columnGap: config.layout.blockSpacing * 2 }
            : sidebar
              ? {
                  flex: '1 1 auto',
                  gridTemplateColumns: `minmax(0, 1fr) ${asideWidth}%`,
                  columnGap: config.layout.blockSpacing * 2,
                  alignItems: 'stretch',
                }
              : {}),
        }}
      >
        {sidebar ? (
          <>
            <div data-testid="bulletin-page-main" className="flex min-h-0 min-w-0 flex-col">
              {mainBlocks.map((block) => wrap(block, renderBlock({ block, config, data })))}
            </div>
            <div data-testid="bulletin-page-aside" className="flex min-h-0 min-w-0 flex-col">
              {asideBlocks.map((block) => wrap(block, renderBlock({ block, config, data })))}
            </div>
          </>
        ) : (
          restBlocks.map((block) => wrap(block, renderBlock({ block, config, data })))
        )}

        {config.content.footerMessage && (
          <div
            className="shrink-0 text-center text-muted-foreground italic"
            style={{ fontSize: config.typography.footer, ...(sidebar ? { gridColumn: '1 / -1' } : {}) }}
          >
            {config.content.footerMessage}
          </div>
        )}
      </div>
```

- [ ] **Step 4: Run `src/components/bulletin`, typecheck, lint, commit**

```bash
git add frontend/src/components/bulletin/BulletinPage.tsx frontend/src/components/bulletin/BulletinPage.test.tsx
git commit -m "feat(bulletin): sidebar page layout with an adjustable aside column"
```

---

### Task 7: Editor support (palette, properties, page layout, i18n)

**Files:**
- Modify: `frontend/src/app/(school)/configuration/modele-bulletin/[id]/edit/page.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/configuration.json` (`modeleBulletin.editor.pagesPanel`, `modeleBulletin.editor.blockProperties`)
- Test: `frontend/src/lib/locales.test.ts` (parity only), manual check in Task 9

**Interfaces:**
- Consumes the types of Task 1 and `patchBlock`/`patchPage`/`PropSelectRow`/`SwitchRow`/`PropSliderRow` of the editor.

- [ ] **Step 1: Message keys (all three locales, same key set)**

`modeleBulletin.editor.pagesPanel`: `"layoutSidebar"`, `"asideWidth"`.
`modeleBulletin.editor.blockProperties`: `"yearGridTitle"`, `"yearGridShowDomains"`, `"yearGridNotesLabel"`, `"yearGridMaxLabel"`, `"yearDecisionsTitle"`, `"yearDecisionsHeading"`, `"yearSignaturesTitle"`, `"yearSignaturesHeading"`, `"yearSignaturesDirector"`, `"yearSignaturesGuardian"`, `"coverFrameRounded"`, `"coverUppercase"`, `"coverLogoPosition"`, `"coverLogoTop"`, `"coverLogoBelowTitle"`, `"coverFieldLabel"`, `"textVariablesHint"`, and in `coverField`: `"fullName"`, `"nisu"`.

fr values: « Colonne latérale », « Largeur de la colonne latérale », « Grille annuelle », « Grouper par domaine », « Libellé Notes », « Libellé Sur », « Décisions de l'année », « Titre », « Signatures par période », « Titre », « Libellé direction », « Libellé parents », « Arrondi », « Capitales », « Position du logo », « En haut », « Sous le titre », « Libellé : {field} », « Variables : {eleve}, {classe}, {annee}, {periode}, {ecole} », coverField « Élève (nom complet) », « NISU ».
en values: "Side column", "Side column width", "Annual grid", "Group by domain", "Notes label", "Max label", "Year decisions", "Title", "Signatures per period", "Title", "Director label", "Parents label", "Rounded", "Capitals", "Logo position", "Top", "Below the title", "Label: {field}", "Variables: {eleve}, {classe}, {annee}, {periode}, {ecole}", "Student (full name)", "NISU".
ht values (best effort, `_review` already flags the file): "Kolòn sou kote", "Lajè kolòn sou kote a", "Griy anyèl", "Gwoupe pa domèn", "Etikèt Nòt", "Etikèt Sou", "Desizyon ane a", "Tit", "Siyati pa peryòd", "Tit", "Etikèt direksyon", "Etikèt paran", "Awondi", "Lèt majiskil", "Pozisyon logo a", "Anwo", "Anba tit la", "Etikèt : {field}", "Varyab : {eleve}, {classe}, {annee}, {periode}, {ecole}", "Elèv (non konplè)", "NISU".

The `{eleve}` placeholders inside message strings must be escaped for next-intl's ICU syntax: write them as `'{'eleve'}'` in the JSON (single-quote escaping), or the hint will throw at render time. Verify by rendering the editor once (Task 9) or with a quick `useTranslations` unit call.

- [ ] **Step 2: Page layout control**

In the pages panel (around line 767), add a third button after « Deux colonnes »:

```tsx
                            <button
                              type="button"
                              onClick={() => patchPage(page.id, { layout: 'sidebar' })}
                              className={`rounded px-2 py-0.5 text-2xs font-medium ${page.layout === 'sidebar' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                            >
                              {t('pagesPanel.layoutSidebar')}
                            </button>
```

and, after the `showPageNumber` `SwitchRow`:

```tsx
                        {page.layout === 'sidebar' && (
                          <PropSliderRow
                            label={t('pagesPanel.asideWidth')}
                            value={page.asideWidth ?? 25}
                            min={15}
                            max={40}
                            suffix="%"
                            onChange={(v) => patchPage(page.id, { asideWidth: v })}
                          />
                        )}
```

- [ ] **Step 3: Block property panels**

After the `criteriaGrids` section, add:

```tsx
                  {selectedBlock.type === 'yearGrid' && (
                    <PropSection title={t('blockProperties.yearGridTitle')} last>
                      <SwitchRow
                        label={t('blockProperties.yearGridShowDomains')}
                        checked={selectedBlock.showDomains ?? false}
                        onChange={(v) => patchBlock(selected.pageId, selected.blockId, { showDomains: v })}
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearGridNotesLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={20}
                        value={selectedBlock.notesLabel ?? ''}
                        placeholder="Notes"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, { notesLabel: e.target.value || undefined })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearGridMaxLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={20}
                        value={selectedBlock.maxLabel ?? ''}
                        placeholder="Sur"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, { maxLabel: e.target.value || undefined })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                    </PropSection>
                  )}

                  {selectedBlock.type === 'yearDecisions' && (
                    <PropSection title={t('blockProperties.yearDecisionsTitle')} last>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearDecisionsHeading')}
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={selectedBlock.title ?? ''}
                        placeholder="Décisions"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, { title: e.target.value || undefined })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                    </PropSection>
                  )}

                  {selectedBlock.type === 'yearSignatures' && (
                    <PropSection title={t('blockProperties.yearSignaturesTitle')} last>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearSignaturesHeading')}
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={selectedBlock.title ?? ''}
                        placeholder="Signatures"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, { title: e.target.value || undefined })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearSignaturesDirector')}
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={selectedBlock.labels?.director ?? ''}
                        placeholder="Direction"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            labels: { ...selectedBlock.labels, director: e.target.value || undefined },
                          })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearSignaturesGuardian')}
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={selectedBlock.labels?.guardian ?? ''}
                        placeholder="Les Parents"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            labels: { ...selectedBlock.labels, guardian: e.target.value || undefined },
                          })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                    </PropSection>
                  )}
```

Cover section: add `{ value: 'rounded', label: t('blockProperties.coverFrameRounded') }` to the frame style options and widen the cast to `'dashed' | 'solid' | 'rounded'`; add

```tsx
                      <SwitchRow
                        label={t('blockProperties.coverUppercase')}
                        checked={selectedBlock.uppercase ?? true}
                        onChange={(v) => patchBlock(selected.pageId, selected.blockId, { uppercase: v })}
                      />
                      <PropSelectRow
                        label={t('blockProperties.coverLogoPosition')}
                        value={selectedBlock.logoPosition ?? 'top'}
                        options={[
                          { value: 'top', label: t('blockProperties.coverLogoTop') },
                          { value: 'belowTitle', label: t('blockProperties.coverLogoBelowTitle') },
                        ]}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, { logoPosition: v as 'top' | 'belowTitle' })
                        }
                      />
```

Extend the fields array to `['lastName', 'firstName', 'fullName', 'className', 'studentNumber', 'nisu', 'academicYear'] as const`, and under each checked field's `SwitchRow` render a label input:

```tsx
                          {selectedBlock.fields.includes(field) && (
                            <input
                              type="text"
                              maxLength={60}
                              aria-label={t('blockProperties.coverFieldLabel', { field: t(`blockProperties.coverField.${field}`) })}
                              placeholder={t('blockProperties.coverFieldLabel', { field: t(`blockProperties.coverField.${field}`) })}
                              value={selectedBlock.fieldLabels?.[field] ?? ''}
                              onChange={(e) =>
                                patchBlock(selected.pageId, selected.blockId, {
                                  fieldLabels: { ...selectedBlock.fieldLabels, [field]: e.target.value || undefined },
                                })
                              }
                              className="mb-2 w-full rounded border-none bg-muted px-2 py-1 text-xs text-foreground outline-none"
                            />
                          )}
```

(wrap the `SwitchRow` + input in a `<div key={field}>`).

Text section: after the `textarea`, `<p className="mb-2.5 text-2xs text-muted-foreground">{t('blockProperties.textVariablesHint')}</p>`.

- [ ] **Step 4: Run locales test, typecheck, lint, format; commit**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts && pnpm typecheck && pnpm lint && pnpm format`

```bash
git add "frontend/src/app/(school)/configuration/modele-bulletin/[id]/edit/page.tsx" frontend/src/messages/fr/configuration.json frontend/src/messages/ht/configuration.json frontend/src/messages/en/configuration.json
git commit -m "feat(bulletin): editor support for the annual blocks, cover options and sidebar layout"
```

---

### Task 8: Seed the two global carnet templates

**Files:**
- Modify: `frontend/scripts/seed-bulletin-templates.ts`
- Test: `frontend/scripts/seed-bulletin-templates.test.ts`

**Interfaces:**
- Produces two `GLOBAL_TEMPLATES` entries named exactly `Carnet scolaire (3e cycle et secondaire)` and `Carnet scolaire (primaire)`.

- [ ] **Step 1: Update the existing tests and add the carnet tests**

In `seed-bulletin-templates.test.ts`: the "creates all 4" test becomes "creates all 6" (`toHaveBeenCalledTimes(6)`); the idempotency test lists the six names and expects `updateMany` ×6. Add:

```ts
  it('seeds the two annual carnets: decisions/cover page, grid + signatures sidebar page, no school data in the config', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([]);
    const captured = new Map<string, { pages: { id: string; layout: string; asideWidth?: number; blocks: Record<string, unknown>[] }[]; layout: Record<string, unknown> }>();
    prismaMock.bulletinTemplate.create.mockImplementation((async (args: { data: { name: string; config: unknown } }) => {
      captured.set(args.data.name, args.data.config as never);
      return {} as never;
    }) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await main([], { prisma: prismaMock });
    logSpy.mockRestore();

    for (const name of ['Carnet scolaire (3e cycle et secondaire)', 'Carnet scolaire (primaire)']) {
      const cfg = captured.get(name);
      expect(cfg, name).toBeDefined();
      expect(cfg!.layout.showDecoration).toBe(false);
      expect(cfg!.pages.map((p) => p.layout)).toEqual(['halves', 'sidebar']);
      const [p1, p2] = cfg!.pages;
      expect(p1!.blocks.map((b) => b.type)).toEqual(['yearDecisions', 'text', 'text', 'text', 'cover']);
      const cover = p1!.blocks[4]!;
      expect(cover).toMatchObject({ breakBefore: 'column', framed: true, frameStyle: 'rounded', uppercase: false, logoPosition: 'belowTitle', titlePattern: 'Carnet scolaire', fields: ['fullName', 'className', 'nisu', 'academicYear'], fieldLabels: { academicYear: 'Année Scolaire' } });
      expect(p2!.asideWidth).toBe(22);
      expect(p2!.blocks.map((b) => b.type)).toEqual(['text', 'yearGrid', 'yearSignatures']);
      expect(p2!.blocks[2]).toMatchObject({ breakBefore: 'column' });
      expect((p2!.blocks[0] as { text: string }).text).toContain('{eleve}');
      expect(JSON.stringify(cfg)).not.toMatch(/Morne Barbeau|ECEMB|\+509/);
    }
    expect((captured.get('Carnet scolaire (3e cycle et secondaire)')!.pages[0]!.blocks[4] as { sectionLabel: string }).sectionLabel).toBe('3ème Cycle & Secondaire');
    expect((captured.get('Carnet scolaire (primaire)')!.pages[0]!.blocks[4] as { sectionLabel: string }).sectionLabel).toBe('Section primaire');
    expect(captured.get('Carnet scolaire (primaire)')!.pages[1]!.blocks[1]).toMatchObject({ showDomains: true });
    expect(captured.get('Carnet scolaire (3e cycle et secondaire)')!.pages[1]!.blocks[1]).not.toHaveProperty('showDomains');
  });

  it('the two carnet configs validate against the real bulletin-templates schema', async () => {
    const { bulletinTemplateConfigSchema } = await import('../src/lib/server/bulletin-templates');
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([]);
    const configs = new Map<string, unknown>();
    prismaMock.bulletinTemplate.create.mockImplementation((args) => {
      const data = (args as { data: { name: string; config: unknown } }).data;
      configs.set(data.name, data.config);
      return Promise.resolve({} as never);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await main([], { prisma: prismaMock });

    for (const name of ['Carnet scolaire (3e cycle et secondaire)', 'Carnet scolaire (primaire)']) {
      const result = bulletinTemplateConfigSchema.safeParse(configs.get(name));
      expect(result.success, `${name}: ${result.success ? '' : JSON.stringify(result.error.issues)}`).toBe(true);
    }
    logSpy.mockRestore();
  });
```

The existing « Livret préscolaire config validates » test mocks three existing names; it keeps passing (the two carnets are simply created alongside the livret).

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Add the configs**

After `LIVRET_PRESCOLAIRE_CONFIG`:

```ts
// The two annual carnets (spec 2026-09-06) reproduce
// bulletin_template/Carnet scolaire 3e cycle et secondaire 2025-2026.docx and
// bulletin_template/Carnet scolaire complet primaire 2025 - 2026 (1).docx.
// School name, address, phones and logo come from the printing school's
// data (cover block), never from the config.
const NBSP = ' ';
const CARNET_REGLEMENT =
  'Extrait des règlements\n\n' +
  '1. Considéré (e) comme promu (e), l’élève qui obtient au moins une moyenne générale de 24/40.\n' +
  '2. Considéré (e) comme maintenu (e), l’élève qui obtient une moyenne générale comprise entre 16/40 et 24/40.\n' +
  '3. Orienté (e) ailleurs, l’élève qui obtient une moyenne générale inférieure à 16/40.\n' +
  '4. Un élève qui s’est absenté 5 jours consécutifs sans motif valable est considéré comme abandon.';

function carnetConfig(sectionLabel: string, showDomains: boolean) {
  return {
    primaryColor: '#1a1a2e',
    pageFormat: 'LETTER',
    orientation: 'LANDSCAPE',
    pages: [
      {
        id: 'decisions',
        layout: 'halves',
        showPageNumber: false,
        blocks: [
          { id: 'decisions-table', type: 'yearDecisions', visible: true, title: 'Décisions' },
          {
            id: 'observations',
            type: 'text',
            visible: true,
            align: 'left',
            fontSize: 10,
            bold: false,
            italic: false,
            text:
              'Observations :\n\n' +
              `-${NBSP}${NBSP}L’élève est :\n` +
              `${NBSP.repeat(6)}○${NBSP}Promu (e)\n` +
              `${NBSP.repeat(6)}○${NBSP}Maintenu (e)\n` +
              `${NBSP.repeat(6)}○${NBSP}Orienté (e) ailleurs`,
          },
          {
            id: 'reglement',
            type: 'text',
            visible: true,
            align: 'justify',
            fontSize: 10,
            bold: false,
            italic: false,
            text: CARNET_REGLEMENT,
          },
          {
            id: 'direction',
            type: 'text',
            visible: true,
            align: 'right',
            verticalAlign: 'bottom',
            fontSize: 11,
            bold: true,
            italic: false,
            text: 'La direction',
          },
          {
            id: 'couverture',
            type: 'cover',
            visible: true,
            breakBefore: 'column',
            sectionLabel,
            titlePattern: 'Carnet scolaire',
            showLogo: true,
            framed: true,
            frameStyle: 'rounded',
            uppercase: false,
            logoPosition: 'belowTitle',
            fields: ['fullName', 'className', 'nisu', 'academicYear'],
            fieldLabels: { academicYear: 'Année Scolaire' },
          },
        ],
      },
      {
        id: 'grille',
        layout: 'sidebar',
        asideWidth: 22,
        showPageNumber: false,
        blocks: [
          {
            id: 'identite',
            type: 'text',
            visible: true,
            align: 'left',
            fontSize: 10,
            bold: true,
            italic: false,
            text: `Nom (s) et Prénom (s) {eleve}${NBSP.repeat(12)}Classe {classe}${NBSP.repeat(12)}Année Scolaire : {annee}`,
          },
          {
            id: 'grille-annuelle',
            type: 'yearGrid',
            visible: true,
            ...(showDomains ? { showDomains: true } : {}),
          },
          {
            id: 'signatures-periodes',
            type: 'yearSignatures',
            visible: true,
            breakBefore: 'column',
            title: 'Signatures',
            labels: { director: 'Direction', guardian: 'Les Parents' },
          },
        ],
      },
    ],
    columns: { coefficient: true, classAverage: false, minMax: false, appreciation: false, absences: false, rank: true },
    signatures: { director: true, homeroom: false, guardian: true },
    typography: { schoolName: 20, title: 16, tableBody: 9, tableHeader: 9, noteValue: 9, footer: 8 },
    content: { title: 'Carnet scolaire', footerMessage: null, pageNumberFormat: '{n} / {total}' },
    layout: {
      pageMargin: 18,
      blockSpacing: 8,
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#1a1a2e',
      cellPaddingX: 4,
      cellPaddingY: 1,
      tableLineHeight: 1.25,
      showTableBackgrounds: false,
      logoSize: 64,
      signatureSize: 24,
      showDecoration: false,
    },
  } as const;
}
```

Note the « Observations » text uses the curly apostrophe `’` as in the Word document (the file already contains such characters in the livret verse; a subagent transcribing this must keep the codepoint, see the typographic-apostrophe hazard noted in the memory index).

`GLOBAL_TEMPLATES` gains:

```ts
  {
    name: 'Carnet scolaire (3e cycle et secondaire)',
    description:
      'Carnet annuel sur deux pages : décisions et règlement, couverture, grille des contrôles de l’année avec signatures par période.',
    config: carnetConfig('3ème Cycle & Secondaire', false),
  },
  {
    name: 'Carnet scolaire (primaire)',
    description:
      'Carnet annuel sur deux pages : décisions et règlement, couverture, grille des contrôles de l’année avec signatures par période. Les matières sont regroupées par domaine.',
    config: carnetConfig('Section primaire', true),
  },
```

Update the header comment of the script ("Seeds the 4 global…" → 6) and the `LIVRET` comment if it says "4th".

- [ ] **Step 4: Run the seed tests, typecheck, lint, commit**

Run: `pnpm --filter frontend exec vitest run scripts/seed-bulletin-templates.test.ts && pnpm typecheck && pnpm lint`

```bash
git add frontend/scripts/seed-bulletin-templates.ts frontend/scripts/seed-bulletin-templates.test.ts
git commit -m "feat(seed): global Carnet scolaire templates (3e cycle et secondaire, primaire)"
```

---

### Task 9: Documentation and visual verification

**Files:**
- Modify: `CLAUDE.md` (the bulletin paragraph in the i18n section: add the annual blocks, the `sidebar` layout, the cover/text options, the two seeded carnets and the calculation rule in one or two sentences)
- Modify: `README.md` only if it lists the global templates by name (grep « Livret préscolaire »)
- No new test file: this task runs the full gate and a real-data check.

- [ ] **Step 1: Document**

Add to `CLAUDE.md`'s bulletin paragraph, after the livret sentence: « (2026-09-06) two annual carnets, « Carnet scolaire (3e cycle et secondaire) » and « Carnet scolaire (primaire) », print every period of the year on one document through three annual block types (`yearGrid`, `yearDecisions`, `yearSignatures`) fed by an optional `year` payload that `getStudentBulletinView` computes (pure `bulletin-pdf/year-data.ts`) only when the resolved template holds an annual block: per subject `Sur = Subject.maxScore × ClassSubject.coefficient`, `Notes` = the subject's average on 20 brought to that Sur, totals over every numeric subject of the class, `Moyenne = Total ÷ Sur × 10`, `Place` = competition rank, `Moyenne Générale` = sum of the graded periods; pages gained a `sidebar` layout (`asideWidth`, blocks after `breakBefore: 'column'` in the aside), the cover block the `fullName`/`nisu` fields, `frameStyle: 'rounded'`, `uppercase`, `logoPosition` and `fieldLabels`, and the text block the `{eleve}` `{classe}` `{annee}` `{periode}` `{ecole}` variables; `pnpm db:seed-bulletin-templates` adds the two carnets. See docs/superpowers/specs/2026-09-06-carnets-scolaires-annuels-design.md. »

- [ ] **Step 2: Full gate**

Run from the repo root: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: annual carnets scolaires (blocks, sidebar layout, seeded templates)"
```

- [ ] **Step 4: Real-data verification (controller, after the human partner's go-ahead for the seed)**

1. `pnpm db:seed-bulletin-templates` (adds the two carnets to the shared dev DB; refreshes the others).
2. Start the worktree server on :3001 (`APP_URL=http://localhost:3001 pnpm exec next dev -p 3001` from `frontend/`), log in once with the scratchpad `verify.ts` pattern (credentials read from `frontend/CREDENTIALS.local.md`, never printed), and in the demo school: assign « Carnet scolaire (3e cycle et secondaire) » to a numeric grade level (e.g. the 3ème level) through `PATCH /api/school/grade-levels/[id]` `{ bulletinTemplateId }`, then download `GET /api/school/students/[id]/bulletin/pdf?termId=…` for a student of a 3ème class.
3. `pdfinfo` (2 pages, Letter landscape), `pdftoppm -r 70 -png`, and compare side by side with the Word renders in the session scratchpad `carnets/` (`…-1.png`, `…-2.png`): Décisions table, Observations, Extrait, « La direction » bottom right, rounded cover with the school's real name, section label, « Carnet scolaire », logo, Elève/Classe/NISU/Année Scolaire lines; page 2 identity line, gridded table with one group per period of the demo year (the demo year has 3 trimestres, so 3 groups), Total/Moyenne/Place, Signatures column with 3 pairs.
4. Editor screenshot on the school copy: palette shows the three new blocks, « Ce bloc » panels, page layout « Colonne latérale » with the width slider, no overflow warning.
5. Viewer at 1280 and 375 px: no horizontal scroll of the page body.
6. Restore the grade level's template assignment (`bulletinTemplateId: null`) after the check.

Record findings in the ledger; any presentation gap against the Word render is a fix round on the seed config or the renderers, not a new task.
