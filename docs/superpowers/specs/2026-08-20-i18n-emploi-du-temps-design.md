# i18n — Emploi du temps (Timetable) — Design

## Problem

The Emploi du temps (timetable) module is the last untranslated screen under Pédagogie — Carnet de notes, Présences, and Appréciations are all now shipped to `develop`. The module is 100% hardcoded French: zero `useTranslations`/`next-intl` usage across its 11 files. It also carries the same class of locale-hardcode bug already fixed elsewhere (Carnet de notes' and Appréciations' `fmtDate()`, `DateField.tsx`'s calendar): `timetable-utils.ts` unconditionally imports date-fns's `fr` locale for every date/month display and unconditionally sorts with `.localeCompare(..., 'fr')`, regardless of the active app locale.

## Scope

11 files, ~2691 lines total:

| File | Lines | Notes |
|---|---|---|
| `frontend/src/app/(school)/pedagogie/emploi-du-temps/page.tsx` | 525 | class-list toolbar, filters, view switcher |
| `frontend/src/components/school/timetable/SessionFormModal.tsx` | 1045 | bulk of the string surface — steps, fields, recurrence, delete flow |
| `frontend/src/components/school/timetable/timetable-utils.ts` | 304 | pure helpers — date formatting, sorting, CSV rows, recurrence |
| `frontend/src/components/school/timetable/TimetableGrid.tsx` | 131 | week/day grid |
| `frontend/src/components/school/timetable/TimetableAgenda.tsx` | 118 | agenda view |
| `frontend/src/components/school/timetable/TimetableMonth.tsx` | 105 | month view |
| `frontend/src/components/school/timetable/TimetableFilterSelect.tsx` | 64 | no hardcoded text — out of scope for strings, untouched |
| `frontend/src/components/school/timetable/CourseCard.tsx` | 80 | no hardcoded text — out of scope for strings, untouched |
| `frontend/src/components/school/timetable/TimetableLegend.tsx` | 46 | subject/type legend |
| `frontend/src/components/school/timetable/types.ts` | 84 | types only, no strings |
| `frontend/src/components/school/timetable/timetable-utils.test.ts` | 189 | existing unit tests — updated for new signatures, no new suite needed |

## Decisions

**1. Namespace name: `timetable`.** Following the `gradebook`/`fees` precedent (English word when there's a clean one-word equivalent) rather than the `presences`/`enseignants`/`eleves`/`configuration` precedent (French word used only because no natural English equivalent exists). "Timetable" is unambiguous.

**2. Locale-hardcode fix.** `timetable-utils.ts` currently does:
```ts
import { fr } from 'date-fns/locale';
// ...format(fromDay(day), 'EEEE d MMMM yyyy', { locale: fr })
// ...a.class.name.localeCompare(b.class.name, 'fr')
```
Fix, mirroring the already-established convention in `DateField.tsx`'s `CALENDAR_LOCALE` (Haitian Creole shares French's calendar convention — a decided precedent, not new):
- New local `CALENDAR_LOCALE: Record<LocaleKey, Locale>` in `timetable-utils.ts` (`{ fr, ht: fr, en: enUS }`, imported from `date-fns/locale`) for every `format(...)` call.
- Collation reuses the **existing exported** `LOCALE_BCP47` map from `frontend/src/lib/locales.ts` (`fr`/`ht` → `'fr-FR'`, `en` → `'en-US'`) for every `.localeCompare(...)` call — no new collation map needed.
- Every affected function gains a required `locale: LocaleKey` parameter (see Architecture below for exact signatures). Callers (`page.tsx`, `TimetableGrid.tsx`, `TimetableAgenda.tsx`, `TimetableMonth.tsx`, `TimetableLegend.tsx`) get it from `useLocale()` (next-intl) and pass it through — same pattern `DateField.tsx` already uses.

**3. `WEEKDAY_HEADERS` fix.** `TimetableMonth.tsx` currently hardcodes `['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']` as a local const. Replace with a new exported `weekdayHeaders(locale: LocaleKey): string[]` in `timetable-utils.ts`. Verified empirically: date-fns's `'EEE'` token gives `'lun.'`/`'mar.'`/… for French (lowercase, trailing period) and `'Mon'`/`'Tue'`/… for English (already capitalized, no period) — neither matches the current style directly, but `cap(format(d, 'EEE', { locale: CALENDAR_LOCALE[locale] }).replace(/\.$/, ''))` produces `'Lun'`/`'Mar'`/… for French (exact match to today's hardcoded array) and `'Mon'`/`'Tue'`/… for English, reusing the `cap()` helper already defined in the file.

