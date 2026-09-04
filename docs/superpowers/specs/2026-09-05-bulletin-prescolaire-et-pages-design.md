# Bulletin préscolaire, matières qualitatives et modèles multi-pages — design

Date : 2026-09-05
Statut : validé en conversation section par section, en attente de relecture du document.

## 1. Contexte et objectif

Le document de référence est `bulletin_template/Bulletin prescolaire.docx` (école ECEMB,
section Kindergarten). C'est un **livret plié en deux** : deux pages Letter paysage
(15840 × 12240 twips, marges 0,5") composées chacune de deux demi-pages, en section Word à
deux colonnes.

- Page 1 gauche : grille COMPORTEMENT (13 traits × Toujours / Souvent / Parfois / Jamais),
  puis Développement physique (10 items × Excellent / Très bien / Bien / Assez bien).
- Page 1 droite : Développement intellectuel (16 items × la même échelle), « Appréciations »
  (lignes réglées), signatures « La jardinière » / « La direction ».
- Page 2 gauche : dos du livret, un texte libre (Deutéronome 6 : 5-6).
- Page 2 droite : couverture dans un cadre arrondi — nom de l'école encadré, adresse,
  téléphones, « Section Kindergarden », logo, « Bulletin du ____ trimestre », lignes
  Nom / Prénom / Classe / Code / Année Académique.

Aucune note chiffrée, aucune moyenne : chaque ligne reçoit **une coche** sur une échelle
qualitative à quatre niveaux. Le système actuel ne sait produire que des bulletins
numériques (moyennes /20, rang, moyenne de classe) sur une seule page.

L'objectif est triple :

1. stocker et saisir des évaluations qualitatives (comportement, développements) ;
2. donner à **tous** les modèles de bulletin des pages supplémentaires, une numérotation
   automatique et des textes éditables (verso, couverture), rendus côté serveur page par page
   et téléchargeables en PDF ;
3. livrer un modèle « Livret préscolaire » qui reproduit le document à l'identique.

## 2. Décisions prises

| Sujet | Décision | Pourquoi |
|---|---|---|
| Modélisation des domaines (Comportement, Développement physique, Développement intellectuel) | **Matières qualitatives** : une matière avec `evaluationMode = QUALITATIVE`, ses items en critères, son échelle sur la matière | Réutilise l'affectation aux classes, la propriété enseignant (`ClassSubject.teacherId`), le trimestre, la publication et les grants. Une seule configuration « Matières ». |
| Choix du modèle de bulletin | **Par niveau** (`GradeLevel.bulletinTemplateId`), avec le modèle par défaut de l'école en repli | Une école mixte préscolaire + primaire a besoin des deux modèles. |
| Pages des modèles | **Pages dans le `config`** (approche A) : `pages[]` de blocs typés, disposition pleine page ou deux demi-pages | Un seul moteur pour tous les modèles ; couvre « ajouter des pages » et « éditer le verso ». |
| Propriété des modèles | **Copie avant édition**, règle existante inchangée : un modèle global est en lecture seule, l'école le duplique (`POST …/fork`) avant de le modifier | La duplication copie tout le `config`, donc les pages. L'affectation par niveau peut viser un modèle global directement. |
| Ordre des pages du livret | **Ordre d'impression du Word** : page 1 = intérieur, page 2 = couvertures | Le PDF s'imprime recto-verso et se plie exactement comme l'original. |
| Saisie des coches | **Par élève** (grille critères × échelle, élève précédent / suivant) + tableau de complétion de la classe | Reproduit le geste papier ; la matrice classe entière n'est pas retenue en V1. |
| Appréciation du livret | Réutilise la ligne **générale** d'`Appreciation` (`subjectId = null`) | Aucune table en plus ; même auteur (titulaire), même publication. |
| Anciens `config` | Le renderer les **normalise à la lecture** (`blocks` → `pages`) ; le backfill n'est qu'un nettoyage | Aucune contrainte d'ordre entre déploiement et script. |
| Numéro de page | Interrupteur **par page**, désactivé par défaut | Les modèles migrés ne changent pas d'aspect ; le livret n'en a pas. |

## 3. Découpage en plans

Un seul spec, trois plans d'implémentation livrables un par un, dans cet ordre :

1. **Matières qualitatives** — §4, §5, §6, §7. Utile seul : les grilles sont saisies et
   visibles dans l'application avant même le livret.
2. **Moteur de pages** — §9, §10, §11, backfill `blocks → pages` (§13). Utile seul : un
   verso ou une page en plus sur les modèles actuels.
3. **Livret préscolaire et modèle par niveau** — §8, §12, seeds (§13). Dépend de 1 et 2.

## 4. Modèle de données — matières qualitatives

Ajouts au schéma Prisma (`frontend/prisma/schema.prisma`) :

```prisma
model Subject {
  // …champs existants…
  evaluationMode String   @default("NUMERIC") // NUMERIC | QUALITATIVE
  // Échelle ordonnée d'une matière qualitative, 2 à 6 libellés,
  // ex. ["Toujours","Souvent","Parfois","Jamais"]. Vide en mode NUMERIC.
  ratingScale    String[] @default([])
  criteria       SubjectCriterion[]
}

model SubjectCriterion {
  id        String   @id @default(cuid())
  subjectId String
  subject   Subject  @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  label     String
  order     Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ratings   CriteriaRating[]

  @@index([subjectId, order])
}

// Une feuille par matière-classe et par trimestre — miroir de Evaluation.
model CriteriaAssessment {
  id             String       @id @default(cuid())
  classSubjectId String
  classSubject   ClassSubject @relation(fields: [classSubjectId], references: [id], onDelete: Cascade)
  termId         String
  term           Term         @relation(fields: [termId], references: [id], onDelete: Cascade)
  status         String       @default("DRAFT") // DRAFT | PUBLISHED
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  ratings        CriteriaRating[]

  @@unique([classSubjectId, termId])
}

// Une coche par élève et par critère — miroir de Grade.
model CriteriaRating {
  id           String             @id @default(cuid())
  assessmentId String
  assessment   CriteriaAssessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  studentId    String
  student      Student            @relation(fields: [studentId], references: [id], onDelete: Cascade)
  criterionId  String
  criterion    SubjectCriterion   @relation(fields: [criterionId], references: [id], onDelete: Cascade)
  level        Int // index dans Subject.ratingScale
  updatedAt    DateTime           @updatedAt

  @@unique([assessmentId, studentId, criterionId])
  @@index([studentId])
}
```

Relations inverses à ajouter : `ClassSubject.criteriaAssessments`, `Term.criteriaAssessments`,
`Student.criteriaRatings`.

Règles :

- `evaluationMode` et `ratingScale` se définissent dans le formulaire matière
  (`frontend/src/components/school/subjects/SubjectForm.tsx`, lib
  `frontend/src/lib/server/subjects.ts`). En mode `QUALITATIVE`, `ratingScale` est obligatoire
  (2 à 6 libellés non vides, distincts après trim) et une section « Critères » apparaît :
  ajout, renommage, suppression, réordonnancement, libellé ≤ 80 caractères.
- Passer une matière de `NUMERIC` à `QUALITATIVE` est refusé (409 `SUBJECT_HAS_EVALUATIONS`)
  si une évaluation existe sur l'une de ses `ClassSubject` ; l'inverse est refusé
  (409 `SUBJECT_HAS_RATINGS`) si une coche existe.
- Renommer un niveau de l'échelle est libre (les coches stockent l'index). Retirer un niveau
  qui a au moins une coche renvoie 409 `SCALE_LEVEL_IN_USE`. Réordonner l'échelle réindexe
  les coches dans la même transaction.
