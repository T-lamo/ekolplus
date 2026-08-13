# Bulletin PDF Generation & Editor Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-generate a real, downloadable PDF of a student's bulletin (WYSIWYG with the on-screen Viewer), and finish the bulletin template editor's Contenu/Espacement tabs (text content, spacing/layout, logo + director-signature image upload) which currently render everything regardless of the selected tab.

**Architecture:** Headless Chromium (`puppeteer-core` + `@sparticuz/chromium`) navigates to a new token-authorized, unauthenticated print page that renders the exact same `BulletinCanvas` component the Viewer already shows on screen — no parallel PDF renderer, no drift risk. `BulletinTemplateConfig` gains `content`/`layout` sections; `School` gains `logoUrl`/`directorSignatureUrl`, uploaded through the existing Cloudinary `/api/upload` route.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), Prisma 5 / Neon, Zod, `puppeteer-core`, `@sparticuz/chromium`, Vitest.

Spec: [docs/superpowers/specs/2026-08-13-bulletin-pdf-and-editor-design.md](../specs/2026-08-13-bulletin-pdf-and-editor-design.md)

## Global Constraints

- Every new/modified Route Handler MUST `export const runtime = 'nodejs'` (Prisma + this feature's Chromium binary both require Node, never edge).
- `frontend/src/lib/api.ts` is a CLAUDE.md-protected file — do not modify it. The new `ImageUploader` component bypasses it entirely for the multipart upload (see Task 4), matching the precedent in the reference project (v1 `ekolplus`) for the identical reason.
- `frontend/src/lib/server/auth.ts` / `crypto.ts` are also protected — the new print-token module (Task 9) is self-contained (`node:crypto` directly), modeled on `lib/server/cron/auth.ts`'s existing pattern, and does not import from either.
- Money/averages are already correctly computed elsewhere in this codebase (`lib/server/grades.ts`) — this plan never reimplements averaging logic, only relocates the existing, already-correct query in Task 7.
- **Testing convention deviation, read before Task 1:** this codebase does NOT unit-test Prisma-backed Route Handlers or pages (verified: zero `.test.ts` files exist for any `/api/school/*` route or `grades.ts`/`bulletin-templates.ts` — every prior epic in `.planning/banani/STATUS.md` verifies these via live E2E against a running dev server instead). This plan follows that established convention rather than inventing route-level unit tests that would be the first of their kind and inconsistent with ~40 existing routes. Unit tests ARE written for genuinely pure, self-contained logic, matching the codebase's own precedent (`lib/server/cron/auth.test.ts`, `scripts/seed-bulletin-templates.test.ts`): the print-token module (Task 9) and the config-backfill script (Task 2). Every task's "verify" step is therefore either a unit test run, or `pnpm typecheck && pnpm build` + a described manual/E2E check — Task 14 runs the full live E2E pass.
- Run `pnpm --filter frontend exec <cmd>` for all commands below unless already `cd`'d into `frontend/`.
- Migration folders in this repo are zero-padded sequential integers (`00`…`13`) — see Task 1 for the exact generate → rename → apply procedure (do not use plain `prisma migrate dev --name X` without `--create-only`, per the established project convention documented in `.planning/banani/STATUS.md`).

---

### Task 1: School branding fields (migration)

**Files:**
- Modify: `frontend/prisma/schema.prisma` (School model, currently lines 122-150)
- Create: `frontend/prisma/migrations/14_bulletin_branding/migration.sql`

**Interfaces:**
- Produces: `School.logoUrl: string | null`, `School.directorSignatureUrl: string | null` — consumed by Task 3 (API), Task 6 (editor upload), Task 7 (bulletin data).

- [ ] **Step 1: Add the two fields to the Prisma schema**

In `frontend/prisma/schema.prisma`, inside `model School { ... }`, add two lines directly after `website String?` (line 138):

```prisma
  website           String?
  logoUrl               String?
  directorSignatureUrl  String?
```

- [ ] **Step 2: Generate the migration (create-only, do not apply yet)**

Run:
```bash
cd frontend && pnpm exec prisma migrate dev --name bulletin_branding --create-only
```

This creates a timestamp-prefixed folder, e.g. `prisma/migrations/20260813120000_bulletin_branding/`.

- [ ] **Step 3: Rename the folder to the next sequential integer**

```bash
mv frontend/prisma/migrations/20260813*_bulletin_branding frontend/prisma/migrations/14_bulletin_branding
```

(Use the actual generated timestamp folder name from Step 2's output.)

- [ ] **Step 4: Verify the generated SQL matches the expected shape**

Open `frontend/prisma/migrations/14_bulletin_branding/migration.sql` and confirm it contains exactly:

```sql
-- AlterTable
ALTER TABLE "School" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "directorSignatureUrl" TEXT;
```

(Column order or exact whitespace from Prisma's generator may differ slightly — that's fine, the constraint is: two nullable TEXT columns added to `School`, no other table touched.)

- [ ] **Step 5: Apply the migration and regenerate the Prisma client**

```bash
cd frontend
pnpm exec prisma migrate deploy
pnpm exec prisma generate
```

- [ ] **Step 6: Restart the dev server if one is running**

Per the established lesson in this codebase (`.planning/banani/STATUS.md`, Create School entry): Turbopack HMR does not reload `node_modules/@prisma/client` after a schema change. If `pnpm dev` is already running, stop and restart it now — every subsequent task in this plan depends on `prisma.school.logoUrl` being recognized by the running server.

- [ ] **Step 7: Verify**

```bash
cd frontend && pnpm typecheck
```

Expected: no errors (the Prisma client's generated types now include `logoUrl`/`directorSignatureUrl` on `School`).

- [ ] **Step 8: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/14_bulletin_branding
git commit -m "feat(schema): add School.logoUrl and School.directorSignatureUrl"
```

---

### Task 2: `BulletinTemplateConfig` — `content` and `layout` sections

**Files:**
- Modify: `frontend/src/lib/server/bulletin-templates.ts`
- Modify: `frontend/src/app/(school)/configuration/modele-bulletin/types.ts`
- Modify: `frontend/scripts/seed-bulletin-templates.ts`
- Create: `frontend/scripts/backfill-bulletin-template-content-layout.ts`
- Create: `frontend/scripts/backfill-bulletin-template-content-layout.test.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `BulletinTemplateConfig.content: { title: string; footerMessage: string | null }`, `BulletinTemplateConfig.layout: { pageMargin: number; blockSpacing: number; borderWidth: number; borderColor: string }` — consumed by Task 5 (`BulletinCanvas`), Task 6 (editor).

- [ ] **Step 1: Extend the zod schema in `lib/server/bulletin-templates.ts`**

In `frontend/src/lib/server/bulletin-templates.ts`, add two fields to `bulletinTemplateConfigSchema` (after the `typography` field, before the closing `});`):

```ts
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
```

And extend `DEFAULT_BULLETIN_CONFIG`:

```ts
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
```

- [ ] **Step 2: Mirror the same two fields in the client types file**

In `frontend/src/app/(school)/configuration/modele-bulletin/types.ts`, add to the `BulletinTemplateConfig` interface (after `typography`):

```ts
export interface BulletinTemplateConfig {
  primaryColor: string;
  pageFormat: 'LETTER' | 'A4';
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  blocks: { id: BlockId; visible: boolean }[];
  columns: {
    coefficient: boolean;
    classAverage: boolean;
    minMax: boolean;
    appreciation: boolean;
    absences: boolean;
    rank: boolean;
  };
  signatures: { director: boolean; homeroom: boolean; guardian: boolean };
  typography: { schoolName: number; title: number; tableBody: number };
  content: { title: string; footerMessage: string | null };
  layout: { pageMargin: number; blockSpacing: number; borderWidth: number; borderColor: string };
}
```

- [ ] **Step 3: Add the same two keys to the seed script's `BASE_CONFIG`**

In `frontend/scripts/seed-bulletin-templates.ts`, add to `BASE_CONFIG` (after `typography`):

```ts
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
  content: { title: 'BULLETIN SCOLAIRE', footerMessage: null },
  layout: { pageMargin: 20, blockSpacing: 10, borderWidth: 1, borderColor: '#f0eef8' },
} as const;
```

This only affects freshly-seeded rows (a brand-new deployment) — the 3 rows already in this dev DB predate this change, which Steps 4-7 backfill.

- [ ] **Step 4: Write the backfill script**

Create `frontend/scripts/backfill-bulletin-template-content-layout.ts`:

```ts
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
```

- [ ] **Step 5: Write the backfill script's test**

Create `frontend/scripts/backfill-bulletin-template-content-layout.test.ts`:

```ts
// scripts/backfill-bulletin-template-content-layout
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './backfill-bulletin-template-content-layout';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('scripts/backfill-bulletin-template-content-layout', () => {
  it('backfills rows missing content/layout and leaves the rest of their config untouched', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      { id: 'tpl1', config: { primaryColor: '#1a9e5c', typography: { schoolName: 13 } } },
    ] as never);
    prismaMock.bulletinTemplate.update.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl1' },
      data: {
        config: {
          primaryColor: '#1a9e5c',
          typography: { schoolName: 13 },
          content: { title: 'BULLETIN SCOLAIRE', footerMessage: null },
          layout: { pageMargin: 20, blockSpacing: 10, borderWidth: 1, borderColor: '#f0eef8' },
        },
      },
    });
    logSpy.mockRestore();
  });

  it('is idempotent — skips rows that already have both content and layout', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl2',
        config: {
          content: { title: 'Custom', footerMessage: 'x' },
          layout: { pageMargin: 30, blockSpacing: 8, borderWidth: 2, borderColor: '#000000' },
        },
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

- [ ] **Step 6: Run the new test**

```bash
cd frontend && pnpm exec vitest run scripts/backfill-bulletin-template-content-layout.test.ts
```

Expected: 2 passed.

- [ ] **Step 7: Register the npm script and run the backfill against the dev DB**

In `frontend/package.json`, add next to the existing `"db:seed-bulletin-templates"` line:

```json
    "db:backfill-bulletin-content-layout": "tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/backfill-bulletin-template-content-layout.ts",
```

Run it:

```bash
cd frontend && pnpm db:backfill-bulletin-content-layout
```

Expected output: 3 (or however many templates currently exist in the dev DB — 3 globals plus any personal forks made during earlier sessions) backfilled, 0 skipped on this first run.

- [ ] **Step 8: Verify**

```bash
cd frontend && pnpm typecheck && pnpm exec vitest run scripts/
```

Expected: no errors, all script tests (seed + backfill) pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/server/bulletin-templates.ts \
        frontend/src/app/\(school\)/configuration/modele-bulletin/types.ts \
        frontend/scripts/seed-bulletin-templates.ts \
        frontend/scripts/backfill-bulletin-template-content-layout.ts \
        frontend/scripts/backfill-bulletin-template-content-layout.test.ts \
        frontend/package.json
git commit -m "feat(bulletins): add content and layout sections to BulletinTemplateConfig"
```

---

### Task 3: School API — accept `logoUrl` / `directorSignatureUrl`

**Files:**
- Modify: `frontend/src/app/api/school/route.ts:95-108` (the `UpdateSchoolBody` schema)

**Interfaces:**
- Consumes: `School.logoUrl`/`directorSignatureUrl` (Task 1).
- Produces: `PUT /api/school` accepts `{ logoUrl?: string | null; directorSignatureUrl?: string | null }`; `GET /api/school` already returns the full `School` row (no code change needed there — `findUniqueOrThrow` with no `select` returns every column).

- [ ] **Step 1: Extend `UpdateSchoolBody`**

In `frontend/src/app/api/school/route.ts`, change:

```ts
const UpdateSchoolBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  shortName: z.string().trim().max(10).nullable().optional(),
  country: z.string().trim().min(1).max(80).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  schoolType: z.string().trim().min(1).max(80).optional(),
  primaryLanguage: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  phone: zPhone.nullable().optional(),
  estimatedStudents: z.number().int().positive().max(1_000_000).nullable().optional(),
  officialCode: z.string().trim().max(60).nullable().optional(),
  officialEmail: zEmail.nullable().optional(),
  website: z.string().trim().max(200).nullable().optional(),
  logoUrl: z.string().trim().url().max(500).nullable().optional(),
  directorSignatureUrl: z.string().trim().url().max(500).nullable().optional(),
});
```

No other change in this file — `PUT`'s handler already does a generic `Object.fromEntries(...).filter(v !== undefined)` then `prisma.school.update({ data })`, so the two new keys flow through automatically.

- [ ] **Step 2: Verify**

```bash
cd frontend && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/school/route.ts
git commit -m "feat(school): accept logoUrl/directorSignatureUrl on PUT /api/school"
```

---

### Task 4: `ImageUploader` component

**Files:**
- Create: `frontend/src/components/ui/ImageUploader.tsx`

**Interfaces:**
- Produces: `<ImageUploader label hint? value onChange />` — a generic, reusable single-image uploader, consumed by Task 6 (editor's logo/signature panels).

`lib/api.ts` (protected — see Global Constraints) always `JSON.stringify`s its body and forces `Content-Type: application/json`, which breaks a multipart `FormData` upload. This component therefore calls `/api/upload` with a raw `fetch()` instead, exactly mirroring the CSRF-cookie-read logic `lib/api.ts` already has privately (duplicated here rather than exporting from the protected file).

- [ ] **Step 1: Write the component**

Create `frontend/src/components/ui/ImageUploader.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { API_URL, COOKIE_PREFIX } from '@/lib/constants';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_SIZE_MB = 10;
const CSRF_STORAGE_KEY = `${COOKIE_PREFIX}-csrf`;

// `api()` (lib/api.ts, CLAUDE.md-protected) unconditionally JSON.stringifies
// its body — unusable for multipart uploads. This reads the CSRF token the
// same way lib/api.ts does internally, duplicated rather than exported from
// a protected file.
function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_STORAGE_KEY);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_STORAGE_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export function ImageUploader({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Format non supporté (PNG, JPG ou WebP attendu).');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1_000_000) {
      setError(`Image trop volumineuse (max ${MAX_SIZE_MB} Mo).`);
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const csrfToken = readCsrfToken();
      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError((body as { message?: string } | null)?.message ?? "L'envoi a échoué.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      onChange(url);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive-foreground"
          >
            <X size={11} />
            Retirer
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex h-16 w-full flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-border bg-background text-center disabled:opacity-60"
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={label} className="h-12 w-auto object-contain" />
        ) : (
          <>
            <UploadCloud size={18} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {uploading ? 'Envoi…' : (hint ?? 'PNG, JPG ou WebP')}
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      {error && <p className="mt-1 text-[11px] text-destructive-foreground">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd frontend && pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/ImageUploader.tsx
git commit -m "feat(ui): add ImageUploader component"
```

---

### Task 5: `BulletinCanvas` — render `content`, `layout`, logo, and signature image

**Files:**
- Modify: `frontend/src/components/bulletin/BulletinCanvas.tsx`

**Interfaces:**
- Consumes: `BulletinTemplateConfig.content`/`.layout` (Task 2).
- Produces: `BulletinRenderData` gains `schoolLogoUrl: string | null` and `directorSignatureUrl: string | null` — consumed by Task 6 (editor sample data), Task 7/8 (viewer data), Task 10 (print page). Root element gains a `print-bulletin-canvas` marker class — consumed by Task 11 (PDF generation's "did it actually render" check).

- [ ] **Step 1: Add the two new fields to `BulletinRenderData`**

```ts
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
}
```

- [ ] **Step 2: Add the `print-bulletin-canvas` marker class and switch the outer padding to `config.layout.pageMargin`**

Change the root element and the content wrapper:

```tsx
  return (
    <div
      className="print-bulletin-canvas relative overflow-hidden rounded-[2px] bg-white shadow-2xl"
      style={{ minHeight: 586 }}
    >
```

(only the `className` changes here — `print-bulletin-canvas` prepended, rest unchanged)

and:

```tsx
      <div style={{ padding: config.layout.pageMargin }}>
```

(replacing `<div className="px-5 py-3.5">`)

- [ ] **Step 3: Drive block spacing from `config.layout.blockSpacing` in the `wrap` helper**

```tsx
  const wrap = (id: BlockId, content: React.ReactNode) =>
    visible(id) ? (
      <div
        onClick={() => onSelect?.(id)}
        style={{ marginBottom: config.layout.blockSpacing }}
        className={`relative rounded ${interactive ? 'cursor-pointer' : ''} ${selected === id ? 'outline outline-2 outline-primary' : ''}`}
      >
        {content}
      </div>
    ) : null;
```

- [ ] **Step 4: Render the real logo when present, title from config**

Replace the header's logo placeholder block:

```tsx
          {visible('header') && (
            <>
              {data.schoolLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.schoolLogoUrl}
                  alt={data.schoolName}
                  className="h-13 w-13 shrink-0 rounded-md object-contain"
                />
              ) : (
                <div
                  className="flex h-13 w-13 shrink-0 items-center justify-center rounded-md border-[1.5px] border-dashed"
                  style={{
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
                <div className="text-[10px] text-[#8884a0]">
                  Année {data.academicYear} · {data.period}
                </div>
              </div>
            </>
          )}
```

- [ ] **Step 5: Drive the notes table's cell borders from `config.layout`**

Add a local style constant right after the `scoreColor` helper function (before `export function BulletinCanvas`):

```ts
function cellBorderStyle(config: BulletinTemplateConfig): React.CSSProperties {
  return {
    borderBottomWidth: config.layout.borderWidth,
    borderBottomStyle: 'solid',
    borderBottomColor: config.layout.borderColor,
  };
}
```

Then, inside the `<tbody>` map, replace the 6 cells that currently hardcode `border-b border-[#f0eef8]`:

```tsx
            <tbody>
              {data.subjects.map((s, i) => (
                <tr key={s.name} style={i % 2 === 1 ? { background: '#faf9ff' } : undefined}>
                  <td
                    className="p-1.5"
                    style={{ ...cellBorderStyle(config), fontSize: config.typography.tableBody }}
                  >
                    <strong>{s.name}</strong>
                  </td>
                  {config.columns.coefficient && (
                    <td className="p-1.5" style={cellBorderStyle(config)}>
                      {s.coefficient ?? '—'}
                    </td>
                  )}
                  <td
                    className="p-1.5 font-bold"
                    style={{ ...cellBorderStyle(config), color: scoreColor(s.average) }}
                  >
                    {fmt(s.average)}
                  </td>
                  {config.columns.classAverage && (
                    <td className="p-1.5" style={cellBorderStyle(config)}>
                      {fmt(s.classAverage)}
                    </td>
                  )}
                  {config.columns.minMax && (
                    <>
                      <td className="p-1.5" style={cellBorderStyle(config)}>
                        {fmt(s.min)}
                      </td>
                      <td className="p-1.5" style={cellBorderStyle(config)}>
                        {fmt(s.max)}
                      </td>
                    </>
                  )}
                  {config.columns.appreciation && (
                    <td
                      className="p-1.5 text-[#6b6b8d] italic"
                      style={cellBorderStyle(config)}
                    >
                      {s.appreciation ?? '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
```

(`import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';` is already imported at the top of this file — reuse it for the new helper's parameter type.)

- [ ] **Step 6: Render the director's signature image and the optional footer message**

Update `SigBox` to accept an optional image, and pass it for the director's box only:

```tsx
        {wrap(
          'signatures',
          <div>
            <div className="mb-1.5 text-[9px] font-bold tracking-wide text-[#8884a0] uppercase">
              Signatures
            </div>
            <div className="flex gap-3.5">
              {config.signatures.director && (
                <SigBox
                  label="Signature du Directeur"
                  color={config.primaryColor}
                  imageUrl={data.directorSignatureUrl}
                />
              )}
              {config.signatures.homeroom && (
                <SigBox label="Signature du Titulaire de classe" color={config.primaryColor} />
              )}
              {config.signatures.guardian && (
                <SigBox label="Signature du Parent / Tuteur" color={config.primaryColor} />
              )}
            </div>
          </div>,
        )}

        {config.content.footerMessage && (
          <div className="mt-1 text-center text-[9px] text-[#8884a0] italic">
            {config.content.footerMessage}
          </div>
        )}
      </div>
```

(the closing `</div>` above is the existing one for the padded content wrapper — the footer message is inserted just before it, after the `wrap('signatures', ...)` call and before the closing gradient stripe `<div className="h-1.5" .../>`.)

```tsx
function SigBox({
  label,
  color,
  imageUrl,
}: {
  label: string;
  color: string;
  imageUrl?: string | null;
}) {
  return (
    <div
      className="flex min-h-13.5 flex-1 flex-col items-center justify-end gap-1 rounded-md border-[1.5px] border-dashed p-2.5 pb-1.5"
      style={{ borderColor: `${color}80` }}
    >
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={label} className="mb-1 h-8 w-auto object-contain" />
      )}
      <div className="text-center text-[9px] text-[#8884a0]">{label}</div>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

```bash
cd frontend && pnpm typecheck && pnpm lint
```

Expected: no errors. (`BulletinRenderData` now requires 2 new fields — this will surface every call site that constructs one, which Tasks 6 and 8 fix next; it's fine and expected for `pnpm build` to fail until those tasks land. Typecheck at this step confirms `BulletinCanvas.tsx` itself is internally consistent — the call-site errors are a checklist for the next two tasks, not a bug here.)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/bulletin/BulletinCanvas.tsx
git commit -m "feat(bulletins): render content/layout config, logo, and signature image in BulletinCanvas"
```

---

### Task 6: Editor page — wire Contenu/Espacement tabs, logo & signature upload

**Files:**
- Modify: `frontend/src/app/(school)/configuration/modele-bulletin/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `ImageUploader` (Task 4), `BulletinRenderData` (Task 5), `School.logoUrl`/`directorSignatureUrl` via `GET`/`PUT /api/school` (Tasks 1, 3).

- [ ] **Step 1: Add the `ImageUploader` import**

```tsx
import { ImageUploader } from '@/components/ui/ImageUploader';
```

- [ ] **Step 2: Add `schoolLogoUrl`/`directorSignatureUrl` to `SAMPLE_BULLETIN_DATA`**

```ts
const SAMPLE_BULLETIN_DATA: BulletinRenderData = {
  schoolName: 'École LesÉtoiles',
  schoolLogoUrl: null,
  directorSignatureUrl: null,
  period: 'Trimestre 2',
  // ...rest unchanged...
```

- [ ] **Step 3: Add school-branding state, fetch it, and add update handlers**

Add near the top of `BulletinEditorPage`, alongside the existing `useState` calls:

```tsx
  const [school, setSchool] = useState<{
    logoUrl: string | null;
    directorSignatureUrl: string | null;
  } | null>(null);
```

Add a second `useEffect` (alongside the existing template-fetching one):

```tsx
  useEffect(() => {
    if (!user) return;
    api<{ school: { logoUrl: string | null; directorSignatureUrl: string | null } }>(
      '/api/school',
    )
      .then((d) => setSchool(d.school))
      .catch(() => {
        // Non-fatal — the logo/signature panels just show the empty state.
      });
  }, [user]);
```

Add two handlers next to `toggleBlock`/`reorder`:

```tsx
  async function updateSchoolLogo(url: string | null) {
    setSchool((s) => (s ? { ...s, logoUrl: url } : s));
    try {
      await api('/api/school', { method: 'PUT', body: { logoUrl: url } });
    } catch {
      toast("Erreur lors de l'enregistrement du logo.", 'error');
    }
  }

  async function updateSchoolSignature(url: string | null) {
    setSchool((s) => (s ? { ...s, directorSignatureUrl: url } : s));
    try {
      await api('/api/school', { method: 'PUT', body: { directorSignatureUrl: url } });
    } catch {
      toast("Erreur lors de l'enregistrement de la signature.", 'error');
    }
  }
```

- [ ] **Step 4: Build the preview data from the sample plus the real school branding**

Replace the `orderedBlocks` memo line with two memos:

```tsx
  const orderedBlocks = useMemo(() => config?.blocks ?? [], [config]);
  const previewData: BulletinRenderData = useMemo(
    () => ({
      ...SAMPLE_BULLETIN_DATA,
      schoolLogoUrl: school?.logoUrl ?? null,
      directorSignatureUrl: school?.directorSignatureUrl ?? null,
    }),
    [school],
  );
```

- [ ] **Step 5: Pass `previewData` instead of the raw sample constant to the canvas**

```tsx
            <BulletinCanvas
              config={config}
              data={previewData}
              selected={selected}
              onSelect={setSelected}
            />
```

- [ ] **Step 6: Make the 3 property tabs actually switch**

```tsx
              <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
                {(['style', 'content', 'spacing'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPropTab(t)}
                    className={`flex-1 rounded px-1 py-1 text-[11px] font-medium ${propTab === t ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
                  >
                    {t === 'style' ? 'Style' : t === 'content' ? 'Contenu' : 'Espacement'}
                  </button>
                ))}
              </div>
```

- [ ] **Step 7: Gate the existing PropSections by tab and add the new ones**

Replace everything from `<PropSection title="Logo de l'établissement">` down to the closing `</PropSection>` of "Colonnes du tableau" with:

```tsx
            {propTab === 'style' && (
              <>
                <PropSection title="Couleurs du thème">
                  <PropRow label="Couleur principale">
                    <input
                      type="color"
                      value={config.primaryColor}
                      onChange={(e) => patchConfig({ primaryColor: e.target.value })}
                      className="h-5 w-8 cursor-pointer rounded border-none bg-transparent"
                    />
                  </PropRow>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => patchConfig({ primaryColor: c })}
                        style={{ background: c }}
                        className={`h-5 w-5 rounded ${config.primaryColor.toLowerCase() === c ? 'ring-2 ring-foreground ring-offset-1' : ''}`}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </PropSection>

                <PropSection title="Typographie" last>
                  <PropNumberRow
                    label="Nom établissement"
                    value={config.typography.schoolName}
                    onChange={(v) =>
                      patchConfig({ typography: { ...config.typography, schoolName: v } })
                    }
                  />
                  <PropNumberRow
                    label="Titre bulletin"
                    value={config.typography.title}
                    onChange={(v) =>
                      patchConfig({ typography: { ...config.typography, title: v } })
                    }
                  />
                  <PropNumberRow
                    label="Corps tableau"
                    value={config.typography.tableBody}
                    onChange={(v) =>
                      patchConfig({ typography: { ...config.typography, tableBody: v } })
                    }
                  />
                </PropSection>
              </>
            )}

            {propTab === 'content' && (
              <>
                <PropSection title="Logo de l'établissement">
                  <ImageUploader
                    label="Logo"
                    hint="PNG, JPG ou WebP — 10 Mo max"
                    value={school?.logoUrl ?? null}
                    onChange={updateSchoolLogo}
                  />
                </PropSection>

                <PropSection title="Signature du directeur">
                  <ImageUploader
                    label="Signature"
                    hint="PNG, JPG ou WebP — 10 Mo max"
                    value={school?.directorSignatureUrl ?? null}
                    onChange={updateSchoolSignature}
                  />
                </PropSection>

                <PropSection title="Texte du bulletin">
                  <label
                    className="mb-1 block text-xs font-medium text-foreground"
                    htmlFor="content-title"
                  >
                    Titre du bulletin
                  </label>
                  <input
                    id="content-title"
                    type="text"
                    maxLength={60}
                    value={config.content.title}
                    onChange={(e) =>
                      patchConfig({ content: { ...config.content, title: e.target.value } })
                    }
                    className="mb-3 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                  />
                  <label
                    className="mb-1 block text-xs font-medium text-foreground"
                    htmlFor="content-footer"
                  >
                    Message de pied de page
                  </label>
                  <textarea
                    id="content-footer"
                    maxLength={200}
                    rows={3}
                    value={config.content.footerMessage ?? ''}
                    onChange={(e) =>
                      patchConfig({
                        content: { ...config.content, footerMessage: e.target.value || null },
                      })
                    }
                    className="w-full resize-none rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                    placeholder="Optionnel — ex. « Ensemble vers la réussite »"
                  />
                </PropSection>

                <PropSection title="Signatures">
                  <SwitchRow
                    label="Directeur"
                    checked={config.signatures.director}
                    onChange={(v) =>
                      patchConfig({ signatures: { ...config.signatures, director: v } })
                    }
                  />
                  <SwitchRow
                    label="Titulaire de classe"
                    checked={config.signatures.homeroom}
                    onChange={(v) =>
                      patchConfig({ signatures: { ...config.signatures, homeroom: v } })
                    }
                  />
                  <SwitchRow
                    label="Parent / Tuteur"
                    checked={config.signatures.guardian}
                    onChange={(v) =>
                      patchConfig({ signatures: { ...config.signatures, guardian: v } })
                    }
                  />
                </PropSection>

                <PropSection title="Colonnes du tableau" last>
                  <SwitchRow
                    label="Coeff."
                    checked={config.columns.coefficient}
                    onChange={(v) =>
                      patchConfig({ columns: { ...config.columns, coefficient: v } })
                    }
                  />
                  <SwitchRow
                    label="Moy. classe"
                    checked={config.columns.classAverage}
                    onChange={(v) =>
                      patchConfig({ columns: { ...config.columns, classAverage: v } })
                    }
                  />
                  <SwitchRow
                    label="Min. / Max."
                    checked={config.columns.minMax}
                    onChange={(v) => patchConfig({ columns: { ...config.columns, minMax: v } })}
                  />
                  <SwitchRow
                    label="Appréciation"
                    checked={config.columns.appreciation}
                    onChange={(v) =>
                      patchConfig({ columns: { ...config.columns, appreciation: v } })
                    }
                  />
                  <SwitchRow
                    label="Absences (statistiques)"
                    checked={config.columns.absences}
                    onChange={(v) =>
                      patchConfig({ columns: { ...config.columns, absences: v } })
                    }
                  />
                  <SwitchRow
                    label="Rang (statistiques)"
                    checked={config.columns.rank}
                    onChange={(v) => patchConfig({ columns: { ...config.columns, rank: v } })}
                  />
                </PropSection>
              </>
            )}

            {propTab === 'spacing' && (
              <PropSection title="Espacement" last>
                <PropNumberRow
                  label="Marge de page (px)"
                  value={config.layout.pageMargin}
                  min={0}
                  max={48}
                  onChange={(v) => patchConfig({ layout: { ...config.layout, pageMargin: v } })}
                />
                <PropNumberRow
                  label="Espacement entre les blocs (px)"
                  value={config.layout.blockSpacing}
                  min={0}
                  max={32}
                  onChange={(v) =>
                    patchConfig({ layout: { ...config.layout, blockSpacing: v } })
                  }
                />
                <PropNumberRow
                  label="Épaisseur de bordure (px)"
                  value={config.layout.borderWidth}
                  min={0}
                  max={4}
                  onChange={(v) =>
                    patchConfig({ layout: { ...config.layout, borderWidth: v } })
                  }
                />
                <PropRow label="Couleur de bordure">
                  <input
                    type="color"
                    value={config.layout.borderColor}
                    onChange={(e) =>
                      patchConfig({ layout: { ...config.layout, borderColor: e.target.value } })
                    }
                    className="h-5 w-8 cursor-pointer rounded border-none bg-transparent"
                  />
                </PropRow>
              </PropSection>
            )}
```

- [ ] **Step 8: Extend `PropNumberRow` with optional `min`/`max`**

```tsx
function PropNumberRow({
  label,
  value,
  onChange,
  min = 8,
  max = 32,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <PropRow label={label}>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-14 rounded border-none bg-muted px-2 py-1 text-right text-xs text-foreground outline-none"
      />
    </PropRow>
  );
}
```

(default `8`/`32` preserves the 3 existing Typography call sites, which don't pass `min`/`max`.)

- [ ] **Step 9: Verify**

```bash
cd frontend && pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: no errors. If `format:check` fails, run `pnpm format` and re-verify.

- [ ] **Step 10: Manual check against the dev server**

Start `pnpm dev` if not already running (restart if it was already running before Task 1's migration — see Task 1 Step 6). Log in as an existing school admin, open `/configuration/modele-bulletin/<a-personal-template-id>/edit`, and confirm: Style tab shows only Couleurs/Typographie; Contenu tab shows Logo/Signature/Titre/Message/Signatures/Colonnes and nothing from Style; Espacement tab shows the 4 new controls and nothing else; changing the title/footer message/margin/spacing/border values visibly changes the live canvas preview; uploading a logo shows it in the header immediately.

- [ ] **Step 11: Commit**

```bash
git add "frontend/src/app/(school)/configuration/modele-bulletin/[id]/edit/page.tsx"
git commit -m "feat(bulletins): wire editor's Contenu/Espacement tabs and logo/signature upload"
```

---

### Task 7: Extract `getStudentBulletinView` + return school branding

**Files:**
- Create: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts`
- Modify: `frontend/src/app/api/school/students/[id]/bulletin/route.ts` (currently 241 lines — shrinks to ~35)

**Interfaces:**
- Produces: `getStudentBulletinView(schoolId: string, studentId: string, termIdParam: string | null): Promise<StudentBulletinView | null>` — consumed by Task 8 (this same route, now a thin wrapper), Task 10 (print page), Task 12 (PDF route).
- `StudentBulletinView` gains `schoolLogoUrl: string | null` and `directorSignatureUrl: string | null` versus the route's current JSON shape.

This is a pure code-move: every query and computation below is copied verbatim from the current route handler (`frontend/src/app/api/school/students/[id]/bulletin/route.ts`, as it exists before this task), with exactly two additions (`schoolLogoUrl`, `directorSignatureUrl` in the returned shell) and one signature change (`schoolId: string` parameter instead of reading it from `resolveMySchool` inline).

- [ ] **Step 1: Create the shared module**

Create `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts`:

```ts
// Shared bulletin-view data model — the single source of truth for "what
// does this student's bulletin contain", consumed by both the
// authenticated GET /api/school/students/[id]/bulletin route (Viewer page)
// and the token-authorized print page (server-side PDF generation, see
// docs/superpowers/specs/2026-08-13-bulletin-pdf-and-editor-design.md).
// Extracted so both callers share one query path rather than risking drift
// between "what the Viewer shows" and "what the PDF prints".
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import {
  classGeneralAverages,
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor,
} from '@/lib/server/grades';

export interface StudentBulletinView {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  dateOfBirth: Date | null;
  classId: string;
  className: string;
  classSize: number;
  homeroomTeacherName: string | null;
  schoolName: string;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  schoolLogoUrl: string | null;
  directorSignatureUrl: string | null;
  academicYearLabel: string;
  terms: { id: string; label: string; order: number }[];
  resolvedTermId: string | null;
  studentIndex: number | null;
  prevStudentId: string | null;
  nextStudentId: string | null;
  template: { id: string; name: string; config: unknown; isActive: boolean } | null;
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  subjects: {
    subjectName: string;
    teacherName: string | null;
    coefficient: number | null;
    average: number | null;
    classAverage: number | null;
    min: number | null;
    max: number | null;
    appreciation: string | null;
  }[];
  generalAppreciation: string | null;
}

export async function getStudentBulletinView(
  schoolId: string,
  studentId: string,
  termIdParam: string | null,
): Promise<StudentBulletinView | null> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.schoolId !== schoolId) return null;

  const [school, enrollment] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId } }),
    prisma.enrollment.findFirst({
      where: { studentId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            academicYearId: true,
            homeroomTeacher: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);
  if (!enrollment) return null;

  const [terms, academicYear] = await Promise.all([
    prisma.term.findMany({
      where: { academicYearId: enrollment.class.academicYearId },
      orderBy: { order: 'asc' },
    }),
    prisma.academicYear.findUnique({ where: { id: enrollment.class.academicYearId } }),
  ]);
  const term = termIdParam
    ? (terms.find((t) => t.id === termIdParam) ?? null)
    : resolveCurrentTerm(terms);

  const classmates = await prisma.enrollment.findMany({
    where: { classId: enrollment.classId, academicYearId: enrollment.class.academicYearId },
    include: { student: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });
  const idx = classmates.findIndex((cm) => cm.studentId === studentId);
  const prevStudentId = idx > 0 ? classmates[idx - 1]!.studentId : null;
  const nextStudentId =
    idx >= 0 && idx < classmates.length - 1 ? classmates[idx + 1]!.studentId : null;

  const [activeTemplate, fallbackTemplate] = await Promise.all([
    prisma.bulletinTemplate.findFirst({ where: { schoolId, isActive: true } }),
    prisma.bulletinTemplate.findFirst({
      where: { schoolId: null },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const template = activeTemplate ?? fallbackTemplate;

  const shell = {
    studentId,
    firstName: student.firstName,
    lastName: student.lastName,
    studentNumber: student.studentNumber,
    dateOfBirth: student.dateOfBirth,
    classId: enrollment.classId,
    className: enrollment.class.name,
    classSize: classmates.length,
    homeroomTeacherName: enrollment.class.homeroomTeacher?.name ?? null,
    schoolName: school?.name ?? '',
    schoolAddress: school?.address ?? null,
    schoolPhone: school?.phone ?? null,
    schoolEmail: school?.officialEmail ?? null,
    schoolLogoUrl: school?.logoUrl ?? null,
    directorSignatureUrl: school?.directorSignatureUrl ?? null,
    academicYearLabel: academicYear?.label ?? '',
    terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
    resolvedTermId: term?.id ?? null,
    studentIndex: idx >= 0 ? idx + 1 : null,
    prevStudentId,
    nextStudentId,
    template: template
      ? { id: template.id, name: template.name, config: template.config, isActive: template.isActive }
      : null,
  };

  if (!term) {
    return {
      ...shell,
      overallAverage: null,
      classAverage: null,
      rank: null,
      rankedCount: 0,
      subjects: [],
      generalAppreciation: null,
    };
  }

  const classSubjects = await prisma.classSubject.findMany({
    where: { classId: enrollment.classId },
    include: { subject: true, teacher: { select: { id: true, name: true } } },
    orderBy: [{ subject: { domain: 'asc' } }, { subject: { name: 'asc' } }],
  });
  const classSubjectIds = classSubjects.map((cs) => cs.id);
  const classmateIds = classmates.map((cm) => cm.studentId);

  const [evaluations, appreciations] = await Promise.all([
    classSubjectIds.length === 0
      ? Promise.resolve([])
      : prisma.evaluation.findMany({
          where: { classSubjectId: { in: classSubjectIds }, termId: term.id },
          include: { grades: true },
        }),
    prisma.appreciation.findMany({ where: { studentId, termId: term.id } }),
  ]);

  const evalsByClassSubject = new Map<string, typeof evaluations>();
  for (const ev of evaluations) {
    const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
    list.push(ev);
    evalsByClassSubject.set(ev.classSubjectId, list);
  }
  const apprByClassSubject = new Map(
    appreciations.filter((a) => a.subjectId != null).map((a) => [a.subjectId!, a]),
  );
  const generalRow = appreciations.find((a) => a.subjectId == null) ?? null;

  const subjects = classSubjects.map((cs) => {
    const evals = evalsByClassSubject.get(cs.id) ?? [];
    const classAveragesForSubject = classmateIds
      .map((id) => subjectAverageFor(evals, id))
      .filter((a): a is number => a != null);
    const classAverage = classAveragesForSubject.length
      ? Math.round(
          (classAveragesForSubject.reduce((a, b) => a + b, 0) / classAveragesForSubject.length) *
            10,
        ) / 10
      : null;
    const appr = apprByClassSubject.get(cs.subjectId);
    return {
      subjectName: cs.subject.name,
      teacherName: cs.teacher?.name ?? null,
      coefficient: cs.coefficient,
      average: subjectAverageFor(evals, studentId),
      classAverage,
      min: classAveragesForSubject.length ? Math.min(...classAveragesForSubject) : null,
      max: classAveragesForSubject.length ? Math.max(...classAveragesForSubject) : null,
      appreciation: appr?.text ?? null,
    };
  });

  const averages = classGeneralAverages(classSubjects, evalsByClassSubject, classmateIds);
  const overallAverage = averages.get(studentId) ?? null;
  const classAverageValues = [...averages.values()].filter((a): a is number => a != null);
  const classAverage = classAverageValues.length
    ? Math.round(
        (classAverageValues.reduce((a, b) => a + b, 0) / classAverageValues.length) * 10,
      ) / 10
    : null;
  const ranked = classmateIds
    .map((id) => ({ studentId: id, average: averages.get(id) ?? null }))
    .filter((r): r is { studentId: string; average: number } => r.average != null)
    .sort((a, b) => b.average - a.average);
  const ranks = competitionRank(ranked, (r) => r.average);
  const rankEntry = ranked.findIndex((r) => r.studentId === studentId);

  return {
    ...shell,
    overallAverage,
    classAverage,
    rank: rankEntry >= 0 ? ranks[rankEntry]! : null,
    rankedCount: ranked.length,
    subjects,
    generalAppreciation: generalRow?.text ?? null,
  };
}
```

- [ ] **Step 2: Shrink the route to a thin wrapper**

Replace the entire content of `frontend/src/app/api/school/students/[id]/bulletin/route.ts` with:

```ts
// GET /api/school/students/[id]/bulletin?termId= — Bulletin Viewer's full
// data model. The actual query lives in getStudentBulletinView
// (lib/server/bulletin-pdf/get-bulletin-view.ts), shared with the
// server-side PDF pipeline's print page so both render identically.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id: studentId } = await params;
    const termId = req.nextUrl.searchParams.get('termId');
    const view = await getStudentBulletinView(mySchool.schoolId, studentId, termId);
    if (!view) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 3: Verify**

```bash
cd frontend && pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Manual regression check**

With the dev server running (logged in as a school admin/teacher), open `/bulletins/<studentId>/<termId>` for a student with real grades — confirm the page looks identical to before this refactor (same averages, rank, subjects, template). This is a pure extraction; any visible difference is a regression.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts \
        "frontend/src/app/api/school/students/[id]/bulletin/route.ts"
git commit -m "refactor(bulletins): extract getStudentBulletinView, add school logo/signature to the response"
```

---

### Task 8: Viewer page — pass logo/signature through to `BulletinCanvas`

**Files:**
- Modify: `frontend/src/app/(school)/bulletins/types.ts`
- Modify: `frontend/src/app/(school)/bulletins/[studentId]/[termId]/page.tsx`

**Interfaces:**
- Consumes: `StudentBulletinView.schoolLogoUrl`/`.directorSignatureUrl` (Task 7).

- [ ] **Step 1: Add the two fields to `StudentBulletinData`**

In `frontend/src/app/(school)/bulletins/types.ts`:

```ts
export interface StudentBulletinData {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  dateOfBirth: string;
  classId: string;
  className: string;
  classSize: number;
  homeroomTeacherName: string | null;
  schoolName: string;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  schoolLogoUrl: string | null;
  directorSignatureUrl: string | null;
  academicYearLabel: string;
  terms: TermOption[];
  resolvedTermId: string | null;
  studentIndex: number | null;
  prevStudentId: string | null;
  nextStudentId: string | null;
  template: BulletinTemplateRef | null;
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  subjects: BulletinSubjectRow[];
  generalAppreciation: string | null;
}
```

- [ ] **Step 2: Pass the fields into `renderData`**

In `frontend/src/app/(school)/bulletins/[studentId]/[termId]/page.tsx`, inside the `renderData` construction:

```tsx
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
  };
```

- [ ] **Step 3: Verify**

```bash
cd frontend && pnpm typecheck && pnpm lint && pnpm build
```

Expected: no errors — this is the last call site that needed the 2 new `BulletinRenderData` fields, so `pnpm build` (which was expected to fail after Task 5 alone) should now succeed.

- [ ] **Step 4: Manual check**

With a school that has uploaded a logo (via Task 6's editor panel) and an active template with `signatures.director: true`, open that school's `/bulletins/<studentId>/<termId>` — confirm the real logo renders in the header and, if a signature image was uploaded, it renders in the director signature box.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/(school)/bulletins/types.ts" \
        "frontend/src/app/(school)/bulletins/[studentId]/[termId]/page.tsx"
git commit -m "feat(bulletins): render school logo/signature on the Viewer page"
```

---

### Task 9: Print-token module

**Files:**
- Create: `frontend/src/lib/server/bulletin-pdf/print-token.ts`
- Create: `frontend/src/lib/server/bulletin-pdf/print-token.test.ts`

**Interfaces:**
- Produces: `signPrintToken({schoolId, studentId, termId}): string`, `verifyPrintToken(token: string): PrintTokenPayload | null` — consumed by Task 10 (print page verifies), Task 11 (PDF service signs).

Modeled directly on `frontend/src/lib/server/cron/auth.ts`'s existing self-contained-HMAC pattern (does not import `auth.ts`/`crypto.ts`, both CLAUDE.md-protected). Reuses `JWT_SECRET` (already required at boot, ≥32 chars) rather than adding a new env var.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/server/bulletin-pdf/print-token.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signPrintToken, verifyPrintToken } from './print-token';

describe('print-token (bulletin PDF authorization)', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'a-test-secret-that-is-at-least-32-characters-long');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips a signed payload', () => {
    const token = signPrintToken({ schoolId: 's1', studentId: 'st1', termId: 't1' });
    const payload = verifyPrintToken(token);
    expect(payload).toMatchObject({ schoolId: 's1', studentId: 'st1', termId: 't1' });
  });

  it('rejects a payload tampered after signing', () => {
    const token = signPrintToken({ schoolId: 's1', studentId: 'st1', termId: 't1' });
    const [, sig] = token.split('.');
    const tamperedBody = Buffer.from(
      JSON.stringify({
        schoolId: 's1',
        studentId: 'ATTACKER-CONTROLLED',
        termId: 't1',
        exp: Date.now() + 60_000,
      }),
    ).toString('base64url');
    expect(verifyPrintToken(`${tamperedBody}.${sig}`)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signPrintToken({ schoolId: 's1', studentId: 'st1', termId: 't1' });
    vi.stubEnv('JWT_SECRET', 'a-different-test-secret-that-is-also-32-chars');
    expect(verifyPrintToken(token)).toBeNull();
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    const token = signPrintToken({ schoolId: 's1', studentId: 'st1', termId: 't1' });
    vi.advanceTimersByTime(61_000);
    expect(verifyPrintToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifyPrintToken('not-a-real-token')).toBeNull();
    expect(verifyPrintToken('')).toBeNull();
    expect(verifyPrintToken('only-one-part')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd frontend && pnpm exec vitest run src/lib/server/bulletin-pdf/print-token.test.ts
```

Expected: FAIL — `./print-token` does not exist yet.

- [ ] **Step 3: Implement the module**

Create `frontend/src/lib/server/bulletin-pdf/print-token.ts`:

```ts
// Short-lived, self-contained authorization for the server-side PDF
// pipeline's print page (Puppeteer navigates there with no session
// cookie). Modeled on lib/server/cron/auth.ts's HMAC pattern — does NOT
// import auth.ts/crypto.ts (both CLAUDE.md-protected). Reuses JWT_SECRET
// (already required at boot, >=32 chars) rather than adding a new env var.
//
// The payload IS the authorization envelope: schoolId/studentId/termId are
// bound together and signed, so a token can never be replayed to render a
// different student's bulletin, and it self-expires after 60s.
import 'server-only';
import crypto from 'node:crypto';

export interface PrintTokenPayload {
  schoolId: string;
  studentId: string;
  termId: string;
  exp: number;
}

const TTL_MS = 60_000;

function secret(): string {
  return process.env.JWT_SECRET ?? '';
}

export function signPrintToken(payload: Omit<PrintTokenPayload, 'exp'>): string {
  const full: PrintTokenPayload = { ...payload, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyPrintToken(token: string): PrintTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: PrintTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}
```

- [ ] **Step 4: Run the test again to confirm it passes**

```bash
cd frontend && pnpm exec vitest run src/lib/server/bulletin-pdf/print-token.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Verify**

```bash
cd frontend && pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/bulletin-pdf/print-token.ts \
        frontend/src/lib/server/bulletin-pdf/print-token.test.ts
git commit -m "feat(bulletins): add self-contained print-token sign/verify for PDF generation"
```

---

### Task 10: Print page

**Files:**
- Create: `frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx`

**Interfaces:**
- Consumes: `verifyPrintToken` (Task 9), `getStudentBulletinView` (Task 7), `BulletinCanvas` (Task 5).

- [ ] **Step 1: Write the page**

Create `frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx`:

```tsx
import { verifyPrintToken } from '@/lib/server/bulletin-pdf/print-token';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { BulletinCanvas, type BulletinRenderData } from '@/components/bulletin/BulletinCanvas';
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';

export const dynamic = 'force-dynamic';

// Standalone print target for the server-side PDF pipeline (Puppeteer
// navigates here, see lib/server/bulletin-pdf/generate.ts). Authorized by a
// short-lived signed token bound to exactly one (schoolId, studentId,
// termId) tuple — never a session cookie, since headless Chromium has no
// browser session. Renders the same BulletinCanvas the Viewer shows on
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

  const view = await getStudentBulletinView(payload.schoolId, studentId, termId);
  if (!view || !view.template) {
    return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Bulletin indisponible.</p>;
  }

  const config = view.template.config as BulletinTemplateConfig;
  const termLabel = view.terms.find((t) => t.id === view.resolvedTermId)?.label ?? '';
  const renderData: BulletinRenderData = {
    schoolName: view.schoolName,
    schoolLogoUrl: view.schoolLogoUrl,
    directorSignatureUrl: view.directorSignatureUrl,
    period: termLabel,
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
  };

  return (
    <>
      {/* Puppeteer prints with preferCSSPageSize -> this @page rule drives
          the actual paper size + orientation. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@page{size:${config.pageFormat === 'LETTER' ? 'letter' : 'A4'} ${config.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait'};margin:0}`,
        }}
      />
      <div style={{ padding: 24 }}>
        <BulletinCanvas config={config} data={renderData} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd frontend && pnpm typecheck && pnpm lint && pnpm build
```

Expected: no errors; the production route manifest includes `/print/bulletin/[studentId]/[termId]`.

- [ ] **Step 3: Manual check**

This route can't be opened directly by hand (it requires a signed token) — full verification happens end-to-end in Task 14 once Tasks 11-12 exist to mint a real token. For now, confirm the build succeeded and the file has no type errors.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx"
git commit -m "feat(bulletins): add token-authorized print page for PDF generation"
```

---

### Task 11: PDF generation service

**Files:**
- Modify: `frontend/package.json` (new dependencies)
- Create: `frontend/src/lib/server/bulletin-pdf/generate.ts`

**Interfaces:**
- Consumes: `signPrintToken` (Task 9).
- Produces: `generateBulletinPdf(schoolId, studentId, termId, options): Promise<Buffer>`, `class PdfGenerationError extends Error` — consumed by Task 12 (PDF route).

- [ ] **Step 1: Add the new dependencies**

```bash
cd frontend && pnpm add puppeteer-core @sparticuz/chromium
```

- [ ] **Step 2: Write the service**

Create `frontend/src/lib/server/bulletin-pdf/generate.ts`:

```ts
// Server-side WYSIWYG PDF via headless Chromium: navigates to the
// standalone print page (app/print/bulletin/[studentId]/[termId]), which
// renders the exact same BulletinCanvas the Viewer shows on screen — see
// docs/superpowers/specs/2026-08-13-bulletin-pdf-and-editor-design.md for
// why this beats a parallel PDF-primitive renderer. @sparticuz/chromium
// bundles a Vercel/serverless-compatible Chromium binary; puppeteer-core
// (no bundled browser) drives it — this pairing works both locally and on
// Vercel with the same code path.
import 'server-only';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { signPrintToken } from './print-token';

export class PdfGenerationError extends Error {}

export interface GeneratePdfOptions {
  pageFormat: 'LETTER' | 'A4';
  orientation: 'LANDSCAPE' | 'PORTRAIT';
}

export async function generateBulletinPdf(
  schoolId: string,
  studentId: string,
  termId: string,
  options: GeneratePdfOptions,
): Promise<Buffer> {
  const token = signPrintToken({ schoolId, studentId, termId });
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const url = `${base}/print/bulletin/${studentId}/${termId}?token=${encodeURIComponent(token)}`;

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.emulateMediaType('print');
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });
    if (!response || !response.ok()) {
      throw new PdfGenerationError(
        `Print page returned ${response ? response.status() : 'no response'}`,
      );
    }
    const rendered = await page.evaluate(
      () => document.querySelector('.print-bulletin-canvas') != null,
    );
    if (!rendered) {
      throw new PdfGenerationError('Print page did not render a bulletin');
    }
    const bytes = await page.pdf({
      format: options.pageFormat === 'LETTER' ? 'letter' : 'a4',
      landscape: options.orientation === 'LANDSCAPE',
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(bytes);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 3: Verify**

```bash
cd frontend && pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/lib/server/bulletin-pdf/generate.ts
git commit -m "feat(bulletins): add server-side PDF generation via headless Chromium"
```

---

### Task 12: PDF route handler

**Files:**
- Create: `frontend/src/app/api/school/students/[id]/bulletin/pdf/route.ts`

**Interfaces:**
- Consumes: `getStudentBulletinView` (Task 7), `generateBulletinPdf`/`PdfGenerationError` (Task 11).

- [ ] **Step 1: Write the route**

Create `frontend/src/app/api/school/students/[id]/bulletin/pdf/route.ts`:

```ts
// GET /api/school/students/[id]/bulletin/pdf?termId= — server-generated PDF
// of the Bulletin Viewer's exact rendering. Mints a short-lived print token
// (lib/server/bulletin-pdf/print-token.ts) and drives headless Chromium
// against the standalone print page (app/print/bulletin/...), streaming
// the resulting PDF bytes back.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { generateBulletinPdf, PdfGenerationError } from '@/lib/server/bulletin-pdf/generate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id: studentId } = await params;
    const termId = req.nextUrl.searchParams.get('termId');
    if (!termId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'termId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const view = await getStudentBulletinView(mySchool.schoolId, studentId, termId);
    if (!view || !view.template) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Bulletin not available' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const config = view.template.config as BulletinTemplateConfig;
    let pdf: Buffer;
    try {
      pdf = await generateBulletinPdf(mySchool.schoolId, studentId, termId, {
        pageFormat: config.pageFormat,
        orientation: config.orientation,
      });
    } catch (err) {
      if (err instanceof PdfGenerationError) {
        return NextResponse.json(
          { error: 'PDF_GENERATION_FAILED', message: err.message },
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    const safeName =
      `${view.firstName}-${view.lastName}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\w-]+/g, '-') || studentId;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="bulletin-${safeName}.pdf"`,
        'x-request-id': ctx.requestId,
      },
    });
  });
}
```

- [ ] **Step 2: Verify**

```bash
cd frontend && pnpm typecheck && pnpm lint && pnpm build
```

Expected: no errors; the runtime-enforcement test (`pnpm test -- runtime-enforcement`) automatically covers this new route via its glob — confirm:

```bash
pnpm exec vitest run src/lib/server/observability/runtime-enforcement.test.ts
```

Expected: PASS, including a line for this new route file.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/api/school/students/[id]/bulletin/pdf/route.ts"
git commit -m "feat(bulletins): add GET /api/school/students/[id]/bulletin/pdf"
```

---

### Task 13: Viewer page — "Télécharger PDF" button

**Files:**
- Modify: `frontend/src/app/(school)/bulletins/[studentId]/[termId]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/school/students/[id]/bulletin/pdf` (Task 12).

- [ ] **Step 1: Add the `Download` icon import**

```tsx
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Printer,
  Pencil,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Download,
} from 'lucide-react';
```

- [ ] **Step 2: Add the download link to the Actions panel**

Between the existing `Imprimer` button and the `Modifier l'appréciation` link:

```tsx
          <ActionBtn icon={Printer} label="Imprimer" primary onClick={() => window.print()} />
          <a
            href={`/api/school/students/${data.studentId}/bulletin/pdf?termId=${data.resolvedTermId ?? ''}`}
            className="mb-1 flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-[13px] font-medium text-foreground"
          >
            <Download size={14} className="text-muted-foreground" />
            Télécharger PDF
          </a>
          <Link
            href={`/pedagogie/appreciations/${data.studentId}/saisie?termId=${data.resolvedTermId ?? ''}`}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-[13px] font-medium text-foreground"
          >
            <Pencil size={14} className="text-muted-foreground" />
            Modifier l&apos;appréciation
          </Link>
```

(A plain `<a href>` is enough — the route's `Content-Disposition: attachment` header triggers the browser's save-file flow on click, and same-origin navigation carries the session cookie automatically; no CSRF header is needed since this is a `GET`.)

- [ ] **Step 3: Verify**

```bash
cd frontend && pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(school)/bulletins/[studentId]/[termId]/page.tsx"
git commit -m "feat(bulletins): wire Télécharger PDF button on the Viewer page"
```

---

### Task 14: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full static verification**

```bash
cd frontend && pnpm format && pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

Expected: all green. Note the test-count delta versus the pre-existing baseline in `.planning/banani/STATUS.md` (612 at last count) — expect +2 files (`print-token.test.ts`, `backfill-bulletin-template-content-layout.test.ts`) worth of new tests, all passing.

- [ ] **Step 2: Live E2E — data model & editor**

With `pnpm dev` running and logged in as an existing school admin (reuse the credentials already used throughout this project's prior E2E passes, documented in `.planning/banani/STATUS.md`):

1. `GET /api/school` — confirm `logoUrl`/`directorSignatureUrl` are present (null initially).
2. Open the editor for a personal template. Confirm the Style/Contenu/Espacement tabs each show only their own controls (this is the main previously-broken behavior this plan fixes).
3. Upload a logo and a director signature via the Contenu tab. Confirm `GET /api/school` now returns both URLs, and the editor's live preview shows the logo in the header immediately.
4. Change the bulletin title, footer message, and the 4 Espacement controls. Confirm the live canvas preview reflects every change.
5. Save. Reload the editor page. Confirm every change persisted (title, footer, spacing, logo, signature).

- [ ] **Step 3: Live E2E — PDF generation**

Using a real student with real grades (reuse a student from a prior epic's E2E seeding, e.g. Aminata Diallo / Karim Benali per `.planning/banani/STATUS.md`):

```bash
curl -i --cookie "<the authenticated cookie jar>" \
  "http://localhost:3000/api/school/students/<studentId>/bulletin/pdf?termId=<termId>" \
  -o /tmp/claude-1000/.../scratchpad/test-bulletin.pdf
```

(Use the project's established Node-script-with-cookie-jar pattern from prior E2E passes rather than raw curl if auth/CSRF cookies make curl awkward — either is fine as long as the request is genuinely authenticated.)

Confirm:
- `Content-Type: application/pdf` and a `Content-Disposition: attachment; filename="bulletin-....pdf"` header.
- The downloaded file is a valid, non-trivial-sized PDF (not the few hundred bytes an error page would produce) — check with `file /tmp/.../test-bulletin.pdf` (expect `PDF document`) and a byte-size sanity check.
- Open the PDF (via any available viewer, or `pdftotext` if installed, to dump its text) and confirm the student's real name and average appear — i.e. this is not a blank or error-page PDF.
- Repeat with a school that has an uploaded logo and director signature — confirm both appear in the PDF (this is the core "notamment pour l'affichage des moyennes" — averages — plus the logo/signature requirement from the original request).

**Known limitation to state honestly, not silently skip:** headless Chromium may not be runnable inside a given sandboxed dev environment (missing shared libraries / no permission to spawn a browser process). If `generateBulletinPdf` throws at the `puppeteer.launch()` step in this environment, that must be reported as-is — do not claim the PDF was verified if it wasn't. In that case, verify as far as the environment allows (the route returns a clean 502 `PDF_GENERATION_FAILED` rather than crashing; the print page itself renders correctly when fetched directly with a manually-signed token, confirming everything up to the Chromium launch is correct) and flag the Chromium-specific step as unverified-in-this-environment, to be confirmed by the user against a real deploy or their own local machine.

- [ ] **Step 4: Live E2E — Viewer download button**

Open `/bulletins/<studentId>/<termId>` in a browser, click "Télécharger PDF" in the action panel, confirm the browser starts a download (or, if only curl/scripted checks are available in this environment, confirm the link's `href` resolves to the same route verified in Step 3).

- [ ] **Step 5: Update `.planning/banani/STATUS.md`**

Add an entry documenting this pass (new PDF generation subsystem, editor Contenu/Espacement completion, logo/signature upload, the `getStudentBulletinView` extraction, and the honest Chromium-sandbox caveat from Step 3) — follow the same discovery-notes format every other entry in that file already uses.

- [ ] **Step 6: Final commit**

```bash
git add .planning/banani/STATUS.md
git commit -m "docs(banani): record bulletin PDF generation and editor completion pass"
```
