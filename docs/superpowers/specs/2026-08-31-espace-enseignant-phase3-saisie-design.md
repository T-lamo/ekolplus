# Espace Enseignant Phase 3 : élèves, saisie de notes et appréciations

Date : 2026-08-31. Statut : validé en discussion, en attente de relecture finale.
Précède : `2026-08-30-espace-enseignant-design.md` (Phase 1-2, lecture seule) et
`2026-08-31-espace-enseignant-redesign-design.md` (alignement du shell sur la charte admin, mergé `cc249ab`).

## Objectif

Rendre le portail enseignant complet et actif, dans la même logique et le même design que la partie école :

1. Un écran **Mes élèves** au look de `/eleves` (recherche, filtres, tableau paginé) listant tous les élèves auxquels l'enseignant enseigne, avec une **fiche allégée** par élève.
2. La **saisie de notes** : l'enseignant crée ses évaluations et saisit les notes pour ses matières, et uniquement les siennes.
3. La **saisie d'appréciations** : mention et texte pour ses matières, plus l'appréciation générale (comportement, investissement, assiduité) pour les classes dont il est titulaire.

La limite est appliquée côté serveur à chaque requête. L'interface masque, le serveur interdit.

## Décisions validées (2026-08-31)

| Question | Décision |
|---|---|
| Qui crée les évaluations ? | L'enseignant crée et publie ses propres évaluations pour ses matières (même formulaire que l'école). L'admin garde son plein accès via le Carnet de notes école. |
| Périmètre des appréciations | Ses matières, plus l'appréciation générale s'il est titulaire de la classe de l'élève. |
| Présences | Hors périmètre, phase dédiée plus tard. |
| Fiche élève | Allégée : identité, photo, matricule, classe, statut, puis notes et appréciations dans les matières de l'enseignant. Pas de contacts, pas de finances, pas de dossier complet. |
| Architecture serveur | **Approche A** : surface `/api/teacher/*` dédiée. Les routes `/api/school/*` ne changent pas d'un octet ; le verrou deny-by-default reste intact. |
| Découpage | Une seule spec, exécutée en trois plans livrables indépendamment (voir « Livraison »). |

## Navigation

`useTeacherSections()` passe à deux sections, comme le shell école :

- **Menu** : Accueil (`/espace-enseignant`), Mes classes (`/espace-enseignant/classes`), Mes élèves (`/espace-enseignant/eleves`, nouveau), Emploi du temps (`/espace-enseignant/emploi-du-temps`).
- **Pédagogie** : Carnet de notes (`/espace-enseignant/carnet-de-notes`, nouveau), Appréciations (`/espace-enseignant/appreciations`, nouveau).