- Supprimer un critère qui a des coches : 409 `CRITERION_IN_USE` (l'archivage d'un critère est
  hors périmètre, §15).
- Une matière qualitative ne peut pas recevoir d'évaluation : `POST /api/school/evaluations`
  et `POST /api/teacher/evaluations` renvoient 409 `SUBJECT_NOT_NUMERIC` ; le carnet de notes
  (école et enseignant) ne la liste pas dans les matières à évaluer.
- API critères : `GET/POST /api/school/subjects/[id]/criteria`,
  `PATCH/DELETE /api/school/subjects/[id]/criteria/[criterionId]`,
  `PUT /api/school/subjects/[id]/criteria/reorder`, tous derrière
  `requireSchoolPermission(userId, 'configuration', action)`.

## 5. Saisie des feuilles qualitatives

### 5.1 Routes

Côté enseignant (propriété = `ClassSubject.teacherId === teacher.id`, même helper que les
évaluations) :

- `GET /api/teacher/class-subjects/[id]/criteria-assessment?termId=` → la feuille du trimestre,
  ou une feuille vide virtuelle (`id: null`, `status: 'DRAFT'`, aucune coche) si elle n'existe
  pas encore — un `GET` n'écrit rien : `{ id, status, term, subject: { name, ratingScale,
  criteria[] }, students: [{ studentId, firstName, lastName, ratings: { [criterionId]: level } }] }`.
- `PUT /api/teacher/class-subjects/[id]/criteria-assessment` body
  `{ termId, status: 'DRAFT' | 'PUBLISHED', ratings: [{ studentId, criterionId, level | null }] }` —
  crée la feuille si besoin (upsert sur `[classSubjectId, termId]`), remplace les coches
  envoyées (`null` efface), valide `level` dans `[0, ratingScale.length)`,
  refuse 409 `GRADE_ENTRY_DISABLED` quand `Term.gradeEntryEnabled` est faux, comme
  `PUT /api/teacher/evaluations/[id]/grades`.

Côté école, mêmes contrats sous `/api/school/class-subjects/[id]/criteria-assessment`, derrière
`requireSchoolPermission(userId, 'notes', 'view' | 'edit')`. Toutes les routes exportent
`runtime = 'nodejs'`, `verifyCsrf` sur `PUT`.

### 5.2 Écrans

- Espace enseignant : `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes` liste
  déjà les matières-classes ; une matière qualitative y mène à
  `…/carnet-de-notes/[classSubjectId]/criteres` : sélecteur de trimestre, tableau de complétion
  (élève × « n/N critères cochés »), puis la **fiche élève** : grille critères × échelle en
  boutons radio (une coche par ligne, clic sur la coche active pour effacer), boutons élève
  précédent / suivant, « Enregistrer brouillon » et « Valider » (publie la feuille entière).
- Côté école : même écran sous
  `frontend/src/app/(school)/pedagogie/carnet-de-notes/[classSubjectId]/criteres`, gated
  `notes.edit` pour écrire, `notes.view` pour lire.
- Copie : clés ajoutées aux namespaces existants `gradebook` et `teacherGradebook`
  (groupe `criteria.*`), pas de nouveau namespace. Le verrou et les libellés d'échelle
  viennent des données, pas des messages.

## 6. Moyennes, rang, bulletin numérique

- `frontend/src/lib/server/grades.ts` : `classGeneralAverages`, `subjectAverageFor` et
  `competitionRank` ignorent les `ClassSubject` dont `subject.evaluationMode === 'QUALITATIVE'`.
- `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts` : `subjects[]` (lignes du tableau
  de notes) exclut ces matières ; une nouvelle clé `qualitativeSubjects[]` les porte (§10.2).
- Les drapeaux `Subject.includeInAverage` et `Subject.showOnBulletin`, écrits par le formulaire
  mais jamais lus, restent inchangés : leur branchement est un nettoyage séparé.

## 7. Portail élève

- `GET /api/student/criteria-assessments?termId=` → les feuilles **`PUBLISHED`** de la classe de
  l'élève pour le trimestre, réduites à ses propres coches (`requireStudent`, jamais de camarade).
- Page `frontend/src/app/(eleve)/eleve/notes` : sous le tableau des notes, une carte par matière
  qualitative avec la grille en lecture seule. Clés dans `elevePortal`.

## 8. Modèle de bulletin par niveau

```prisma
model Class {
  // …
  gradeLevelId String?
  gradeLevel   GradeLevel? @relation(fields: [gradeLevelId], references: [id], onDelete: SetNull)
}

