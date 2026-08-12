# Bulletin Templates (gallery) + Bulletin Editor (customize) — Banani → Next.js

## Source
- `bulletin-templates` (`cluqUYO18ujp`) → `/configuration/modele-bulletin`
- `bulletin-editor` (`FhIiyqa-Luo7`) → `/configuration/modele-bulletin/[id]/edit`
- Fetched: 2026-08-12
- NOT in scope this pass: `bulletin-builder` (`Xc7dKiq2Nw6n`, blank "Nouveau modèle" creation — user explicitly deferred "creating a new model"), `report-cards` (`/bulletins`), `bulletin-viewer` (`/bulletins/[studentId]/[termId]`) — not selected/fetched.

## Ownership model (confirmed with user prior turn)
Fork-on-write / copy-on-customize:
- `BulletinTemplate.schoolId` nullable — `null` = global/system template (seeded, shared library, "non modifiables directement" per the mock's own copy).
- Editing requires `schoolId === mySchool.schoolId`. A global template can only be **dupliquer**'d (forked) — creates an independent copy owned by the school; the original stays untouched for every other school.
- `forkedFromId` traces lineage ("basé sur X"); forks never re-sync with their source — permanently independent (per prior turn's decision).
- Only 3 global templates are seeded (matching the Banani mock's Académique Vert / Officiel Rouge / Moderne Orange). No per-school "Mes modèles" are pre-seeded — a school's personal list starts empty until they fork one, which is real product behavior, not fabricated demo ownership.

## Data model
```prisma
model BulletinTemplate {
  id           String            @id @default(cuid())
  schoolId     String?           // null = global/system
  school       School?           @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  name         String
  description  String?
  isActive     Boolean           @default(false) // this school's template used for generation; app-level "at most one active per school" invariant enforced in the route (same pattern as AcademicYear.isActive)
  forkedFromId String?
  forkedFrom   BulletinTemplate? @relation("TemplateFork", fields: [forkedFromId], references: [id], onDelete: SetNull)
  forks        BulletinTemplate[] @relation("TemplateFork")
  config       Json              // see BulletinTemplateConfig below
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  @@index([schoolId])
}
```

`config` shape (TS type, lives in `lib/server/bulletin-templates.ts` or similar, validated with zod on write):
```ts
type BlockId = 'header' | 'studentInfo' | 'stats' | 'notes' | 'absences' | 'appreciation' | 'signatures';
interface BulletinTemplateConfig {
  primaryColor: string; // hex — drives stripe/table header/stat accents
  pageFormat: 'LETTER' | 'A4';
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  blocks: { id: BlockId; visible: boolean }[]; // array order = render order for the 5 reorderable content blocks; header/footer are pinned (see scope cuts)
  columns: { coefficient: boolean; classAverage: boolean; minMax: boolean; appreciation: boolean; absences: boolean; rank: boolean };
  signatures: { director: boolean; homeroom: boolean; guardian: boolean };
  typography: { schoolName: number; title: number; tableBody: number }; // px
}
```

## API
- `GET /api/school/bulletin-templates` — `{ personal: TemplateRow[], global: TemplateRow[] }`. `TemplateRow`: id, name, description, isActive, forkedFromId, primaryColor, updatedAt.
- `GET /api/school/bulletin-templates/[id]` — full row incl. `config`, `isOwn: boolean` (schoolId === mySchool).
- `PATCH /api/school/bulletin-templates/[id]` — own templates only (404 otherwise, matching the org-role "don't leak existence" convention). Body: partial `{ name?, description?, config?, isActive? }`. Setting `isActive: true` flips any other active row for the school back to `false` in the same transaction.
- `DELETE /api/school/bulletin-templates/[id]` — own templates only. Refuses deleting the active template (must switch active elsewhere first).
- `POST /api/school/bulletin-templates/[id]/fork` — works on ANY visible template (global or another of your own, for symmetry even though the mock only shows "Dupliquer" on global cards). Creates `{ schoolId: mySchool, forkedFromId: id, name: "{source.name} (copie)", config: source.config }`, returns the new id for the frontend to redirect into `/edit`.

## Frontend
- `/configuration/modele-bulletin/page.tsx` — gallery. Tabs "Mes modèles" (real count) / "Modèles globaux" (real count). Active-template banner. Mini-bulletin preview card renders `config.primaryColor` against one hardcoded illustrative sample row-set (same numbers as the Banani mock — a template gallery previews *style*, not a real student, matching Banani's own approach). Own cards: "Éditer" + kebab (Dupliquer/Supprimer — Supprimer blocked on the active template). Global cards: "Dupliquer" only. "Nouveau modèle" / "Importer un modèle" → toast stub (out of scope this pass).
- `/configuration/modele-bulletin/[id]/edit/page.tsx` — 3-pane editor (left block list, center live canvas, right property panel), mirroring Banani closely:
  - Left: 5 reorderable content blocks (native HTML5 drag-and-drop, no new dependency) + visibility eye-toggle each. Header and the footer stripe are pinned (always first/last, not draggable) — see scope cuts.
  - Canvas: renders the same illustrative sample data live, reflecting every config change instantly (color, typography sizes, column visibility, block order/visibility, page format/orientation label).
  - Right: "Style" tab is real — color swatches + hex input (primaryColor), page format Letter/A4 + orientation toggles, typography size number inputs, table column switches, signature switches. "Contenu"/"Espacement" tabs → toast stub (Banani's fetch had no markup for them either, same treatment as Grade Notebook's stubbed Statistiques/Par évaluation tabs).
  - Toolbar: "Enregistrer" → PATCH. "Retour" → list. "Aperçu PDF"/"Exporter PDF" → toast stub (OVERVIEW.md decision log #4, 2026-08-11: HTML preview first, real PDF export is an explicitly deferred later pass). Undo/redo dropped (decoration without real history tracking).
  - Logo / signature upload boxes: visual, **not wired this pass** — same precedent already set twice in this codebase (Create School, School Settings' `EtablissementTab.tsx` line 78: "Not wired this pass — same as Create School"). Wiring real upload would mean adding `School.logoUrl` + touching 3 screens at once; out of scope for this pass.
  - Opening `/edit/[id]` on a **global** template (schoolId: null) → read-only canvas + a single "Dupliquer" CTA in place of the editor chrome, rather than silently allowing edits to the shared original.

## Translation / judgment calls (flagged, not blocking)
1. Banani's left block list shows 8 rows (incl. "Infos élève" and "Pied de page") but the canvas only renders 6 distinct block wrappers — no separate canvas element for "Infos élève" (folded into the header row) or "Pied de page" (just a decorative stripe). Kept "Infos élève" as its own visibility toggle (renders inside the same header row when on) since it's listed separately; footer stays a fixed, non-toggleable stripe.
2. Reordering is scoped to the 5 content blocks (stats/notes/absences/appreciation/signatures) — header always renders first, footer stripe always last. Matches what the canvas actually shows as physically fixed vs. free-floating.

## V1 scope cuts
1. `bulletin-builder` (blank template creation from scratch) — explicitly out of scope this pass per user instruction.
2. Font-family picker — dropped (Inter is the only font loaded app-wide). Font-**size** fields per element kept.
3. "Contenu" / "Espacement" property tabs — stubbed, no source markup.
4. PDF preview/export — stubbed; already decided in OVERVIEW.md (HTML-first, PDF deferred).
5. Undo/redo — dropped.
6. Logo/signature upload — visual only, consistent with 2 existing precedents in this codebase.
7. No per-school demo templates seeded — only the 3 global ones.

## Implementation checklist
- [ ] `BulletinTemplate` model + migration (hand-write if `migrate dev --create-only` hits the recurring Neon shadow-DB flake)
- [ ] Seed script: 3 global templates (Académique Vert / Officiel Rouge / Moderne Orange)
- [ ] API: list / get / patch / delete / fork
- [ ] `/configuration/modele-bulletin` gallery page
- [ ] `/configuration/modele-bulletin/[id]/edit` editor page
- [ ] `pnpm format && lint && typecheck && build && test`
- [ ] Live E2E: fork a global → edit → save → verify original untouched; set active → verify single-active invariant; attempt PATCH on a global id → verify rejected
- [ ] STATUS.md update
