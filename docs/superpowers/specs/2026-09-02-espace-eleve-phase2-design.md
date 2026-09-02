# Espace Élève — Phase 2 : le portail complet (shell charte admin + écrans lecture seule)

**Date :** 2026-09-02
**Statut :** Design présenté en chat et validé par Amos le 2026-09-02 (une seule décision ouverte, tranchée : la fixation d'objectifs par l'élève est laissée de côté ; les objectifs restent en affichage seul). Succède à `2026-08-30-espace-eleve-design.md` (Phase 1 « Fondation », livrée) et remplace sa section « UI / navigation » : le shell mobile léger prévu à l'époque est abandonné au profit de la même déclinaison de la charte admin que le portail enseignant (`2026-08-31-espace-enseignant-redesign-design.md`).

## Problème

La Phase 1 a livré la fondation (`Student.userId`, `resolveMyStudentProfile()`, `requireStudent()`, invitation depuis la fiche élève, `/definir-mot-de-passe-eleve`, `isStudentOnly` + `spaces.student` sur `/api/auth/me`, redirection login → `/eleve`) mais l'espace lui-même se résume à une page `/eleve` nue (« arrive bientôt »). Aucune route `/api/student/*` n'existe, aucun écran métier non plus.

Un élève connecté doit voir tout ce qui le concerne, et uniquement cela, en lecture seule : ses notes, ses présences, son emploi du temps, ses bulletins, ses appréciations, son profil, un tableau de bord qui lui est propre. Il ne peut modifier ni ses notes ni ses absences. Il ne voit jamais les données d'un autre élève. Le tout dans le design de l'application, exactement comme le portail enseignant.

## Décisions

1. **Shell** : troisième déclinaison de la charte admin, comme le redesign enseignant. `StudentSidebar` / `StudentTopbar` / `StudentMobileBottomNav` sous `components/layout/student/`, bâtis sur les briques partagées `components/layout/sidebar/*` et `topbar/*` (variant `light`, `SIDEBAR_WIDTH`, `useSidebarCollapse`, drawer mobile, `SidebarUserProfile` avec Paramètres + Déconnexion, `SpaceSwitcher` `currentSpace="student"`). Le layout `(eleve)/eleve/layout.tsx` actuel (en-tête minimal + bouton déconnexion) est remplacé. Pas de `SchoolPlanProvider` (son endpoint est deny-by-default pour un compte élève). Badge année scolaire alimenté par `/api/student/me` (`StudentAcademicYearBadge`, jumeau de `TeacherAcademicYearBadge`). `NotificationsMenu` reste (`/api/notifications` est scopé utilisateur).
2. **Lecture seule stricte.** Aucune route `/api/student/*` n'accepte `POST`/`PUT`/`PATCH`/`DELETE`. La fixation d'objectifs (`Goal`) par l'élève est hors périmètre ; les objectifs déjà fixés par l'école s'affichent.
3. **Isolation stricte.** L'identifiant de l'élève n'est jamais un paramètre d'URL ni de body : c'est toujours le `studentId` résolu depuis la session par `requireStudent()`. Aucune réponse ne contient de donnée nominative d'un autre élève : pas de classement nominatif (seuls le rang de l'élève et l'effectif classé sont renvoyés), pas de navigation précédent/suivant entre camarades, pas de projection des camarades dans le bulletin. Les agrégats de classe (moyenne de classe par matière, moyenne générale de classe) sont autorisés.
4. **Publié uniquement.** Un élève ne voit que les évaluations et appréciations en `status: 'PUBLISHED'`. Un brouillon (`DRAFT`) est invisible partout : colonnes d'évaluation, dernières notes du tableau de bord, appréciations, bulletin. Les moyennes suivent déjà cette règle côté serveur (`subjectAverageFor` ne compte que le publié) ; la liste des évaluations affichées doit la suivre aussi.
5. **Champs staff exclus.** `Student.notes` (observations internes) et `Evaluation.notes` ne sont jamais renvoyés.
6. **Logique de requête partagée, autorisation distincte.** Les lectures par élève des routes staff `/api/school/students/[id]/{results,attendance,appreciations,bulletins}` sont extraites dans `frontend/src/lib/server/student-views/` et réutilisées par les routes `/api/student/*`. Seule la couche d'autorisation diffère ; la fonction partagée reçoit une `audience: 'staff' | 'student'` qui applique les règles 3 à 5.
7. **Réutilisation des écrans.** Les quatre onglets de la fiche élève admin (`NotesResultatsTab`, `PresencesTab`, `AppreciationsTab`, `BulletinsTab`) et le viewer de bulletin sont réutilisés via des props additives, jamais dupliqués. Les vues d'emploi du temps admin sont réutilisées en lecture seule, comme dans le portail enseignant.
8. **Pas de nouveau namespace i18n** : le namespace `elevePortal` existant est étendu (fr/ht/en) ; les écrans réutilisés gardent leurs namespaces (`Eleves`, `Gradebook`, `Appreciations`, `Timetable`, `Settings`, `Common`). Le registre `MESSAGE_NAMESPACES` ne bouge pas.