model GradeLevel {
  // …
  bulletinTemplateId String?
  bulletinTemplate   BulletinTemplate? @relation(fields: [bulletinTemplateId], references: [id], onDelete: SetNull)
  classes            Class[]
}
```

- Le formulaire classe choisit déjà le niveau dans le catalogue par nom
  (`useClassFormData.ts`) ; il envoie désormais `gradeLevelId` en plus de `level`. `Class.level`
  reste le libellé affiché.
- `PATCH /api/school/grade-levels/[id]` accepte `bulletinTemplateId` (modèle de l'école ou global,
  sinon 404 `TEMPLATE_NOT_FOUND`). La page `frontend/src/app/(school)/configuration/niveaux`
  affiche un sélecteur « Modèle de bulletin » par niveau, valeur « Modèle par défaut de l'école »
  quand vide.
- Résolution dans `getStudentBulletinView` : `class.gradeLevel?.bulletinTemplate`
  → modèle `isActive` de l'école → plus ancien modèle global. Le libellé UI de `isActive`
  devient « Modèle par défaut » (galerie et bannière).
- `DELETE /api/school/bulletin-templates/[id]` refuse 409 `TEMPLATE_IN_USE` si un niveau de
  l'école le référence (même règle que le modèle actif).
- Backfill `backfill-class-grade-level.ts` : pour chaque classe sans `gradeLevelId`, rattache le
  `GradeLevel` de la même école dont `name === level` ; sinon laisse `null`.

## 9. Moteur de pages — forme du `config`

`frontend/src/lib/server/bulletin-templates.ts` :

```ts
config = {
  primaryColor, pageFormat, orientation,        // inchangés, communs à toutes les pages
  pages: Page[],                                // 1 à 6
  columns, signatures, typography, content, layout, // inchangés
}