**4. Tutoiement → vouvoiement (6 spots, confirmed via the earlier survey):**
- `page.tsx`: "Configure d'abord une année scolaire…", "…clique sur un créneau…"
- `TimetableAgenda.tsx`: "Ajoute un cours ou change de semaine…"
- `page.tsx` (×2) + `SessionFormModal.tsx` (×2): "Erreur réseau. Réessaie."
- `SessionFormModal.tsx` `computeErrors()`: "Choisis…" (×5), "Indique…" (×1)

**5. CSV export.** Headers (`Date, Jour, Début, Fin, Classe, Matière, Type, Enseignant, Salle, Description`) get translated, consistent with the Appréciations precedent. The filename prefix (`emploi-du-temps-${from}_${to}.csv`) stays as-is — it's a technical slug, not document content, and changing it would break user expectations/muscle memory across locale switches for no comprehension benefit. `lib/csv-export.ts` itself (generic, reused by other modules) is untouched.

**6. Ambiguous string resolved.** `"Couleur de la matière — identifie rapidement le cours sur la grille"` (`SessionFormModal.tsx`) reads descriptively given the em-dash structure ("the subject color — identifies the course quickly"), not as a tu-imperative. Translated as descriptive/3rd-person in all 3 locales, not as a command.

**7. No persisted-value hazard.** Confirmed by direct inspection: `SessionType` (`'CM' | 'TD' | 'TP' | 'EXAM'`) and `RECURRENCE_DAYS[].value` (ISO weekday numbers 1–7) are the only persisted values in this module, and both are already language-neutral (codes/numbers, not translated strings) — no `MENTION_LABEL`-style `{value, key}` pairing needed anywhere in this migration. Only `TYPE_META.label` (display label) and `RECURRENCE_DAYS[].plural` (display label) get translated; `TYPE_META.short` and `RECURRENCE_DAYS[].value` stay untouched.

**8. Shared/already-migrated primitives untouched.** `Modal`, `DateField`, `FormStepsBar`, `WizardNav`, and `form-primitives.tsx` (`FormGroup`/`TextArea`/`TextInput`) are already migrated (`Common`/`Configuration.common` namespaces) and are only consumed here — this migration translates the *props* this module feeds them (labels, placeholders, `submitLabel`), not the primitives themselves.

## Namespace design

`timetable` namespace, key groups mirroring the per-component nesting already used by `appreciations`/`gradebook`:

- `timetable.toolbar.*` — view switcher (Mois/Semaine/Jour/Agenda + subtitles), nav arrows, "Aujourd'hui", filters (Classe/Enseignant/Salle/Matière labels + "Toutes les classes"/"Tous les enseignants"/etc.), "Ajouter un cours", "Exporter", empty states ("Aucune année scolaire active", "Configure d'abord…", "Aucune séance sur cette période…"), CSV export toast, academic-year prefix template
- `timetable.legend.*` — `TimetableLegend.tsx`
- `timetable.grid.*` — `TimetableGrid.tsx` aria-label template ("Ajouter un cours {day} à {time}")
- `timetable.agenda.*` — `TimetableAgenda.tsx`
- `timetable.month.*` — `TimetableMonth.tsx` ("Voir le {day}" aria template, "+N autres")
- `timetable.sessionForm.*` — the bulk (`SessionFormModal.tsx`), sub-nested:
  - `.steps.*` (Cours / Intervenant & horaire / Options)
  - `.errors.*` (9 validation messages)
  - `.toasts.*` (network error, update/create/delete confirmations)
  - `.title.*` (Modifier la séance / Nouveau cours / subtitle)
  - `.delete.*` (Supprimer, scope choice, Annuler)
  - `.sections.*` (Cours, Intervenants & Lieu, Horaire, Récurrence, Série, Options headers)
  - `.fields.*` (all field labels/placeholders, `submitLabel`)
  - `.recurrence.*` (toggle labels, days-of-week picker, hint, summary line fragments)
  - `.series.*` (edit-mode "apply to whole series" toggle + explanatory line)
  - `.color.*` (color picker labels, descriptive line from Decision 6)
  - `.conflict.*` (conflict/error alert titles)
  - `.rooms.*` (empty-catalogue state, link to Configuration/Salles, capacity/inactive decorations)
