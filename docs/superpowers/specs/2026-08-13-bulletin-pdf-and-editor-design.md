# Bulletin PDF Generation & Template Editor Completion — Design Spec

Date: 2026-08-13
Status: Approved for planning

## Problem

Epic 7 shipped the bulletin template gallery, editor, report-cards list, and
viewer — but two pieces were explicitly deferred at the time:

1. **No real PDF.** The Viewer's only "export" is `window.print()` (browser
   print dialog → user-driven "save as PDF"). There is no server-generated
   PDF file, so averages/tables can't be reliably handed to a parent as a
   downloadable, consistently-formatted document.
2. **The editor's right panel is decorative in two of its three tabs.**
   Style/Contenu/Espacement tabs exist visually, but `propTab` state doesn't
   actually gate any of the property sections — everything renders
   regardless of which tab is selected — and clicking Contenu or Espacement
   just fires a toast ("Onglet à venir"). The "Logo de l'établissement"
   upload box is present but explicitly disabled ("Non câblé cette phase").

This spec closes both gaps: real server-side PDF generation, and a genuinely
functional Contenu/Espacement split in the editor, including logo and
director-signature image upload.

Reference: the user's prior project `ekolplus` (v1, NestJS + Next.js 15,
`/home/amos-dorceus/Documents/SaaSManagement/ekolplus`) solved the same
problem and is the explicit inspiration for this pass. Its
`BulletinPdfService` (Puppeteer renders a standalone `/print/[tenant]/[id]`
route, `pdf-lib` merges batches) and `BulletinBuilder`/`bulletin-sections.ts`
(structure + style panels, `@dnd-kit` reordering) were read in full before
writing this spec.

## Scope

In scope:
- Server-side PDF generation for a single student's bulletin, downloadable
  from the Viewer page.
- `BulletinTemplateConfig` gains `content` (title, footer message) and
  `layout` (page margin, block spacing, border width/color) sections.
- `School` gains `logoUrl` + `directorSignatureUrl`, uploaded via the
  existing `/api/upload` (Cloudinary) route, rendered in `BulletinCanvas`.
- Editor's Contenu and Espacement tabs actually gate their sections instead
  of being decorative.

Out of scope this pass (confirmed with the user):
- **Batch/whole-class PDF export** (merging multiple students' bulletins
  into one file, like v1's `pdf-batch`). Natural follow-up once single-PDF
  generation is proven; not built now.
- **The editor's own "Exporter PDF" button** (would export the illustrative
  sample data, not a real student) — stays a stub. Real PDF export is wired
  only where it has real data behind it: the Viewer.
- **Per-block label text editing** (renaming "Moyenne générale" itself,
  "Signature du Directeur", etc.) — only the bulletin title and footer
  message become editable text, matching the bound v1's own editor kept.
- **Swapping the block-reorder drag-and-drop to `@dnd-kit`.** The existing
  native HTML5 DnD (5 reorderable blocks) already works and was verified
  earlier this session. v1 used `@dnd-kit` for a smoother animated version,
  but that's a polish upgrade, not a missing capability — not worth the new
  dependency + rewrite risk in this pass.

## Current state (as found)

- `BulletinCanvas` (`components/bulletin/BulletinCanvas.tsx`) is the single
  shared renderer already consumed by both the editor (illustrative sample
  data) and the Viewer (real computed data) — this is the WYSIWYG guarantee
  the PDF must also honor, not bypass.
- `BulletinTemplateConfig` (`lib/server/bulletin-templates.ts`, zod-validated)
  currently has: `primaryColor`, `pageFormat`, `orientation`, `blocks`
  (id+visible), `columns`, `signatures`, `typography`. No `content` or
  `layout` section exists yet.
- `School` (`prisma/schema.prisma`) has no logo/signature fields. "School
  logo upload wiring" was already flagged as missing twice before (Create
  School and School Settings' Établissement tab both left it unwired) — this
  pass is the first real consumer.
- `/api/upload` (`app/api/school/../route.ts` — actually
  `app/api/upload/route.ts`) is a working, generic authenticated Cloudinary
  upload endpoint: CSRF → auth → Cloudinary-configured check → size/MIME/
  magic-byte validation → returns `{ ...row, url }`. Reusable as-is for both
  the logo and the signature image; no changes needed to this route.