## Navigation

Base `/eleve` (déjà câblée par le login, `/espaces` et le sélecteur « Mes espaces »).

| Entrée sidebar | Route | Section |
|---|---|---|
| Accueil | `/eleve` (exact-match dans `route-match.ts`, comme `/espace-enseignant`) | Principal |
| Mon profil | `/eleve/profil` | Principal |
| Mes notes | `/eleve/notes` | Scolarité |
| Mes présences | `/eleve/presences` | Scolarité |
| Emploi du temps | `/eleve/emploi-du-temps` | Scolarité |
| Bulletins | `/eleve/bulletins` (+ `/eleve/bulletins/[termId]`) | Scolarité |
| Appréciations | `/eleve/appreciations` | Scolarité |
| Paramètres | `/eleve/parametres` (aussi dans le menu du profil sidebar) | Compte |

Bottom-nav mobile (icônes seules, `aria-label`) : Accueil, Mes notes, Mes présences, Emploi du temps, Plus (ouvre le drawer). Le fil d'ariane du topbar couvre les retours (pas de lien « Retour » dans les pages).

## Surface API `/api/student/*`

Toutes les routes : `export const runtime = 'nodejs'`, `withRequestContext`, `requireStudent(req)` (404 `NOT_FOUND` pour tout compte non lié élève, sans fuite), `GET` uniquement.