Paramètres reste le dernier élément de la section Menu (et reste accessible via le profil de la sidebar, comme aujourd'hui). `TeacherMobileBottomNav` passe à : Accueil, Élèves, Notes, Emploi du temps, plus « Plus » (drawer : le reste). Breadcrumbs et CommandPalette suivent automatiquement via `useTeacherSections()`.

## Écrans

### Mes élèves (`/espace-enseignant/eleves`)

Réplique du look de `/eleves` école : barre de recherche, `FilterSelect` classe, `FilterSelect` matière, `FilterSelect` statut, tableau paginé (`TABLE_SCROLL`/`STICKY_THEAD`, `Pager` centré, `PAGE_SIZE = 20`). Colonnes : Élève (Avatar + prénom nom), Matricule, Classe, Statut (badge comme l'école). Les données arrivent en un seul GET (voir API) ; recherche et filtres sont côté client, comme sur `/eleves`. Le filtre matière s'appuie sur `classSubjects` de `/api/teacher/me` (matière → classes où je l'enseigne). Clic sur une ligne : fiche élève.

### Fiche élève allégée (`/espace-enseignant/eleves/[id]`)

En-tête : photo, prénom nom, matricule, classe et niveau, badge statut, badge « Titulaire » si applicable. Corps, pour le trimestre sélectionné (sélecteur de trimestre, défaut = trimestre courant) :

- une section par matière que j'enseigne à cet élève : tableau des évaluations (libellé, type, date, note /noteMax, coefficient, statut) et moyenne de la matière ;
- ses appréciations dans mes matières, et l'appréciation générale si je suis titulaire, avec lien direct vers la saisie.

Rien d'autre : pas de date de naissance, pas de contacts, pas d'onglet scolarité/finances.

### Carnet de notes enseignant (`/espace-enseignant/carnet-de-notes`)

Miroir du Carnet de notes école restreint à ses affectations :

- Barre d'outils : `FilterSelect` classe-matière (ses `classSubjects`), sélecteur de trimestre, bouton « Nouvelle évaluation ».
- Onglet **Par évaluation** : tableau de ses évaluations (libellé, type, date, coefficient, note max, notes saisies x/y, badge Brouillon/Publié), actions modifier/supprimer/publier.
- Onglet **Statistiques** : mêmes indicateurs que l'école (moyennes, répartition) limités à la classe-matière sélectionnée.
- Création/édition : même formulaire que l'école (libellé, type DS/INTERROGATION/EXAMEN/AUTRE, note max, coefficient, compte dans la moyenne, remarque interne, date, trimestre).
- Saisie (`/espace-enseignant/carnet-de-notes/[evaluationId]/saisie`) : grille un élève par ligne (Avatar + nom, champ note, case Absent, commentaire), enregistrement en bloc, même ergonomie que la page saisie école.
- Statut : `DRAFT | PUBLISHED`, sémantique inchangée (seul `PUBLISHED` compte pour moyennes et bulletins). L'enseignant publie lui-même ses évaluations, comme décidé.

### Appréciations enseignant (`/espace-enseignant/appreciations`)

Miroir du module école : liste de ses classes (cartes standard avec avancement de saisie), puis détail par élève (`/espace-enseignant/appreciations/[studentId]`) avec navigation précédent/suivant dans la classe, sélecteur de trimestre, et le formulaire de saisie :

- pour chacune de mes matières : mention (TRES_BIEN … FAIBLE) + texte ;
- si je suis titulaire de la classe : la ligne générale (mention, texte, comportement, investissement, assiduité), avec moyenne générale et rang comme sur l'écran école.

Les `<Select>` comportement/investissement/assiduité gardent leurs valeurs françaises persistées (même carve-out que le module école, documenté dans CLAUDE.md).

## API : surface `/api/teacher/*`

Toutes les routes suivent le modèle de `GET /api/teacher/me` : `export const runtime = 'nodejs'`, `withRequestContext`, `requireAuth`, `verifyCsrf` sur toute mutation, puis `resolveMySchoolIncludingTeacher(sub)` et `resolveMyTeacherProfile(sub, schoolId)` ; toute absence de profil ou de propriété répond **404 NOT_FOUND** (jamais 403, anti-fuite, même convention que le reste de l'app). Chaque route revérifie la propriété **en base** à chaque requête, jamais depuis le client.

### Enrichissement de `GET /api/teacher/me` (additif)

Ajoute au JSON existant :

```
terms: [{ id, label, order, type, gradeEntryEnabled, startDate, endDate }]  // trimestres de l'année active, ordonnés
currentTermId: string | null                                               // via resolveCurrentTerm()
```

### `GET /api/teacher/students`

Sans paramètre. Élèves inscrits (Enrollment de l'année active) dans les classes où j'ai un `ClassSubject` ou dont je suis titulaire, dédupliqués (un élève = une classe par année, unique `[studentId, academicYearId]`) :

```
{ students: [{ id, firstName, lastName, studentNumber, photoUrl, status, classId, className, classLevel }] }
```

### `GET /api/teacher/students/[id]?termId=`

404 si l'élève n'est pas inscrit dans une de mes classes pour l'année active. `termId` optionnel, défaut = trimestre courant.

```
{
  student: { id, firstName, lastName, studentNumber, photoUrl, status },
  class: { id, name, level },
  isMyHomeroom: boolean,
  term: { id, label },
  subjects: [{ classSubjectId, subjectId, subjectName,
               evaluations: [{ id, label, type, date, maxScore, coefficient, status, score, absent, comment }],
               average: number | null }],
  appreciations: [{ subjectId: string | null, mention, text, comportement, investissement, assiduite, status }]
}
```

`subjects` couvre uniquement mes `classSubjects` de la classe de l'élève ; `appreciations` contient mes matières et, si `isMyHomeroom`, la ligne générale. Moyennes via les helpers existants de `lib/server/grades` (`subjectAverageFor`), évaluations `PUBLISHED` et `DRAFT` visibles (c'est ma propre saisie), moyenne calculée comme côté école.

### `GET /api/teacher/evaluations?classSubjectId=&termId=` et `POST /api/teacher/evaluations`

Contrats identiques aux routes école (`GET /api/school/evaluations`, même forme de réponse `{ evaluations }` avec `_count.grades` ; `POST` avec le même corps zod `CreateEvaluationBody` : `classSubjectId`, `termId`, `label` 1-60, `type` enum, `maxScore` 1-1000, `coefficient` 1-10, `countsTowardAverage`, `notes` ≤ 500, `order`, `date`), avec pour seule différence l'autorisation : `classSubjectId` doit appartenir à `myTeacher.classSubjectIds` (sinon 404) et le `termId` doit appartenir à l'année académique de la classe (même contrôle que l'école).

### `PATCH /api/teacher/evaluations/[id]` et `DELETE /api/teacher/evaluations/[id]`

Mêmes corps et mêmes règles que la route école `[id]` (dont `status: DRAFT | PUBLISHED`), autorisation : `evaluation.classSubject.teacherId === myTeacher.teacherId` et école du même `schoolId` (sinon 404). Les règles de suppression école (comportement vis-à-vis des notes existantes) sont reprises à l'identique ; le plan les relèvera dans la route école et les dupliquera telles quelles.

### `PUT /api/teacher/evaluations/[id]/grades`

Même corps que l'école (`{ grades: [{ studentId, score: number|null, absent?, comment? }] }`, 1-200 entrées, score 0-1000) et mêmes contrôles : chaque `studentId` inscrit dans la classe de l'évaluation pour l'année du trimestre, refus `TERM_GRADE_ENTRY_DISABLED` quand `term.gradeEntryEnabled === false` (le verrou par trimestre de l'admin s'applique aussi aux enseignants), score ≤ `maxScore` si la route école l'impose. Autorisation : propriété de l'évaluation comme ci-dessus.

### `GET / PUT / DELETE /api/teacher/students/[id]/appreciations`

Miroir de la route école `students/[id]/appreciations` avec le périmètre enseignant :

- **GET `?termId=`** : la ligne générale et une ligne par matière, restreintes à mes matières dans la classe de l'élève ; moyennes par matière pour mes matières ; moyenne générale + rang uniquement si `isMyHomeroom` ; navigation précédent/suivant dans la classe (mêmes règles de tri que l'école).
- **PUT** : même corps (`{ termId, subjectId: string|null, mention?, text?, comportement?, investissement?, assiduite?, status? }`, `status: DRAFT|PUBLISHED`) avec la règle : `subjectId` non nul doit être une de mes matières dans la classe de l'élève ; `subjectId: null` (générale) accepté seulement si je suis titulaire de cette classe. Même find-then-branch que l'école (les NULL ne se dédupliquent pas dans l'index unique). `authorId` est renseigné avec mon `userId` à chaque écriture.
- **DELETE `?termId=&subjectId=`** : même périmètre que PUT.

## Garde-fous et invariants

- Le verrou existant ne bouge pas : `resolveMySchool()` reste deny-by-default, aucune route `/api/school/*` n'est modifiée, `resolveMySchoolIncludingTeacher()` n'est ajouté à aucune route école supplémentaire.
- Toute vérification d'appartenance se fait en base au moment de la requête (`ClassSubject.teacherId`, `Class.homeroomTeacherId`, Enrollment de l'année active). Un directeur-enseignant (ADMIN/OWNER aussi lié à un Teacher) passe par les mêmes règles sur `/api/teacher/*` : ces routes servent « mes affectations », son plein accès école reste sur `/api/school/*`.
- `Term.gradeEntryEnabled` est respecté sur toutes les écritures de notes (même code d'erreur stable que l'école).
- Les montants n'existent pas ici ; les scores restent des nombres bruts comme côté école (Float en base, bornés par zod).
- Codes d'erreur stables, le front bascule sur `ApiError.code` (`NOT_FOUND`, `VALIDATION_FAILED`, `TERM_GRADE_ENTRY_DISABLED`, …), jamais sur les messages.
- Chaque nouvelle route a son `route.test.ts` Vitest (prismaMock) couvrant au minimum : compte non enseignant → 404 ; ressource d'un autre enseignant (leurre) → 404 ; `subjectId` hors de mes matières → 404/VALIDATION ; générale sans titulariat → 404 ; `gradeEntryEnabled=false` → refus ; chemin nominal. Le test runtime-enforcement couvre automatiquement le `runtime = 'nodejs'`.

## Réutilisation UI et i18n

- Même principe que l'emploi du temps : les composants école purement présentation (tableaux, badges, `FilterSelect`, `Pager`, `Avatar`, modals génériques) sont réutilisés tels quels ; les composants école qui portent leurs propres fetches `/api/school/*` (formulaires du carnet de notes, écrans appréciations) donnent lieu à des variantes enseignant construites sur les mêmes primitives et les mêmes classes utilitaires (`LIST_PAGE`, `TABLE_SCROLL`, `STICKY_THEAD`, `CARD_GRID`). Le plan vérifie composant par composant ce qui est réellement data-driven avant de promettre une réutilisation.
- i18n : trois nouveaux namespaces, un par écran (`teacherStudents`, `teacherGradebook`, `teacherAppreciations`), FR/HT/EN dès la création (HT marqué `_review`). Les libellés déjà traduits et identiques sont réutilisés depuis les namespaces existants (`Eleves` pour statuts/mentions de table, `gradebook.evaluationType.*` et `gradebook.evaluationStatus.*`, `appreciations.mention.*`, `common`), même précédent que la réutilisation délibérée de `Timetable.toolbar` par le portail. `MESSAGE_NAMESPACES` passe de 32 à 35 ; registre (`locales.ts`, `i18n/request.ts`, `next-intl.d.ts`) et CLAUDE.md mis à jour, `locales.test.ts` garde la parité.
- Aucune chaîne visible avec tiret cadratin ; valeurs persistées (types d'évaluation, mentions, comportement/investissement/assiduité) inchangées, seuls les libellés sont traduits.

## Hors périmètre

Présences enseignant (phase dédiée), fiche élève complète, génération/export de bulletins, notifications, toute modification des routes `/api/school/*`, offline-queue pour la saisie enseignant (l'école l'a sur certains écrans ; on livre d'abord en ligne, l'offline pourra suivre le précédent `submitOrQueue` plus tard).

## Livraison : trois plans

1. **Plan 1, Mes élèves** : enrichissement `/api/teacher/me` (terms + currentTermId), `GET /api/teacher/students`, `GET /api/teacher/students/[id]`, écran Mes élèves, fiche allégée (sans les liens de saisie tant que les plans 2-3 ne sont pas livrés : les sections notes/appréciations y sont en lecture), navigation (sections sidebar + bottom nav), namespace `teacherStudents`.
2. **Plan 2, Carnet de notes** : routes evaluations + grades, écrans carnet (liste, formulaire, saisie, statistiques), namespace `teacherGradebook`, liens de saisie depuis la fiche élève.
3. **Plan 3, Appréciations** : route appreciations, écrans (classes, détail élève, saisie), namespace `teacherAppreciations`, liens depuis la fiche élève, mise à jour finale de CLAUDE.md (paragraphe Espace Enseignant + compte de namespaces).

Chaque plan se termine par le gate complet (`pnpm format && pnpm lint && pnpm typecheck && pnpm test`) et une vérification manuelle avec le compte seedé `carline.michel@lesetoiles.edu.ht`. Le point 375px en attente depuis la Phase 2 s'étend à ces nouveaux écrans avant toute promotion vers `main`.
