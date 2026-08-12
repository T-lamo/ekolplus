# Report Cards (liste) + Bulletin Viewer — Banani → Next.js

## Source
- `report-cards` (`IqXAVGK62iQ6`) → `/bulletins`
- `bulletin-viewer` (`fVG1xU5deplt`) → `/bulletins/[studentId]/[termId]`
- Fetched: 2026-08-12. Closes Epic 7 (bulletin-builder stays explicitly deferred).

## Key architecture decision: the Viewer renders the ACTIVE TEMPLATE, not Banani's own mockup
Banani's Bulletin Viewer mock uses a completely different visual design (purple
`#4a1b9a` header, Georgia serif body, 2-column grid) than the Bulletin Editor's
canvas (`#6c2bd9`, single-column, Inter). Pixel-matching the Viewer mock would
mean the "active template" a school picks/customizes has **zero effect** on
what actually prints — directly contradicting this session's explicit
requirement ("bulletin viewer doit afficher le modèle actif"). So: the Viewer
does NOT reproduce Banani's fixed mockup. It reuses the **same `BulletinCanvas`
component already built for the Editor**, fed with real computed data instead
of the Editor's illustrative sample — extracted to
`frontend/src/components/bulletin/BulletinCanvas.tsx` so both screens render
identically to what was configured (true WYSIWYG). Banani's Viewer chrome
(left action panel: student info/actions/prev-next nav, top toolbar:
zoom/print/export) IS kept — none of that is template-configurable.

**No active template set anywhere (fresh school)**: falls back to the oldest
global template (`schoolId: null`, `orderBy: createdAt asc`) rather than
blocking — matches the fallback direction discussed and left unobjected.

## No persisted `Bulletin` entity
OVERVIEW.md's decision #4 scopes this pass to HTML preview only, computed live
— consistent with every other Epic 6/7 screen (Notes Résultats, Appréciations,
Grade Notebook: none persist a "generated" artifact, all are live queries over
Grade/Evaluation/Appreciation). "Statut bulletin" = Généré when
`overallAverage != null` (student has ≥1 published, counted grade this term),
else En attente. "Envoyé aux parents" always reads Non envoyé — no messaging
system exists (same stub precedent as Appréciations' "Notifier le tuteur").

## New shared helper
`classGeneralAverages()` in `grades.ts` — computes every enrolled student's
weighted general average in one pass (`Map<studentId, number|null>`), used by
both new routes. This exact `subjectAverageFor`→`weightedAverage` composition
was already duplicated 3× (appreciations list/detail, notebook); a 4th and 5th
copy for the new routes crossed the "rule of three" line for extraction. The 3
existing call sites are left untouched (working, tested — not retrofitted
without being asked).

## API
- `GET /api/school/classes/[id]/bulletins?termId=` — report-cards list: every
  enrolled student's average/rank/générale-appreciation/status, class summary
  counts (total/generated/pending/classAverage/strugglingCount).
- `GET /api/school/students/[id]/bulletin?termId=` — viewer data model:
  student/class/term shell (+ prev/next studentId, same pattern as
  appreciations), school info (name/address/phone/email), resolved
  active-or-fallback template `{ id, name, config }`, per-subject rows
  (teacher, coefficient, average, **classAverage, min, max** — new: computed
  across every enrolled student's `subjectAverageFor` for that classSubject,
  nothing in the app computed subject-level min/max before), overall
  average/rank/classAverage, générale appreciation. Absences/retards: not
  modeled yet (Epic 8) — nulled, front end shows "—", consistent with every
  other screen.

## Frontend
- `/bulletins` — summary cards, classe/trimestre filters (same FilterSelect
  pattern as Appréciations/Notes Résultats), tabs: **Liste des bulletins**
  (real) and **Élèves en difficulté** (real client-side filter, average < 8 —
  cheap, same treatment as Appréciations' "En attente" tab) are built; **
  Statistiques de classe** and **Envois aux parents** are stubbed (toast) —
  no source markup / no messaging system respectively. Row kebab: **Voir le
  bulletin** (real, navigates to viewer) and **Modifier l'appréciation** (real,
  deep-links into the already-built saisie wizard) are real; **Générer le
  bulletin PDF**, **Envoyer aux parents**, **Télécharger** are stubs (PDF
  export deferred per decision #4, no messaging system); **Supprimer le
  bulletin** dropped entirely — nothing to delete, bulletins aren't persisted.
  Row checkboxes / bulk actions dropped (no wired bulk operation exists to
  attach them to). "Exporter tout" is REAL — CSV export via the existing
  `exportToCsv` helper, same pattern as Notes Résultats/Appréciations.
  "Générer les bulletins" primary button explains, rather than silently
  stubbing, that bulletins already generate live per student.
- `/bulletins/[studentId]/[termId]` — Viewer chrome from Banani (action
  panel: student card + actions + prev/next nav; toolbar: zoom/print/export)
  + `BulletinCanvas` rendering the resolved template with real data.
  **Imprimer is real** (`window.print()`, same precedent as Appréciations'
  "Imprimer l'appréciation"). **Télécharger/Exporter PDF stay stubs**
  (decision #4). **Envoyer aux parents / Modifier l'appréciation / Supprimer**
  — Modifier deep-links to the saisie wizard (real), the other two are stubs
  matching the list page.

## Implementation checklist
- [ ] `classGeneralAverages()` helper in `grades.ts`
- [ ] Extract `BulletinCanvas` (+ `BulletinRenderData` type) to
      `components/bulletin/BulletinCanvas.tsx`; Editor page consumes it with
      illustrative sample data (no visual regression)
- [ ] `GET /api/school/classes/[id]/bulletins`
- [ ] `GET /api/school/students/[id]/bulletin`
- [ ] `/bulletins` page
- [ ] `/bulletins/[studentId]/[termId]` page
- [ ] `pnpm format && lint && typecheck && build && test`
- [ ] Live E2E: list summary counts match hand-computed values; viewer shows
      the school's actual active template's colors/blocks/columns; fallback
      to a global template when none is active; prev/next nav; cross-check
      overallAverage/rank against `students/[id]/results` for the same
      student+term (already-proven-correct source of truth)
- [ ] STATUS.md update — closes Epic 7