Page = {
  id: string,                                   // unique dans le config
  layout: 'full' | 'halves',                    // halves = deux colonnes CSS égales
  showPageNumber: boolean,
  blocks: Block[],                              // au moins un
}

Block = {
  id: string,                                   // unique dans le config
  type: BlockType,
  visible: boolean,
  breakBefore?: 'column',                       // halves : démarre la colonne de droite
  // options propres au type, voir ci-dessous
}
```

`content` gagne `pageNumberFormat: string` (défaut `"{n} / {total}"`, ≤ 30 caractères).

### 9.1 Types de bloc

| `type` | Options | Rendu |
|---|---|---|
| `header`, `studentInfo`, `stats`, `notes`, `absences`, `appreciation`, `signatures` | inchangées (`columns`, `signatures`, `content`, `layout` globaux) ; `appreciation` gagne `style: 'box' \| 'lines'` et `lines: 3..12` ; `signatures` gagne `labels?: { director?, homeroom?, guardian? }` (≤ 40 caractères chacun) | Comme aujourd'hui. `lines` : le texte de l'appréciation générale posé sur N lignes réglées, lignes vides si absent. |
| `text` | `text` (≤ 2 000 caractères, paragraphes séparés par une ligne vide), `align: 'left' \| 'center' \| 'justify'`, `fontSize: 8..20`, `bold`, `italic` | Paragraphes. |
| `cover` | `sectionLabel` (≤ 60), `titlePattern` (≤ 60, `{term}` remplacé par le libellé du trimestre), `showLogo`, `framed`, `fields: ('lastName' \| 'firstName' \| 'className' \| 'studentNumber' \| 'academicYear')[]` | Nom de l'école encadré, adresse, téléphones (données `School`), libellé de section, logo, titre, lignes d'identité pré-remplies (ligne vide si la donnée manque). |
| `criteriaGrids` | `showScaleHeader` (défaut vrai) | Une grille par matière qualitative de la classe, dans l'ordre des `ClassSubject` : titre de la matière en majuscules grasses, tableau critères × échelle, « ✓ » dans la colonne cochée, cellules vides sans feuille publiée. `break-inside: avoid` par grille. |

Contraintes de validation (zod, refine) : identifiants de page et de bloc uniques ; chacun
des 7 blocs numériques au plus une fois par page ; `breakBefore` accepté uniquement sur une
page `halves` ; `pageFormat`/`orientation` restent globaux (toutes les pages ont le même papier).

### 9.2 Compatibilité des anciens `config`

`normalizeConfig(raw): BulletinTemplateConfig` (même module) : si `raw.pages` est absent,
`raw.blocks` devient `pages: [{ id: 'page-1', layout: 'full', showPageNumber: false, blocks:
blocks.map(b => ({ id: b.id, type: b.id, visible: b.visible })) }]` et `content.pageNumberFormat`
prend sa valeur par défaut. Appelé par `getStudentBulletinView`, la page d'impression, le
`GET` du modèle (éditeur) et la prévisualisation. `PATCH` valide le schéma complet, avec `pages`.

## 10. Rendu, PDF, viewer

### 10.1 Composants

- `frontend/src/components/bulletin/BulletinDocument.tsx` : `pages.map(page => <BulletinPage>)`.
  Une page est une feuille de taille fixe (`page-size.ts`), `layout: 'halves'` = `column-count: 2`
  avec un espace de colonne égal à `layout.blockSpacing × 2`. Numéro de page en pied de feuille,
  police `typography.footer`, centré.
- `frontend/src/components/bulletin/blocks/<type>.tsx` : un fichier par type, signature
  `render({ block, config, data })`. Le `blockContent` actuel de `BulletinCanvas.tsx` y est
  déplacé bloc par bloc ; `BulletinCanvas` devient un alias de compatibilité rendant
  `BulletinDocument`, supprimé quand plus aucun appelant ne l'utilise.
- L'astuce `display: table-header-group` sous `@media print` est supprimée : la pagination est
  explicite, une page est une feuille ; le débordement est signalé dans l'éditeur (§11).
- Sélection, glisser-déposer et `chrome` gardent leur contrat, étendus à
  `(pageId, blockId)`.

### 10.2 Données de rendu

`BulletinRenderData` gagne :

```ts
firstName: string; lastName: string;           // la couverture les sépare
schoolAddress: string | null; schoolPhone: string | null; schoolEmail: string | null;
termLabel: string; academicYearLabel: string;
qualitativeSubjects: {
  subjectName: string;
  ratingScale: string[];
  criteria: { label: string; level: number | null }[];
}[];
```

`getStudentBulletinView` ajoute la requête : `CriteriaAssessment` `PUBLISHED` des `ClassSubject`
de la classe pour le trimestre résolu, coches de l'élève, matières dans l'ordre des
`ClassSubject`, critères dans l'ordre `order`. Audience `student` : mêmes règles (publié
seulement, aucun camarade).

### 10.3 Impression et PDF

- `frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx` : contrat inchangé (token,
  `@page` global `size` + `margin: 0`), rend `<BulletinDocument>` ; chaque feuille porte
  `break-after: page` sauf la dernière.
- `frontend/src/lib/server/bulletin-pdf/generate.ts` : inchangé, Chromium pagine par le CSS.
  Le numéro de page est rendu dans la feuille, jamais via les en-têtes/pieds de Puppeteer : le
  PDF reste le 1:1 de l'écran.
- La prévisualisation PDF de l'éditeur (`TemplatePreviewTokenPayload`, config non sauvegardé)
  fonctionne sans changement ; les données d'exemple gagnent deux matières qualitatives
  (échelle à 4 niveaux, 5 critères chacune) pour que `criteriaGrids` ne prévisualise pas vide.

### 10.4 Viewer

`frontend/src/components/bulletin/BulletinViewer.tsx` empile les pages verticalement avec le
même facteur d'échelle (basé sur la largeur de page), un espace entre feuilles, plein écran et
impression inchangés. Le portail élève en hérite.

## 11. Éditeur

`frontend/src/app/(school)/configuration/modele-bulletin/[id]/edit/page.tsx` (1 168 lignes)
est découpé en :

- `PagesPanel` (colonne gauche) : liste des pages (ajouter, dupliquer, supprimer si plus d'une,
  réordonner), disposition et numéro de page de la page courante, puis la liste des blocs de
  cette page avec le glisser-déposer actuel généralisé à tous les blocs.
- `BlockPalette` : ajouter un bloc par type à la page courante (types numériques grisés s'ils
  sont déjà présents sur la page).
- `BlockProperties` (colonne droite) : panneau par type (`text`, `cover`, `criteriaGrids`,
  `appreciation`, `signatures`) ; les onglets style / contenu / espacement existants restent
  globaux.
- Le canvas affiche **une page à la fois**, onglets de pages au-dessus. Si la hauteur du contenu
  rendu dépasse la feuille (mesure `scrollHeight` côté client), l'onglet porte un avertissement
  ambre « Le contenu dépasse la page ». La sauvegarde reste possible.
- Lecture seule sur un modèle global : badge et « Dupliquer pour personnaliser », inchangés.
- Copie : namespace `Configuration.modeleBulletin` étendu (FR/HT/EN, `_review` sur HT). Le
  contenu imprimé (`« Matière »`, `« Signature du Directeur »`, titres des grilles…) reste en
  français : document officiel, carve-out documenté dans CLAUDE.md par le plan 2.

## 12. Le modèle « Livret préscolaire »

Modèle global (`schoolId: null`), nom « Livret préscolaire », `LETTER` / `LANDSCAPE`,
`primaryColor #1f2937`, bordures noires 1 px pleines, `typography.tableBody 11`,
`tableHeader 11`, `title 20`, `schoolName 24`, `footer 9`, `pageMargin 36`, `blockSpacing 14`,
`cellPaddingX 6`, `cellPaddingY 3`, `showTableBackgrounds false`.