- `timetable.export.*` — CSV header row (10 columns)

## Architecture

Purely a display-layer migration — no API/schema changes. `timetable-utils.ts`'s pure functions gain a `locale: LocaleKey` parameter and lose their hardcoded `fr`:

```ts
formatLong(day: string, locale: LocaleKey): string
formatDayName(day: string, locale: LocaleKey): string
formatDayShort(day: string, locale: LocaleKey): string
formatMonthYear(day: string, locale: LocaleKey): string
formatWeekRange(days: string[], locale: LocaleKey): string
weekdayHeaders(locale: LocaleKey): string[]  // new — cap(format(d, 'EEE', { locale: CALENDAR_LOCALE[locale] }).replace(/\.$/, '')) for Mon..Sun
buildRows(sessions: TimetableSession[], days: string[], locale: LocaleKey): GridRow[]
sessionsOn(sessions: TimetableSession[], day: string, locale: LocaleKey): TimetableSession[]
legendSubjects(sessions: TimetableSession[], locale: LocaleKey): { id: string; name: string; color: string }[]
```

Call sites needing `useLocale()` added and threaded through: `page.tsx` (formatLong, formatMonthYear, formatWeekRange), `TimetableGrid.tsx` (buildRows, formatDayName, formatDayShort, formatLong), `TimetableAgenda.tsx` (formatDayShort, formatDayName, sessionsOn), `TimetableMonth.tsx` (sessionsOn, weekdayHeaders), `TimetableLegend.tsx` (legendSubjects). All of these components (except the two with no hardcoded text — `CourseCard.tsx`, `TimetableFilterSelect.tsx`) also add `useTranslations('Timetable')` (or the appropriate sub-namespace) for their own strings.

`timetable-utils.test.ts` calls `formatWeekRange`, `formatLong`, `formatDayShort`, `buildRows`, `legendSubjects` without a locale argument today — these call sites get an explicit `'fr'` argument added (tests assert French output, which is what they already do; no behavior change, just an explicit parameter).

## Cross-dependency fences

- `OFFLINE_SYNC` — confirmed absent from this module entirely (no offline-queue mechanism exists here). Nothing to fence.
- `frontend/src/lib/csv-export.ts` — generic, language-agnostic utility shared with other Epic 4 tables. Untouched.
- `RoomRow` (`lib/rooms.ts`) — type only, no strings, untouched.
- `subjectAccentColor`/`SUBJECT_COLORS` (`lib/subject-visuals.ts`) — no strings, untouched.
- `FormGroup`/`TextArea`/`TextInput` (`components/school/subjects/form-primitives.tsx`) — already migrated (`Configuration.common`), consumed not modified.
- `FormStepsBar`/`WizardNav` — already migrated (`Common`), consumed not modified; this module's own comment already documents them as shared with the teacher/student wizards.
- `configuration.json`'s existing timetable-adjacent prose (3 mentions in the Salles page copy) — untouched, belongs to the `configuration` namespace, not `timetable`.

## Testing plan

- `pnpm test` — `locales.test.ts` enforces key-parity across fr/ht/en for the new `timetable` namespace; `timetable-utils.test.ts` updated for the new `locale` parameters (asserting the same French output as today, now passed explicitly).
- `pnpm typecheck && pnpm lint && pnpm format:check` — full gate before merge, per repo convention.
- Manual browser verification (locale switch + view-switch + session-form open) at implementation-review time, done judiciously given the app's own per-email login rate limit (10/15m) observed to trip during prior sub-projects' iterative Puppeteer script debugging.

## Rollout notes

Once this ships, **all of Pédagogie is migrated** (Carnet de notes, Présences, Appréciations, Emploi du temps) — this is the first time that's true. The final task updates `CLAUDE.md`'s Internationalisation paragraph: namespace count 24 → 25, adds the Emploi du temps paragraph (mirroring the Appréciations/Carnet de notes clauses — locale-hardcode fix, CSV translation, no persisted-value hazard), and **removes** the "Every other screen (the rest of Pédagogie — Emploi du temps —…)" parenthetical's Pédagogie mention entirely, since there will be no more "rest of Pédagogie" to name — only "the rest of `/admin/*` beyond the dashboard" remains in that sentence at merge time (subject to whatever else has shipped by then; the final task must re-read the live file, per the established defensive pattern from prior sub-projects' Task 7 briefs).