| Route | Réponse | Partage avec |
|---|---|---|
| `GET /api/student/me` | `{ student: { id, studentNumber, firstName, lastName, photoUrl, dateOfBirth, placeOfBirth, gender, nationality, address, motherTongue, phone, email, status, enrolledAt, scholarship, guardians: [{ id, name, relationship, phone, email, isPrimary }] }, school: { id, name }, class: { id, name, level } \| null, homeroomTeacher: { id, name } \| null, academicYear: { id, label } \| null, terms: [{ id, label, order, type, startDate, endDate }], currentTermId, summary: { overallAverage, rank, rankedCount, attendanceRatePercent, absences }, thisWeekSessions: SerializedSession[], recentGrades: [{ evaluationId, label, subjectName, subjectIcon, subjectColor, date, score, maxScore, absent }] }` — `summary` = les 4 KPI du tableau de bord sur le trimestre courant (moyenne générale pondérée et rang via `classGeneralAverages`/`competitionRank` sur les évaluations `PUBLISHED`, taux et absences via `attendanceRate`/`absenceCount` sur les présences du trimestre), valeurs vides sans inscription ou sans trimestre courant. `recentGrades` = 5 dernières notes d'évaluations `PUBLISHED` de l'année active (évaluations datées d'abord, plus récentes en premier, puis les non datées par `updatedAt`). `thisWeekSessions` = séances de la classe courante, lundi → samedi de la semaine en cours, via `SESSION_INCLUDE` / `serializeSession` / `seriesCounts` de `timetable-route-helpers`. | `/api/school/students/[id]` (minus `notes`, `userId`, `userEmailVerifiedAt`), `/api/teacher/me` (forme des séances et des trimestres), `/api/school/students/[id]/bulletins` (calcul moyenne/rang) |
| `GET /api/student/results?academicYearId=&termId=` | Même forme que la route staff, avec `ranking: []` (règle 3) et évaluations `PUBLISHED` seulement (règle 4). `goals` conservé (lecture). | `getStudentResults()` |
| `GET /api/student/attendance?termId=` | Même forme que la route staff. | `getStudentAttendance()` |
| `GET /api/student/appreciations?termId=` | Même forme que la route staff, sans `prevStudentId`/`nextStudentId`, lignes `PUBLISHED` seulement. | `getStudentAppreciations()` |
| `GET /api/student/bulletins` | Même forme que la route staff (`{ terms: [{ termId, label, order, overallAverage, rank, rankedCount }] }`). | `getStudentBulletinSummaries()` |
| `GET /api/student/bulletin?termId=` | Vue `getStudentBulletinView(schoolId, studentId, termId)` existante, après vérification au plan que la vue ne contient aucune donnée nominative de camarade et n'expose que le publié ; sinon un paramètre `audience` y est ajouté de la même manière. | `lib/server/bulletin-pdf/get-bulletin-view.ts` |
| `GET /api/student/bulletin/pdf?termId=&disposition=` | Même pipeline que la route staff (`generateBulletinPdf`, `maxDuration = 60`, jeton d'impression court). | `lib/server/bulletin-pdf/generate.ts` |
| `GET /api/student/timetable?from=&to=` | `{ academicYear, sessions, rooms }` (forme `TimetableResponse`), séances de la classe de l'`Enrollment` de l'année active, mêmes bornes de plage (`MAX_RANGE_DAYS`) et même validation que la route école. `sessions: []` sans inscription courante. | `timetable-route-helpers` |

### Extraction `lib/server/student-views/`

- `results.ts` → `getStudentResults({ schoolId, studentId, academicYearId?, termId?, audience })`
- `attendance.ts` → `getStudentAttendance({ studentId, termId?, audience })`
- `appreciations.ts` → `getStudentAppreciations({ schoolId, studentId, termId?, audience })`
- `bulletins.ts` → `getStudentBulletinSummaries({ studentId })`

Chaque fonction reprend mot pour mot le corps de la route staff correspondante après sa couche d'autorisation. Les routes staff deviennent des wrappers (auth + params → appel, `audience: 'staff'`) et leur comportement ne change pas ; `audience: 'student'` applique les règles 3 à 5. Les tests existants des routes staff doivent rester verts sans modification de leurs attentes.

## Écrans

- **Accueil `/eleve`** : en-tête (titre + « Bienvenue, {prénom} » + classe · année), 4 `KpiCard` (moyenne générale, taux de présence, absences du trimestre, rang « Ne / N ») alimentées par le bloc `summary` de `/api/student/me` sur le trimestre courant ; « Cours d'aujourd'hui » ; « Cette semaine » (compteur par jour, lien vers l'emploi du temps) ; « Dernières notes » (`recentGrades`) ; raccourcis (Mes notes, Bulletins, Emploi du temps). Cartes compactes uniformes, tokens `@theme` seulement, aucune couleur par carte. Les entrées de navigation (sidebar, bottom-nav, raccourcis du tableau de bord) n'apparaissent qu'avec le plan qui livre l'écran visé, pour qu'aucun plan mergé seul ne laisse de lien mort : Plan A = Accueil, Mon profil, Paramètres ; Plan B ajoute Mes notes, Mes présences, Bulletins, Appréciations ; Plan C ajoute Emploi du temps.
- **Mes notes `/eleve/notes`** : `NotesResultatsTab` avec `apiBase="/api/student"` et `readOnly` (masque le bouton « Fixer un objectif » et le bloc de classement nominatif ; conserve le rang de l'élève, les moyennes, tendances, matières en alerte, objectifs affichés). La page charge `initial` depuis `/api/student/results` comme la fiche admin.
- **Mes présences `/eleve/presences`** : `PresencesTab` avec `apiBase`.
- **Appréciations `/eleve/appreciations`** : `AppreciationsTab` avec `apiBase` et `readOnly` (masque les liens « Saisir » / édition).
- **Bulletins `/eleve/bulletins`** : `BulletinsTab` avec `apiBase` et `viewerHrefBase="/eleve/bulletins"` (liens viewer et PDF repointés). **`/eleve/bulletins/[termId]`** : le contenu de `(school)/bulletins/[studentId]/[termId]/page.tsx` est extrait en composant partagé `BulletinViewer` (props : chemin de la vue, base des liens PDF, lien de retour, `readOnly`) ; la page admin et la page élève le rendent toutes deux. Boutons Imprimer / Télécharger PDF conservés.
- **Emploi du temps `/eleve/emploi-du-temps`** : clone de la page enseignant (vues mois/semaine/jour/agenda, légende, navigation de période, export CSV) sur `/api/student/timetable`, sans aucun appel `/api/school/*`. Une seule classe : la grille affiche matière + salle + enseignant plutôt que la classe.
- **Mon profil `/eleve/profil`** : carte identité (avatar 80, nom, `#matricule`, classe, titulaire, date de naissance + âge, statut) reprenant la présentation du héros de la fiche admin ; blocs Coordonnées (téléphone, email, adresse, nationalité, langue maternelle) et Tuteurs (nom, lien, téléphone, email, badge « principal »). Lecture seule, aucun bouton d'édition.
- **Paramètres `/eleve/parametres`** : Profil (`ProfilTab` avec `myRole={null}` : avatar, nom, mot de passe), Apparence, Langue — mêmes composants que le portail enseignant, tous sur `/api/auth/*`.

Les props ajoutées aux composants partagés sont strictement additives, avec des valeurs par défaut qui préservent le comportement admin (`apiBase` par défaut `/api/school/students/${studentId}`, `readOnly` par défaut `false`).

## i18n

Namespace `elevePortal` étendu (fr/ht/en, `ht` avec `_review`) : `roleLabel`, `title`, `welcome`, `logout`, `loadError`, `nav.*` (ariaLabel, sectionLabel, home, profile, schoolSectionLabel, grades, attendance, timetable, bulletins, appreciations, accountSectionLabel, settings, moreAriaLabel), `topbar.defaultPageTitle`, `home.*` (today, noCoursesToday, thisWeek, noSessions, viewTimetable, sessionsCount, recentGrades, noRecentGrades, quickActions, stats.*), `profile.*`, `timetable.title`, `pages.*` (titres/sous-titres des écrans Notes/Présences/Bulletins/Appréciations). La clé `comingSoon` disparaît. `locales.test.ts` garantit la parité des trois locales. Aucun tiret cadratin dans les chaînes visibles.

## Données de test

`scripts/seed-dev-school.ts` gagne un compte élève actif pour Les Étoiles : le premier élève (ordre `studentNumber`, stable car le PRNG du seed est déterministe) reçoit `Student.email = <prenom>.<nom>@eleves.lesetoiles.edu.ht`, un `User` (`role: 'USER'`, `passwordHash` de `StudentTest2026!`, `emailVerifiedAt` posé, aucun `OrganizationMember`) lié par `Student.userId`, via le même raccourci que le compte enseignant seedé (pas de code d'invitation). Contrairement au reste du dataset, cette étape tourne à chaque invocation du seed, avec ou sans `--reset`, de façon idempotente : le jeu de données dev existant (partagé avec testing.schoolgesti.com) gagne le compte sans être reconstruit. Le récapitulatif « Connexions » du seed et `CREDENTIALS.local.md` (non versionné) sont mis à jour.

## Tests

- Vitest, `test-utils/prisma-mock.ts`, une suite par route `/api/student/*` : 404 sans lien élève ; la requête Prisma est scopée sur le `studentId` de session (jamais un paramètre) ; `ranking` vide, `prev/next` absents, `notes` absent ; filtre `PUBLISHED` appliqué aux évaluations et appréciations ; `timetable` scopé sur le `classId` de l'inscription courante et vide sans inscription.
- Suites des fonctions `student-views/*` : la bascule `audience` (staff conserve le classement nominatif et les brouillons, student non).
- Les tests existants des routes staff restent verts après extraction.
- Tripwires automatiques : `runtime-enforcement.test.ts` (runtime nodejs), `locales.test.ts` (parité i18n). Le tripwire RBAC ne couvre que `/api/school/*`, hors sujet ici.
- Vérification manuelle Puppeteer, desktop + 375px, avec le compte élève seedé, sur un serveur port 3001 en worktree (le port 3000 sert le checkout principal) : login → `/eleve` → chaque écran → PDF → paramètres → déconnexion ; aucune erreur console, aucun bandeau d'erreur.

## Livraison

Trois plans, chacun mergeable seul sur `develop` :

1. **Plan A — Shell + `/api/student/me` + Accueil + Mon profil + Paramètres** : composants `layout/student/*`, nouveau layout `(eleve)`, route `/me` + tests, dashboard, profil, paramètres, i18n correspondante, seed du compte élève (nécessaire pour vérifier dès ce plan).
2. **Plan B — Notes, Présences, Appréciations, Bulletins** : extraction `student-views/*`, routes `/results` `/attendance` `/appreciations` `/bulletins` `/bulletin` `/bulletin/pdf` + tests, props additives sur les 4 onglets, extraction `BulletinViewer`, quatre pages + viewer.
3. **Plan C — Emploi du temps + finitions** : route `/timetable` + tests, page emploi du temps, E2E complet desktop + 375px, CLAUDE.md, mémoire de session.

## Hors périmètre

Fixation d'objectifs par l'élève (tranché le 2026-09-02), comptes parents distincts, messagerie, scolarité/finances, notifications push aux tuteurs, révocation automatique liée à `Student.status` (déjà exclue en Phase 1), modification par l'élève de ses données d'identité (l'école reste seule à éditer la fiche).

## Contraintes transverses

Tokens `@theme` uniquement ; cartes compactes uniformes ; `ASIDE_GRID` / `LIST_PAGE` / `CardGrid` de `lib/layout.ts` pour toute mise en page ; `pnpm format && lint && typecheck && test` verts avant chaque commit ; aucun fichier de la liste protégée de CLAUDE.md n'est touché (`require-student.ts` et `school.ts` ne le sont pas).