```
pages: [
  { id: 'interieur', layout: 'halves', showPageNumber: false, blocks: [
      { id: 'grilles',       type: 'criteriaGrids', visible: true, showScaleHeader: true },
      { id: 'appreciations', type: 'appreciation',  visible: true, style: 'lines', lines: 6 },
      { id: 'signatures',    type: 'signatures',    visible: true,
        labels: { homeroom: 'La jardinière', director: 'La direction' } },
  ]},
  { id: 'couvertures', layout: 'halves', showPageNumber: false, blocks: [
      { id: 'verset', type: 'text', visible: true, align: 'justify', fontSize: 12,
        bold: false, italic: false,
        text: '“Tu aimeras l’Eternel, ton Dieu, de tout ton cœur, de toute ton âme et de toute ta force. […]”\n\nDeutéronome 6 : 5-6' },
      { id: 'couverture', type: 'cover', visible: true, breakBefore: 'column',
        sectionLabel: 'Section Kindergarten', titlePattern: 'Bulletin du {term}',
        showLogo: true, framed: true,
        fields: ['lastName', 'firstName', 'className', 'studentNumber', 'academicYear'] },
  ]},
]
signatures: { director: true, homeroom: true, guardian: false }
```

- Le verset du seed est le texte intégral du document (copié depuis le `.docx`, apostrophes
  typographiques conservées) ; « Section Kindergarten » corrige la coquille du Word
  (« Kindergarden »), l'école la remplace en dupliquant.
