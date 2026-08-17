# Emploi du temps + Ajouter un cours — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screens : `hmhXX_ZK0yoi` (« Emploi du Temps ») + `67UQB7XgiD48` (« Ajouter Cours », modale 560 px) — flow `2oB_n5kLBeuy` — fetchés 2026-08-17. Extraits bruts : scratchpad `tt-*.html`.
- Route : `/pedagogie/emploi-du-temps` (section Pédagogie de la sidebar, nouvel item « Emploi du temps », icône `calendar-days`). Nouveau domaine — aucun modèle existant.

## Structure map — Emploi du temps (`main-content` 20px 24px)
- **En-tête** : titre 20px/700 « Emploi du temps » + sous-titre 12px « Année scolaire 2024-2025 — Vue hebdomadaire » ; droite : `view-tabs` (bg-muted radius-md p 3, `view-tab` 12px/500 5px 12px, actif bg-card 600) Mois · Semaine · Jour · Agenda + `btn-primary` « + Ajouter un cours ».
- **Filter bar** (`bg-card border radius-lg` 10px 16px, mb 16) : `week-nav` (btn 28px bordés ‹ ›, libellé 13px/600 « 16 – 20 Juin 2025 », chip « Aujourd'hui » secondary/primary 12px 3px 10px radius-xl) · `filter-divider` 1×20 · 4 `filter-select` (12px, 5px 10px, icône + libellé + chevron) : Classe (`school`) · Enseignant (`user-check`) · Salle (`door-open`) · Matière (`book-open`) · à droite « ⤓ Exporter » (ghost bordé) → CSV réel.
- **Grille** (`timetable-grid` bg-card border radius-lg) : `timetable-head` `56px repeat(5,1fr)` (colonne horloge bg-muted, cellules 10px 8px centrées, `day-label` 13px/700 + `day-date` 11px muted ; **aujourd'hui** = bg-secondary, label primary) ; `timetable-body-row` `56px repeat(N,1fr)` min-h 72, `time-cell` 10px/600 muted bg-muted centré (padding-top 10) ; `day-cell` 5px 6px, `today-col` bg #faf8ff ; lignes **PAUSE / DÉJEUNER** (min-h 32, bg-muted, texte 11px/600 muted espacé) ; `course-card` radius-md 7px 9px m 2 (bande gauche 3px couleur, `course-card-type` 9px/700 uppercase pill CM/TD/TP/EXAM, titre 11px/700, meta 10px opacité .75 « Enseignant · Salle »).
- **Légende** (mt 14) : pastilles 10px radius 3 + libellé 11px muted par matière présente ; à droite pills CM · TD · TP · EXAM avec libellés.
- Lignes = heures de début distinctes des séances de la semaine (défaut 07:30 · 09:00 · 11:00 · 14:00 · 15:30 si vide) ; une ligne PAUSE / DÉJEUNER est insérée quand un trou ≥ 30 min sépare la fin de toutes les séances d'une ligne du début de la suivante (DÉJEUNER si le trou couvre 12:00–14:00) — dérivé des données, pas configuré. Colonnes Lun–Ven, + Sam si une séance tombe un samedi.
- Vues : **Semaine** (mock) · **Jour** (même grille, 1 colonne) · **Agenda** (liste par jour) · **Mois** (calendrier 7 col, jusqu'à 3 pastilles par jour + « +N », clic → Jour). Toutes alimentées par le même `GET`.

## Structure map — Modale « Nouveau cours » (560 px, header 20/24/16 titre 16px/700 + sous-titre 12px, close 28px bg-muted ; body 20/24 gap 16 scroll ; footer 14/24 border-t)
- Séparateurs `section-divider` (ligne + libellé 10px/700 uppercase ls .8) : **Cours** · **Intervenants & Lieu** · **Horaire** · **Récurrence** · **Options**.
- Cours : Matière * (`subject-selector` : pastille 12px carrée couleur + nom) · Couleur de la séance (`color-swatch` 20px radius 5, sélection outline 2.5px ; hint « Identifie rapidement la matière sur la grille ») · Type de séance * (`type-badge` 12px/600 5px 14px radius-xl bordure 1.5 : CM — Cours magistral / TD — Travaux dirigés / TP — Travaux pratiques / Examen ; actifs violet/vert/rouge/ambre).
- Intervenants & Lieu : Enseignant * (avatar 20) · Salle / Lieu * (`door-open`) — même ligne ; Classe * (`school`).
- Horaire : Date * (`calendar`) ; Heure de début * / Heure de fin * (`clock`, même ligne) ; bandeau `bg-secondary` « ⏱ Durée : 1h30 · Volume hebdomadaire : 3h/semaine » (durée réelle + somme des séances classe×matière de la semaine).
- Récurrence : `recurrence-block` (header bg-muted « Répétition du cours / Définir une récurrence hebdomadaire » + toggle 36×20) → body : `day-pill` 34px ronds L Ma Me J V Sa · « Fin de la récurrence * » (`calendar-x`, défaut = fin d'année scolaire, hint) · résumé bg-muted « ↻ Tous les lundis de 07:30 à 09:00 · jusqu'au 30 juin 2025 — 19 occurrences » (calculé).
- Options : Description (textarea min-h 56) · Lien de visioconférence (`video`, url).
- Footer : Annuler (secondary) · « ✓ Enregistrer la séance » (primary). En édition : + « Supprimer » (cette séance / toute la série).

## Données / modèle (migration 25 `timetable_session`)
```prisma
model TimetableSession {
  id String @id @default(cuid())
  schoolId String; academicYearId String; classId String; subjectId String; teacherId String?
  room String?; type String @default("CM")  // CM | TD | TP | EXAM
  color String?              // override, défaut = Subject.color
  date DateTime @db.Date; startMinutes Int; endMinutes Int
  description String?; meetingUrl String?
  seriesId String?           // récurrence : une ligne par occurrence, même seriesId
  @@index([schoolId, classId, date]) @@index([schoolId, teacherId, date]) @@index([seriesId])
}
```
- Récurrence **dépliée à la création** (une ligne par occurrence, `seriesId` commun) : requêtes triviales, suppression « cette séance » ou « toute la série ».
- API : `GET /api/school/timetable?from&to[&classId&teacherId&room&subjectId]` → `{ sessions[], rooms[] }` (matière {id,name,color}, enseignant, classe) ; `POST` `{classId, subjectId, teacherId?, room?, type, color?, date, startMinutes, endMinutes, description?, meetingUrl?, recurrence?: {days[1..6], until}}` → tx, **409 `TIMETABLE_CONFLICT`** si chevauchement (classe, enseignant ou salle) ; `PATCH /[id]` ; `DELETE /[id]?scope=one|series`. Lecture MEMBER, écriture ADMIN.

## Responsive
- 375 : en-tête empilé (view-tabs défilants), filter bar en colonne (selects pleine largeur, wrap), grille **défile horizontalement** dans sa carte (min 640 px), légende wrap ; modale plein écran (max-h 90vh, `form-row` empilée).
- lg : mock.

## Checklist
- [x] Modèle + migration + 4 routes + tests (POST expand récurrence, conflit 409, DELETE series) — `lib/server/timetable.ts` (règles pures) + `timetable-route-helpers.ts` (include / sérialisation / `findConflicts`) + `api/school/timetable/{route,[id]/route}.ts`, 18 tests
- [x] Sidebar : « Emploi du temps » (`CalendarDays`, après Présences)
- [x] Page `(school)/pedagogie/emploi-du-temps/page.tsx` + `components/school/timetable/*` (`TimetableGrid`, `CourseCard`, `TimetableAgenda`, `TimetableMonth`, `TimetableLegend`, `TimetableFilterSelect`, `SessionFormModal`, `timetable-utils` + 8 tests) ; `Modal` + `subtitle`/`medium`/`bodyClassName`/`footerClassName` ; `DateField` + `compact`/`icon`/`hint`/`minDate`/`maxDate`/`weekday`
- [x] 375 / 1280 / 1440 ; E2E création (POST 201 + 2 occurrences → colonne Samedi), édition série (PATCH scope=series), conflit 409 inline, suppression série (DELETE scope=series) — `scratchpad/e2e-tt.mjs`
- [x] format / lint / typecheck / test

## Notes d'implémentation
- La plage visible est mise en cache côté client par `from_to` (vidée après chaque mutation) : changer de vue ou revenir sur une semaine déjà vue est instantané, et la grille précédente reste affichée (opacité 60 %) pendant le chargement au lieu d'un squelette.
- La colonne « Samedi » n'apparaît que si une séance filtrée tombe un samedi ; le formulaire propose Sa dans les pastilles de récurrence.
- Volume hebdomadaire = séances chargées de la classe × matière dans la semaine ISO de la date (+ la séance en cours de saisie) — indicatif, pas la cible `ClassSubject.weeklyHours`.

## Écarts assumés vs mock
- Pauses dérivées des trous entre séances (pas de configuration des pauses).
- Palette de couleur de séance = `SUBJECT_COLORS` (cohérence avec l'identité des matières) — pastilles 20 px carrées comme le mock.
- Sélecteurs de salle = salles connues (classes + séances) + saisie libre.
