# Carnets scolaires annuels (3e cycle et secondaire, primaire) — design

Date : 2026-09-06. Statut : validé en discussion, à implémenter.
Prolonge `2026-09-05-bulletin-prescolaire-et-pages-design.md` (moteur de pages,
blocs, modèle par niveau, livret préscolaire).

## 1. Contexte et objectif

Une école cliente utilise deux carnets scolaires **annuels** fournis dans
`bulletin_template/` :

- `Carnet scolaire 3e cycle et secondaire 2025-2026.docx` (2 pages Letter paysage)
- `Carnet scolaire complet primaire 2025 - 2026 (1).docx` (2 pages utiles, la 3e est vide)

Contrairement au bulletin d'un trimestre, un carnet annuel imprime **toutes les
périodes de l'année** sur une seule grille (colonnes « 1er contrôle » à
« 4ème contrôle », Notes et Sur par période), plus une table « Décisions » qui
récapitule la moyenne de chaque période et la moyenne générale de l'année. Le
même document est réimprimé à chaque période, les colonnes des périodes non
notées restent vides.

Objectif : deux modèles globaux « Carnet scolaire (3e cycle et secondaire) » et
« Carnet scolaire (primaire) » reproduisant fidèlement les deux Word, rendus par
le moteur de pages existant, imprimables en PDF, visibles dans le viewer et le
portail élève, assignables par niveau (spec précédente §8).

Les deux pages, telles que rendues depuis le Word (référence de fidélité,
images dans le scratchpad de la session `carnets/`) :

- **Page 1**, deux colonnes. Gauche : titre « Décisions » souligné, table
  `Contrôle | Moyenne | Coefficient` avec lignes I, II, III, IV, Moyenne
  Générale ; « Observations : » avec la liste « L'élève est : Promu (e) /
  Maintenu (e) / Orienté (e) ailleurs » ; « Extrait des règlements » avec 4
  points numérotés ; « La direction » en bas à droite de la colonne. Droite :
  grand cadre aux coins très arrondis contenant le nom de l'école dans un
  rectangle, l'adresse en italique, les téléphones, le libellé de section
  (« 3ème Cycle & Secondaire » ou « Section primaire »), « Carnet scolaire »,
  le logo, puis les lignes « Elève : », « Classe : », « NISU : »,
  « Année Scolaire : ».
- **Page 2**. Ligne « Nom (s) et Prénom (s) ____ Classe ____ Année Scolaire ____ »
  en haut ; grille quadrillée `Matières | 1er contrôle (Notes, Sur) | 2ème
  contrôle (Notes, Sur) | 3ème contrôle | 4ème contrôle` suivie des lignes
  `Total`, `Moyenne`, `Place` ; à droite un encadré « Signatures » avec, pour
  chaque contrôle, une ligne « Direction » puis une ligne « Les Parents ».
  Le carnet primaire regroupe les matières sous des intitulés en gras
  (Communication Française > Grammaire et conjugaison, Orthographe et
  vocabulaire, Lecture, Ecriture, Communication Orale ; Mathématiques >
  Numération, Opérations et Calcul mental, Problème et proportionnalité,
  Géométrie et mesure ; Sciences Sociales > Histoire d'Haïti, Géographie,
  Education Civique ; Sciences Expérimentales > Hygiène, Chant, Poésie, Dessin,
  Musique, Agriculture, Sport ; puis Communication Créole et Education
  Chrétienne à plat).

## 2. Décisions prises

1. **Une colonne par période de l'année scolaire**, dans l'ordre des périodes,
   en-tête = libellé de la période. Une école à 4 contrôles nomme ses périodes
   « 1er contrôle » … « 4ème contrôle » et obtient exactement le Word ; une
   école à 3 trimestres obtient 3 colonnes.