- Ordre des pages = ordre d'impression du Word. Sur page 1, Comportement et Développement
  physique remplissent la colonne gauche, Développement intellectuel déborde à droite parce
  qu'il n'entre pas dans le reste de la gauche (`break-inside: avoid`), suivi des appréciations
  et des signatures ; c'est le flux du document original.
- Pour éditer le verset, les libellés ou ajouter une page, l'école **duplique** le modèle.

## 13. Migration, backfill, seeds, déploiement

- Migration `frontend/prisma/migrations/38_bulletin_prescolaire_pages/migration.sql`, écrite à
  la main (jamais `migrate dev` / `db push` sur la base partagée) : colonnes `Subject`, tables
  `SubjectCriterion`, `CriteriaAssessment`, `CriteriaRating`, colonnes `Class.gradeLevelId` et
  `GradeLevel.bulletinTemplateId`, index et clés étrangères. Le plan qui la crée vérifie qu'aucune
  migration `38_*` n'est apparue entre-temps (deux `37_*` coexistent déjà) et renumérote sinon.
  Appliquée au merge : `prisma db execute` + `prisma migrate resolve --applied` + `prisma generate`.
- `frontend/scripts/backfill-bulletin-template-pages.ts` : `blocks → pages` pour chaque
  `BulletinTemplate` sans `pages`, idempotent, test comme les deux backfills précédents.