- `APP_URL` env var already exists (`.env.example` §3, consumed by the OAuth
  flow's `isSameOriginNext`/redirect helpers) — the print route's absolute
  URL will reuse this same convention, no new env var.
- `jose` is already a dependency (used by the Google OAuth flow for ID-token
  decoding), but the print-page token is deliberately NOT built on the
  protected `auth.ts`/`crypto.ts` — those are off-limits per CLAUDE.md. A
  small, self-contained signer/verifier lives in the new PDF module instead
  (built on Node's built-in `crypto.createHmac`, no new dependency), scoped
  only to "may render this one bulletin," nothing else.
- Migration folders are zero-padded (`00`…`13`) after the fix documented in
  the attendance-tracking STATUS.md entry — `prisma migrate dev --name X`
  now works normally (no more hand-written-SQL workaround needed).

## New dependencies

| Package | Use |
|---|---|
| `puppeteer-core` | Drives headless Chromium to render the print page and call `page.pdf()` |
| `@sparticuz/chromium` | Vercel/serverless-compatible Chromium binary + launch args, paired with `puppeteer-core` |

Both are additive. No PDF library is added to the frontend bundle — this
code only runs inside `runtime = 'nodejs'` Route Handlers, never shipped to
the browser.

## Data model changes

```prisma
model School {
  // ...existing fields...
  logoUrl              String?
  directorSignatureUrl String?
}
```

```ts
// BulletinTemplateConfig additions
content: {
  title: string;          // default "BULLETIN SCOLAIRE"
  footerMessage: string | null;
}
layout: {
  pageMargin: number;      // px, canvas outer padding — default 20
  blockSpacing: number;    // px, gap between blocks — default 10
  borderWidth: number;     // px, table/box border weight — default 1
  borderColor: string;     // hex — default derived from current fixed value
}
```

New migration `14_bulletin_branding` adds the two `School` columns (plain
`ALTER TABLE ... ADD COLUMN`, both nullable — no backfill needed for a
nullable column). Existing `BulletinTemplate.config` JSON rows (3 seeded
global templates + any personal forks) predate `content`/`layout` — a
one-off backfill script merges the defaults into every row missing them,
same pattern as the original `seed-bulletin-templates.ts`. The zod schema's
new fields are required (not `.optional()`) precisely so the backfill is a
one-time, complete fix rather than permanent defensive `?? default` reads
scattered through `BulletinCanvas`/the editor.

## Architecture: PDF generation

```
Viewer page "Télécharger PDF"
        │  GET /api/school/students/[id]/bulletin/pdf?termId=
        ▼
Route Handler (runtime=nodejs)
  1. requireAuth + resolve school/student (same guard as the existing
     GET .../bulletin route)
  2. mint short-lived signed token { schoolId, studentId, termId, exp:60s }
  3. launch puppeteer-core + @sparticuz/chromium
  4. page.goto(`${APP_URL}/print/bulletin/${studentId}/${termId}?token=…`)
  5. page.pdf({ format: pageFormat, landscape: orientation==='LANDSCAPE',
     printBackground: true })
  6. close browser (finally)
  7. return NextResponse with Content-Type: application/pdf,
     Content-Disposition: attachment; filename="bulletin-{name}.pdf"
        │
        ▼
GET /print/bulletin/[studentId]/[termId]?token=  (new page, server component)
  1. verify token (self-contained HMAC verify, new small module — does NOT
     touch auth.ts/crypto.ts)
  2. token payload IS the authorization envelope (schoolId/studentId/termId
     bound together) — no session cookie involved, so a stolen token can't
     be replayed for a different student and can't outlive 60s
  3. fetch bulletin data by calling the SAME data-fetching function the
     existing GET .../bulletin route uses, extracted into a plain exported
     function so both the authenticated route and this token-authorized
     page can call it without going through requireAuth() twice
  4. render <BulletinCanvas config data /> — the exact same component the
     Viewer shows on screen — inside a minimal wrapper with an injected
     `@page { size: ...; margin: ... }` rule (Puppeteer's
     preferCSSPageSize honors this)
```

The print page is a normal route under the existing root layout (Inter
font + `AuthProvider`/`ToastProvider`) — it does not need its own separate
root layout. It never calls `useUser()` or any client-side `api()` call, so
running unauthenticated (no cookies from Puppeteer) is harmless; the
providers simply have no logged-in user, which nothing on this page reads.

### Error handling

- Token missing/invalid/expired → print page renders a plain "Lien invalide
  ou expiré" message (mirrors v1) instead of throwing — Puppeteer still
  gets a 200 HTML page, and the PDF route's own `page.evaluate` check (does
  the bulletin content actually exist?) turns that into a clean 502
  `PDF_GENERATION_FAILED` rather than shipping a PDF of an error message.
- Browser launch failure (e.g. Chromium binary problem) → caught, 502
  `PDF_GENERATION_FAILED`, browser closed in `finally` either way.
- No active/fallback template (shouldn't happen given the existing
  fallback-to-oldest-global-template logic, but defensively handled the
  same way the Viewer already handles it) → same clean message, no crash.

## Architecture: editor completion

`propTab` (`'style' | 'content' | 'spacing'`) starts actually gating which
`PropSection`s render:

- **Style** (unchanged): Couleurs du thème, Typographie.
- **Contenu**: Logo de l'établissement (real upload now), Signature du
  directeur (new upload), Titre du bulletin (text input →
  `config.content.title`), Message de pied de page (textarea →
  `config.content.footerMessage`), Signatures (existing toggles — moved
  here since they're about *what appears*, not visual style), Colonnes du
  tableau (existing toggles — same reasoning).
- **Espacement**: Marge de page, Espacement entre les blocs, Épaisseur de
  bordure, Couleur de bordure — four new range/color inputs wired to
  `config.layout`.

`BulletinCanvas` reads `config.content.title` instead of the hardcoded
`"BULLETIN SCOLAIRE"` string, renders `config.content.footerMessage` in a
new (previously nonexistent) footer text line if set, and applies
`config.layout.*` to the canvas's outer padding, inter-block gaps, and
table/signature-box border width/color — replacing today's fixed
`mb-2.5`/`p-5`/hardcoded border values with values read from config.

### Logo & signature upload

New `ImageUploader`-style small component (or reuse an existing pattern if
one already exists in `components/ui/` — checked during implementation)
posts to `/api/upload`, then `PATCH`es the returned URL onto `School` via
the existing `PUT /api/school` route (its `UpdateSchoolBody` zod schema
gains `logoUrl`/`directorSignatureUrl`, both `nullable().optional()`,
matching every other field in that schema). `BulletinCanvas` renders the
real `<img>` when `logoUrl`/`directorSignatureUrl` is present, falling back
to today's dashed-placeholder box when absent — so schools that never
upload a logo see exactly what they see today, nothing breaks.

## Testing / verification plan

- Unit: the new self-contained print-token sign/verify module (round-trip,
  tampered payload rejected, expired token rejected) — same rigor as
  existing crypto-adjacent modules in this codebase.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm build && pnpm test`
  must stay green (tripwire covers the new route's `runtime = 'nodejs'`
  export automatically).
- Live E2E as Marie (established pattern this session): generate a real
  PDF for a real student with real grades, verify `Content-Type`/
  `Content-Disposition` headers and a non-trivial byte length, sanity-check
  the PDF isn't just the "lien invalide" error page. Upload a logo and a
  signature image, confirm they render in both the editor preview and a
  freshly generated PDF. Confirm Contenu/Espacement tab changes actually
  change what's visible (and previously-inert sections no longer show
  outside their own tab).
- **Known limitation to flag honestly**: headless Chromium may or may not
  be runnable inside this sandboxed dev environment (no guarantee a
  Chromium binary/shared libs are available here). If live PDF generation
  can't be exercised in this sandbox, that will be stated explicitly rather
  than claimed — code correctness and the surrounding logic will still be
  verified by unit tests + manual review, but "a PDF was actually observed
  coming out the other end" is a separate, stronger claim that depends on
  environment capability.

## Risks / operational notes

- `@sparticuz/chromium`'s compressed binary is large (tens of MB). Vercel's
  function size limits (250MB uncompressed) comfortably accommodate this in
  the common case, but it is worth the user spot-checking a real deploy
  once this ships, since sandbox testing here cannot fully substitute for
  a production Vercel build.
- Cold starts on the PDF route will be noticeably slower (multi-second)
  than the rest of the API — acceptable for an on-demand "download my
  bulletin" action, not something to route through more frequently (e.g.
  never call it from a list/loop without the batch design this pass
  explicitly defers).