2. **Calcul des points, propre à ce format** (le reste de l'application garde
   ses moyennes sur 20) :
   - `Sur` d'une matière = `Subject.maxScore × coefficient` (coefficient de la
     matière dans la classe, `ClassSubject.coefficient`, 1 si non renseigné).
     Exemple : note maximale 10, coefficient 4 → Sur = 40.
   - `Notes` d'une matière = moyenne sur 20 de la matière pour la période
     (`subjectAverageFor`, évaluations publiées et comptées) ÷ 20 × Sur, arrondie
     au dixième. Cellule vide quand la matière n'a aucune note.
   - `Total` = somme des Notes et somme des Sur sur **toutes** les matières
     numériques de la classe. Le Sur total est le même pour tous les élèves et
     pour toute l'année ; une matière pas encore notée apporte 0 point.
   - `Moyenne` de la période = Total Notes ÷ Total Sur × 10, arrondie au dixième.
   - `Place` = rang de classe sur cette moyenne, rang de compétition
     (`competitionRank`, ex aequo partagés), parmi les élèves inscrits de la
     classe ayant une moyenne pour la période.
   - Une période sans aucune note publiée dans la classe reste entièrement vide
     (Notes, Total, Moyenne, Place).
3. **Table Décisions** : une ligne par période (numérotée en chiffres romains
   I, II, III…) avec `Moyenne` (celle du point 2) et `Coefficient` = somme des
   coefficients des matières numériques de la classe (informatif, identique pour
   toutes les périodes tant que la classe ne change pas de matières). Ligne
   `Moyenne Générale` : Moyenne = somme des moyennes des périodes déjà notées
   (sur 40 avec 4 contrôles, ce que vise le « 24/40 » du règlement),
   Coefficient = somme des coefficients de ces périodes.
4. **Groupes de matières** (carnet primaire) : depuis le champ `Subject.domain`.
   Une ligne en gras par domaine, à sa première apparition dans l'ordre des
   matières de la classe (`ClassSubject.createdAt`), suivie de ses matières.
   Les matières sans domaine restent à plat. Le carnet secondaire n'active pas
   les groupes.
5. **Observations** (Promu, Maintenu, Orienté ailleurs) et **Extrait des
   règlements** sont imprimés tels quels, comme texte modifiable par l'école ;
   aucune décision n'est calculée ni cochée par l'application.
6. Nom, adresse, téléphones et logo de l'école viennent des données de l'école
   (`School.name/address/phone/logoUrl`), jamais du modèle.
7. Un seul point d'entrée : `getStudentBulletinView` reste la source du viewer,
   du PDF, de la page d'impression et du portail élève. Les données annuelles
   sont calculées **uniquement** quand le modèle résolu contient un bloc annuel.
8. Un seul écart accepté avec le Word : sur la page 2, la ligne « Nom (s) et
   Prénom (s) … » s'arrête au bord de la colonne principale au lieu de courir
   au-dessus de l'encadré Signatures.

## 3. Données annuelles

### 3.1 Forme

Nouveau champ optionnel sur `StudentBulletinView` et `BulletinRenderData` :

```ts
export interface YearTermData {
  termId: string;
  label: string;          // libellé de la période
  order: number;
  hasGrades: boolean;     // au moins une note publiée dans la classe pour cette période
  subjects: {
    subjectName: string;
    domain: string | null;
    points: number | null; // Notes, null = pas de note pour cet élève
    maxPoints: number;     // Sur = maxScore × coefficient
  }[];
  totalPoints: number | null;   // null quand hasGrades = false
  totalMax: number;             // somme des maxPoints (toujours renseignée)
  average10: number | null;     // Total ÷ Sur × 10, arrondi au dixième
  rank: number | null;
  rankedCount: number;
  coefficientSum: number;       // somme des coefficients des matières numériques
}

export interface YearData {
  terms: YearTermData[];        // toutes les périodes de l'année, ordre croissant
  generalAverage: number | null; // somme des average10 des périodes notées, null si aucune
  generalCoefficient: number;    // somme des coefficientSum des périodes notées
}

// StudentBulletinView et BulletinRenderData
year?: YearData;
```