- `frontend/scripts/backfill-class-grade-level.ts` : §8, idempotent.
- `frontend/scripts/seed-bulletin-templates.ts` : ajoute « Livret préscolaire », upsert par nom.
- `frontend/scripts/seed-dev-school.ts` : niveau « Kindergarten » (ordre 0), classe « Kindergarten A »,
  matières « Comportement » (échelle Toujours / Souvent / Parfois / Jamais, 13 critères),
  « Développement physique » et « Développement intellectuel » (échelle Excellent / Très bien /
  Bien / Assez bien, 10 et 16 critères, libellés du document), 6 élèves, feuilles `PUBLISHED`
  au trimestre 1 avec des coches variées, titulaire affecté, modèle « Livret préscolaire » sur
  le niveau. `--reset` le recrée.
- Ordre au déploiement : migration, puis code, puis les deux backfills (l'ordre code / backfill
  est libre grâce à `normalizeConfig` et au `gradeLevelId` nullable).

## 14. Tests

Logique pure, style du dépôt (Vitest, pas de rendu de composants, pas de nouvelle
dépendance) :

- schéma zod des pages (unicité, blocs numériques une fois par page, `breakBefore` sur
  `halves` seulement), `normalizeConfig` sur un `config` ancien et sur un `config` déjà migré ;
- `grades.ts` : une classe avec une matière qualitative donne les mêmes moyennes et rangs
  qu'avant ;
- résolution du modèle : niveau → défaut école → global, et `TEMPLATE_IN_USE` ;
- validation des coches : `level` hors échelle refusé, `SCALE_LEVEL_IN_USE`, réindexation au
  réordonnancement, `SUBJECT_HAS_EVALUATIONS` / `SUBJECT_HAS_RATINGS` / `SUBJECT_NOT_NUMERIC` ;
- idempotence des deux backfills et des seeds (tests jumeaux des scripts existants) ;
- `getStudentBulletinView` : `qualitativeSubjects` publié seulement, ordre des matières et des
  critères, audience `student`.

Routes (`prismaMock`) : feuilles qualitatives enseignant et école (401, 403, 404 propriété,
`GRADE_ENTRY_DISABLED`), lecture portail élève, CRUD des critères,
`PATCH grade-levels/[id]` avec `bulletinTemplateId`. Les tripwires `runtime = 'nodejs'` et
RBAC-01 couvrent les nouvelles routes sans modification de leur liste blanche.

Vérification visuelle (tâche finale du plan 3) : seed de dev, PDF du livret pour un élève de
Kindergarten A, rendu en PNG et comparé côte à côte aux deux pages du Word
(`bulletin_template/Bulletin prescolaire.docx` → PDF → PNG), à 375 px et 1280 px pour le
viewer.

## 15. Hors périmètre

- Saisie matricielle classe entière des coches.
- Archivage d'un critère (masquer sans supprimer).
- Branchement des drapeaux `includeInAverage` / `showOnBulletin`.
- Export PDF par lot (classe entière), déjà différé par le design du 2026-08-13.
- Traduction du contenu imprimé.
- Blocs `image` libres, positionnement absolu, grilles à colonnes inégales : les pages restent
  des empilements verticaux, en une ou deux colonnes.

## 16. Références

- Document source : `bulletin_template/Bulletin prescolaire.docx`.
- Modèles : `.planning/banani/bulletin-templates.md`,
  `docs/superpowers/specs/2026-08-13-bulletin-pdf-and-editor-design.md`.
- Code : `frontend/src/lib/server/bulletin-templates.ts`,
  `frontend/src/components/bulletin/BulletinCanvas.tsx`,
  `frontend/src/lib/server/bulletin-pdf/{get-bulletin-view,generate,print-token}.ts`,
  `frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx`,
  `frontend/src/lib/server/grades.ts`, `frontend/src/lib/server/subjects.ts`,
  `frontend/src/app/api/school/grade-levels/[id]/route.ts`.
