# Matières List — Banani → Next.js

## Source
- Banani screen ID: `0sucz8IfcpKT`
- Fetched: 2026-08-11

Data model: see [epic-4-data-model.md](./epic-4-data-model.md) (`Subject`, `ClassSubject`).

## Route
`/configuration/matieres` — `(school)` route group, reuses `SchoolSidebar`/`SchoolTopbar`
(nav link already present, was 404 until now). Auth-gated same as `/settings`
(plain `useUser()` in the group layout; page itself checks `resolveMySchool` via the API 404).

## Structure map
- Page header: title + subtitle (school name/year not shown per-Banani, static "Année scolaire {active.label}") + "Ajouter une matière" primary button. Drop "Exporter".
- Summary bar (4 cards): Total matières, Matières actives (has ≥1 ClassSubject), Non affectées (0 ClassSubject rows), Enseignants assignés (distinct teacherId count) — all computed server-side from the Subject+ClassSubject query, not hardcoded.
- Filters row: search (client-side substring on name/code) + domain filter (client-side, options derived from distinct `domain` values present) — no "Statut" dropdown (V1: no archived state, `isActive` toggle lives in edit form instead).
- Table: Matière (icon+name+code) / Domaine (badge) / Coefficient (dash if no ClassSubject rows, else... V1 shows "—" since coefficient is per-class, not per-subject — see Open questions) / Enseignant assigné (first assigned teacher name, or "Non assigné") / Classes (badges, from ClassSubject) / Statut (Active/Non affectée badge, derived) / row actions (pencil = edit modal, kebab = dropdown: Voir détails placeholder removed, Modifier, Supprimer).
- No pagination component needed at V1 data volumes — render full list (revisit if a school has 50+ subjects).

## Component breakdown
- **NEW** `src/app/(school)/configuration/matieres/page.tsx` — data fetch + table
- **NEW** `src/app/(school)/configuration/matieres/SubjectFormModal.tsx` — add/edit (name, code, domain)
- **REUSE** `Card`, `Field`, `Button`, `Select` primitives
- **NEW (shared across 3 of the 4 Epic 4 screens)** `src/components/ui/Modal.tsx` — first real consumer; simple centered overlay, `Escape`/backdrop close, no animation library

## Token mapping
Same Lavender SaaS tokens already in `@theme` (globals.css) — no new tokens needed. Table styles match the `.matieres-table` Banani CSS: `text-[11px] uppercase tracking-wide text-muted-foreground` headers, `text-[13px]` cells, `rounded-full px-2 py-0.5 text-[11px] font-semibold` badges (same pattern as `AnneeScolaireTab`'s status badges).

## Responsive plan
- **375px**: summary bar → `grid-cols-2 gap-2` (not 4-across); filters row wraps (`flex-wrap`); table wrapped in `overflow-x-auto` (horizontal scroll on narrow — acceptable for a dense admin table, matches Banani's own admin-density intent); header title/button stack (`flex-col` → `sm:flex-row`).
- **md (768px+)**: summary bar `grid-cols-4`; filters row single line.
- **lg (1280px+)**: matches Banani desktop table 1:1.

## Interactions / state
- Loading: skeleton-free simple "Chargement…" text (matches Settings tabs pattern already in the codebase).
- Empty: "Aucune matière — ajoute la première." + same primary button.
- Error: inline `role="alert"` text (matches `EtablissementTab` pattern).
- Delete: `window.confirm` equivalent — reuse a simple confirm dialog inline (no toast-only silent delete for a destructive action); blocks delete server-side if `ClassSubject` rows reference it (409 with a clear message) rather than cascading silently — surfaced as a toast error.

## Copy / i18n
All French, inline in JSX (matches existing Settings tabs — this project doesn't route through `constants.ts` for every table, only for shared blocks like login/create-school forms; per-page copy has stayed inline since `EtablissementTab.tsx`).

## Implementation checklist
- [x] Plan written
- [ ] `Modal` primitive
- [ ] `GET/POST /api/school/subjects`, `PATCH/DELETE /api/school/subjects/[id]`
- [ ] Page + form modal
- [ ] 375/768/1280 checks
- [ ] Empty/loading/error states
- [ ] Real end-to-end check (create, edit, delete a subject as Marie)

## Open questions for user
- Per-subject "Coefficient" column in the Matières table is ambiguous once
  coefficient becomes per-class (see data-model discovery) — **resolved by
  proceeding**: V1 shows "—" in that column (dash) since a subject has no
  single coefficient; the real per-class values live in the Coefficients
  screen. Flagged here rather than asked live, consistent with prior
  screens' "state assumption, document, proceed" pattern.