`subjects` de chaque période contient les mêmes matières dans le même ordre
(celui de `ClassSubject.createdAt`, filtre `NUMERIC_SUBJECT_FILTER`) ; les
matières qualitatives n'apparaissent pas.

### 3.2 Calcul

Fonction pure `buildYearData(input)` dans
`frontend/src/lib/server/bulletin-pdf/year-data.ts`, testée sans base :

```ts
buildYearData({
  terms: { id, label, order }[],
  classSubjects: { id, subjectName, domain, maxScore, coefficient: number | null }[],
  evaluationsByTerm: Map<termId, EvaluationLike[]>, // même forme que grades.ts
  studentId: string,
  classmateIds: string[],
}): YearData
```

Elle réutilise `subjectAverageFor`, `roundToTenth` et `competitionRank` de
`lib/server/grades.ts`. Le rang d'une période se calcule sur les `average10` de
tous les camarades (même formule), trié décroissant.

Dans `getStudentBulletinView`, après la résolution du modèle : si
`templateNeedsYear(config)` (au moins un bloc `yearGrid`, `yearDecisions` ou
`yearSignatures` visible ou non dans une page ; un bloc `text` avec variables
ne déclenche pas le calcul), une seule requête `evaluation.findMany` sur `classSubjectId in …` et
`termId in <toutes les périodes de l'année>` (avec le filtre `publishedOnly`
de l'audience) alimente `buildYearData`. Aucun coût supplémentaire pour les
modèles sans bloc annuel. Règle d'audience inchangée : côté élève, seules les
évaluations publiées comptent et l'élève garde son propre rang (`ranking` reste
vide).

### 3.3 Nouvelles données de rendu

`BulletinRenderData` gagne aussi `nisu: string | null`, `schoolAddress`,
`schoolPhone` (déjà présents sur la vue, à propager dans les trois mappings :
`BulletinViewer.tsx`, `print/bulletin/[studentId]/[termId]/page.tsx`, aperçu de
l'éditeur) et `year`. `SAMPLE_BULLETIN_DATA` reçoit un `year` d'exemple à 4
contrôles (deux notés, deux vides) pour l'aperçu de l'éditeur et les tests.

## 4. Blocs

### 4.1 Nouveaux types

```ts
// zod (lib/server/bulletin-templates.ts) et types.ts client, champs optionnels
// en plus de blockBase (id, visible, breakBefore)
yearGrid:       { type: 'yearGrid'; showDomains?: boolean; notesLabel?: string; maxLabel?: string }
yearDecisions:  { type: 'yearDecisions'; title?: string }
yearSignatures: { type: 'yearSignatures'; title?: string; labels?: { director?: string; guardian?: string } }
```

Valeurs par défaut : `showDomains: false`, `notesLabel: 'Notes'`,
`maxLabel: 'Sur'`, `title: 'Décisions'` / `'Signatures'`, `labels.director:
'Direction'`, `labels.guardian: 'Les Parents'`. `BLOCK_TYPES` gagne les trois
types (déplaçables comme `text`, `cover`, `criteriaGrids`) ; les trois passent
par `renderBlock` avec le `never` exhaustif existant.

Rendu (`components/bulletin/blocks/yearGrid.tsx`, `yearDecisions.tsx`,
`yearSignatures.tsx`), encre `#1a1a2e`, bordures `1px solid` sur chaque cellule
comme `criteriaGrids` en style `grid` :

- **yearGrid** : `<table>` deux lignes d'en-tête (« Matières » en fusion
  verticale, un libellé de période fusionné sur deux colonnes, puis
  Notes / Sur), une ligne par matière (`points` formaté au dixième avec
  virgule, vide si null ; `maxPoints` entier), ligne de domaine en gras quand
  `showDomains` et que le domaine change, lignes `Total`, `Moyenne`, `Place`
  en gras (Place = `rank` en ordinal `1er`, `2e`…, vide si null). Sans `year`
  dans les données, le bloc rend `null`.
