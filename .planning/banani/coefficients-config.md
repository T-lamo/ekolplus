# Coefficients Config — Banani → Next.js

## Source
- Banani screen ID: `1pYQiqgzPagc`
- Fetched: 2026-08-11

Data model: see [epic-4-data-model.md](./epic-4-data-model.md) — this screen
is a **per-class view + edit** of the `ClassSubject` pivot (coefficient only;
teacher/hours are edited from Affectations, not here — avoids the same field
being independently editable from two screens with no reconciliation).

## Route
`/configuration/coefficients?classId=` — classId optional, defaults to the
first class (by name) if omitted; the tab row switches it client-side via
`router.replace` (shallow, no page reload).

## Structure map
- Page header: title + subtitle. Actions: drop "Exporter" and "Copier vers
  une classe" (V1 cut, see data-model). Keep "Enregistrer les modifications"
  as a single batch-save button (V1: local edits held in component state,
  one PUT-per-row on save — simpler than a real batch endpoint at this
  volume, ~10-15 subjects per class).
- Summary bar (4 cards): Total coefficients configurés (school-wide, `coefficient
  IS NOT NULL` count), Somme des coefficients (selected class), Matières non
  configurées (selected class, `coefficient IS NULL`), Classes configurées
  (classes where every active Subject has a coefficient) / Total classes.
- Info banner: static explanatory text, kept verbatim (good UX, no reason to cut).
- Class tabs row: one tab per `Class`, ordered by name.
- Filters: search + Domaine dropdown, both client-side (same as Matières).
- Table: Matière / Domaine (badge) / Coefficient actuel (stepper: −/value/+,
  1-10 clamp) / Poids relatif (computed client-side: `coef / sum(coefs in
  class) * 100`, live-updates as the user edits) / Nb. évaluations (dropped —
  Epic 6) / Coefficient autres classes (badges, read-only, from a single
  school-wide `ClassSubject` fetch grouped by subject) / row action (dropdown:
  "Réinitialiser la valeur" only — drop "Appliquer à toutes les classes",
  "Copier vers...", "Voir l'historique").
- Footer row: total (sum) + "Matières configurées: X / Y" + Réinitialiser
  tout (clears local edits, not a server call) + Enregistrer.

## Component breakdown
- **NEW** `src/app/(school)/configuration/coefficients/page.tsx`
- **NEW** `src/app/(school)/configuration/coefficients/CoefficientStepper.tsx` — small `-`/value/`+` control, local `number` state, 1-10 clamp
- **REUSE** `Card`, `Tabs` (already built for Settings — same shape: array of `{key,label}`), `Button`

## Token mapping
Weight bar (`.coeff-weight-bar-*`) → `h-1.5 w-[50px] rounded-full bg-muted`
track + `bg-primary` fill at computed `%` width (inline `style={{width}}` for
the one genuinely dynamic value — not a Tailwind arbitrary class, since the
percentage is runtime-computed, matches the precedent set by
`AnneeScolaireTab`'s status badges using a lookup map rather than arbitrary
colors).

## Responsive plan
- **375px**: class tabs row scrolls horizontally (`overflow-x-auto`,
  `whitespace-nowrap`); summary `grid-cols-2`; table `overflow-x-auto`;
  footer row stacks (`flex-col gap-2` → `sm:flex-row`).
- **md/lg**: matches Banani desktop 1:1.

## Interactions / state
Stepper buttons disabled at 1 (min) and 10 (max, arbitrary sane ceiling — no
ceiling shown in Banani, chosen to prevent fat-fingered absurd values).
Unsaved-changes indicator: "Modifié" badge (already in Banani design) shown
per-row when local value differs from server value. Save button disabled
when no local edits pending.

## Copy / i18n
Inline French JSX.

## Implementation checklist
- [x] Plan written
- [ ] `GET /api/school/class-subjects?classId=` (also used by Affectations for the cross-class view)
- [ ] `POST /api/school/class-subjects` (upsert, coefficient-only body accepted)
- [ ] Page + stepper component
- [ ] 375/768/1280 checks
- [ ] Real end-to-end check (switch class tab, edit + save coefficients, reload to confirm persistence)

## Open questions for user
None.