- **yearDecisions** : titre souligné, `<table>` `Contrôle | Moyenne |
  Coefficient`, une ligne par période (I, II, III, IV, V… en chiffres romains),
  ligne `Moyenne Générale` en gras. Moyenne vide si null.
- **yearSignatures** : encadré (`border 1px`), titre dans un cadre arrondi
  centré, puis pour chaque période un bloc « ligne de signature + libellé
  Direction » et « ligne + libellé Les Parents », espacés pour remplir la
  hauteur disponible (`flex-col justify-around`, hauteur 100 % de la colonne).
  Sans `year`, rend `null`.

### 4.2 Extensions de blocs existants

- **cover** : `fields` accepte en plus `'fullName'` (« Elève ») et `'nisu'`
  (« NISU », vide si l'élève n'en a pas) ; nouvelles options
  `showSchoolContact?: boolean` (adresse en italique puis « Téls : … » sous le
  nom, uniquement les valeurs non vides) et `nameBoxed?: boolean` (nom de
  l'école dans un rectangle à bord plein) ; `frameStyle` gagne `'rounded'`
  (bord plein, rayon 40 px, épaisseur 2 px). Libellés par défaut dans
  `FIELD_LABEL` : `fullName` → « Elève », `nisu` → « NISU », les autres
  inchangés (`academicYear` garde « Année Académique » pour ne pas modifier le
  livret). Nouveau champ `fieldLabels?: Partial<Record<CoverField, string>>`
  (60 caractères max par libellé) pour qu'un modèle renomme un libellé sans
  toucher aux autres ; les carnets l'utilisent pour « Année Scolaire ».
- **text** : substitution de variables avant le découpage en paragraphes :
  `{eleve}` (nom complet « Prénom NOM » tel que `studentName`), `{classe}`,
  `{annee}`, `{periode}`, `{ecole}`. Une variable inconnue reste telle quelle.
  L'éditeur affiche la liste sous le champ texte.

### 4.3 Layout de page `sidebar`

`pageSchema.layout` accepte `'sidebar'` ; la page gagne `asideWidth?: number`
(pourcentage, 15 à 40, défaut 25, seulement lu en `sidebar`). `breakBefore:
'column'` devient valide sur les pages `sidebar` (raffinement zod : `halves`
ou `sidebar`). Rendu dans `BulletinPage` : grille CSS à deux pistes
`1fr <asideWidth>%`, colonne principale = blocs avant le premier `breakBefore`,
colonne latérale = les autres, les deux en `flex-col` de hauteur pleine ; pas
de report automatique dans une colonne supplémentaire (contrairement à
`halves`), un dépassement se voit dans l'éditeur par le contrôle
`scrollHeight`/`scrollWidth` existant. Le bloc « aligné verticalement » et le
bloc `yearSignatures` prennent `height: 100%` dans leur colonne.

Éditeur : le sélecteur de layout ajoute « Colonne latérale » et, dans ce cas,
un curseur « Largeur de la colonne latérale ».

### 4.4 Compatibilité

Tous les champs sont optionnels ; un modèle enregistré avant cette version se
valide et se rend à l'identique. `normalizeConfig` n'est pas modifié.

## 5. Modèles globaux semés

`scripts/seed-bulletin-templates.ts` ajoute deux entrées (rafraîchies par
`updateMany` comme les autres) :

- **« Carnet scolaire (3e cycle et secondaire) »**, description : « Carnet
  annuel sur deux pages : décisions et règlement, couverture, grille des
  contrôles de l'année avec signatures par période. »
- **« Carnet scolaire (primaire) »**, même description, plus « Les matières
  sont regroupées par domaine. »

Config commune : `LETTER`, `LANDSCAPE`, `primaryColor '#1a1a2e'`,
`layout.showDecoration: false`, `pageMargin 18`, `blockSpacing 8`,
`typography.tableBody 9`, `pages` :

1. `id 'decisions'`, `layout 'halves'`, blocs dans l'ordre :
   - `yearDecisions` (`title 'Décisions'`)
   - `text` « Observations : » (gras) puis le texte
     « -   L'élève est :\n      ○ Promu (e)\n      ○ Maintenu (e)\n      ○ Orienté (e) ailleurs »
   - `text` « Extrait des règlements » (gras) puis les quatre points, verbatim du Word :
     1. Considéré (e) comme promu (e), l'élève qui obtient au moins une moyenne générale de 24/40.
     2. Considéré (e) comme maintenu (e), l'élève qui obtient une moyenne générale comprise entre 16/40 et 24/40.
     3. Orienté (e) ailleurs, l'élève qui obtient une moyenne générale inférieure à 16/40.
     4. Un élève qui s'est absenté 5 jours consécutifs sans motif valable est considéré comme abandon.
   - `text` « La direction » (gras, `align 'right'`, `verticalAlign 'bottom'`)
   - `cover` (`breakBefore 'column'`, `framed true`, `frameStyle 'rounded'`,
     `nameBoxed true`, `showSchoolContact true`, `sectionLabel '3ème Cycle &
     Secondaire'` ou `'Section primaire'`, `titlePattern 'Carnet scolaire'`,
     `showLogo true`, `fields ['fullName','className','nisu','academicYear']`,
     `fieldLabels { fullName: 'Elève', academicYear: 'Année Scolaire' }`)
2. `id 'grille'`, `layout 'sidebar'`, `asideWidth 22`, blocs :
   - `text` « Nom (s) et Prénom (s) {eleve}        Classe {classe}        Année Scolaire : {annee} » (gras, `fontSize 10`)
   - `yearGrid` (`showDomains` true pour le primaire seulement)
   - `yearSignatures` (`breakBefore 'column'`)

Aucun des deux modèles ne contient de nom d'école, d'adresse, de téléphone ni
de logo : ils viennent de l'école qui imprime. Une école dont les périodes ne
s'appellent pas « 1er contrôle » verra ses propres libellés.

## 6. Éditeur

- Palette : trois nouveaux types avec libellé et icône (fr, ht, en :
  `blockTypes.yearGrid` « Grille annuelle », `yearDecisions` « Décisions de
  l'année », `yearSignatures` « Signatures par période »).
- Panneau « Ce bloc » : `yearGrid` → interrupteur « Grouper par domaine »,
  champs « Libellé Notes », « Libellé Sur » ; `yearDecisions` → « Titre » ;
  `yearSignatures` → « Titre », « Libellé direction », « Libellé parents » ;
  `cover` → cases « Élève (nom complet) » et « NISU » dans la liste des champs,
  interrupteurs « Coordonnées de l'école », « Nom dans un cadre », option
  « Arrondi » du trait du cadre, champs de renommage des libellés ; `text` →
  aide listant les variables.
- Page : « Colonne latérale » dans le sélecteur de layout, curseur de largeur.
- Aperçu : `SAMPLE_BULLETIN_DATA.year` alimente les blocs ; le contrôle de
  dépassement existant s'applique au layout `sidebar`.
- Sélecteurs et interrupteurs : composants de l'application (`BareSelect`,
  `SelectItem`, `Switch`), jamais de `<select>` brut. Aucune chaîne visible
  avec tiret cadratin.

## 7. Impression, PDF, viewer, portail élève

Inchangés dans leur mécanique : la page d'impression et le PDF rendent
`BulletinDocument` avec la vue enrichie ; le viewer par période affiche le
carnet complet avec les périodes suivantes vides ; le portail élève reçoit le
même `year` (évaluations publiées seulement, rang propre conservé). Le
sélecteur de période du viewer garde son rôle : il choisit la période
« courante » (`{periode}`, appréciations, blocs par période), le carnet annuel
montre de toute façon toutes les périodes.

## 8. Migration, seeds, déploiement

Aucune migration de base : `Subject.maxScore`, `ClassSubject.coefficient`,
`Subject.domain`, `Student.nisu`, `School.address/phone/logoUrl` existent.
Déploiement : déployer, puis `pnpm db:seed-bulletin-templates` (ajoute les deux
carnets et rafraîchit les globaux). L'école cliente : créer ses périodes
(« 1er contrôle » … « 4ème contrôle »), ses matières avec note maximale,
coefficient par classe et domaine (primaire), assigner le carnet à ses niveaux
(Configuration › Niveaux) ou le définir par défaut, et renseigner adresse,
téléphone et logo dans Paramètres › Établissement.

## 9. Tests

- `year-data.test.ts` : Sur = max × coef ; Notes arrondies au dixième ; matière
  sans note → `points null` et 0 dans le total ; Total Sur constant ; Moyenne =
  Total ÷ Sur × 10 ; période sans note → tout null, `hasGrades false` ; rang de
  compétition avec ex aequo ; `generalAverage` = somme des périodes notées ;
  `coefficientSum` ; matières qualitatives exclues en amont (test sur
  `getStudentBulletinView`) ; audience élève = publiées seulement.
- `get-bulletin-view.test.ts` : `year` absent quand le modèle n'a pas de bloc
  annuel (aucune requête supplémentaire), présent sinon ; `nisu` propagé.
- `bulletin-templates.test.ts` : schéma des trois blocs, `sidebar` +
  `asideWidth`, `breakBefore` accepté en `sidebar`, refusé en `full` ;
  `fullName`/`nisu`, `fieldLabels`, `frameStyle 'rounded'`.
- `blocks.test.tsx` : rendu des trois blocs (en-têtes par période, lignes de
  domaine, valeurs vides, chiffres romains, Moyenne Générale, paires de
  signatures), `cover` avec coordonnées et nom encadré, `text` avec variables.
- `BulletinPage.test.tsx` : layout `sidebar` (deux colonnes, largeur, blocs
  après `breakBefore` dans la colonne latérale).
- `seed-bulletin-templates.test.ts` : les deux carnets (pages, blocs, domaines
  activés pour le primaire, aucun nom d'école dans la config).
- `locales.test.ts` : parité des nouvelles clés.
- Vérification manuelle : PDF réel de l'école de démo (élève d'une classe
  numérique), pages rastérisées comparées côte à côte aux rendus du Word ;
  viewer 1280 et 375 sans défilement horizontal ; éditeur (palette, panneau,
  layout `sidebar`).

## 10. Hors périmètre

- Décision automatique (Promu, Maintenu, Orienté ailleurs) à partir des seuils.
- Pondération des périodes (coefficient par période) : l'école n'en a pas besoin,
  la Moyenne Générale est une somme.
- Ligne d'identité de la page 2 courant au-dessus de la colonne latérale.
- Ordre des matières autre que celui de la classe (`ClassSubject.createdAt`) ;
  un ordre explicite reste une évolution possible via une liste de noms comme
  `criteriaGrids.subjects`.

## 11. Références

- `docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md`
- `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts`, `lib/server/grades.ts`
- `frontend/src/lib/server/bulletin-templates.ts`, `configuration/modele-bulletin/types.ts`
- `frontend/src/components/bulletin/{BulletinPage.tsx,render-data.tsx,sample-bulletin-data.ts,blocks/}`
- `frontend/scripts/seed-bulletin-templates.ts`
- `bulletin_template/Carnet scolaire 3e cycle et secondaire 2025-2026.docx`,
  `bulletin_template/Carnet scolaire complet primaire 2025 - 2026 (1).docx`
