# Add Matière — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `mQobMt0qZhgH` (« Add Matière », flow `2oB_n5kLBeuy`) — fetché 2026-08-17
- Extraits bruts : scratchpad `add-matiere.main.html` / `add-matiere.css` (session 2026-08-17)
- Écrans frères (même shell « fiche matière ») : `programme-annuel.md` (`2jFhG8pLw1l_`), `affectations-classes.md` (`FMTCFae5gsD6`)
- Route : `/configuration/matieres/nouvelle` (création) — le même formulaire sert d'onglet « Informations générales » de la fiche `/configuration/matieres/[id]` (édition).
- Remplace `SubjectFormModal` (supprimé) — le bouton « Ajouter une matière » de la liste et l'action « Modifier la matière » du ⋯ naviguent vers ces routes.

## Shell commun « fiche matière » (partagé par les 3 écrans)
Banani place un sous-en-tête blanc pleine largeur sous la topbar (dans notre shell : en tête de la colonne de contenu, `-mx-4 -mt-5 sm:-mx-6 lg:-mx-7 lg:-mt-7` pour coller aux bords comme le mock) :
- **Ligne 1** (`padding 12px 24px 10px`) : `btn-ghost` « ← Retour » (13px/500, muted) · icône matière 36×36 `radius-md` fond `iconBg` + icône 18px `iconFg` (création : pas d'icône, juste titre) · titre 17px/700 + méta 12px muted (« MAT-001 · Sciences · Coeff. 4 · Année 2024-2025 » / création : « Nouvelle matière — Année scolaire {label} ») · à droite : badge statut (`badge-success` Active / `badge-muted` Brouillon) + boutons contextuels.
- **Ligne 2** `tabs-bar` (`border-top`, `padding 0 24px`) : items `9px 16px`, 13px/500 muted, icône 14px, actif = primary + `border-bottom 2px primary` + 600 ; `tab-badge` 18px pill `bg-secondary text-primary` 10px/700. Onglets : Informations générales (`info`) · Programme annuel (`book-marked`, badge = nb chapitres) · Compétences (`target`) · Évaluations (`clipboard-list`) · Affectations classes (`users`, badge = nb classes).
- En création : seul « Informations générales » est actif ; les autres sont désactivés (opacité 50 %, tooltip « Enregistre la matière pour continuer »).
- **Footer** collant (`form-footer` : `12px 24px`, `bg-card border-top`) : à gauche « ⓘ Les champs marqués * sont obligatoires » (12px muted) ; à droite Annuler (ghost) · Enregistrer comme brouillon (secondary) · **+ Créer la matière** (primary).
- Composant : `src/components/school/subjects/SubjectPageShell.tsx` (`{ mode:'create'|'edit', subject?, activeTab, counts, headerActions, footer, children }`), `SubjectTabsBar.tsx`.

## Structure map (contenu, `main-content` padding 20px 24px, grille `1fr 300px` gap 16px)
### Colonne gauche
1. **Identité de la matière** (`card` : bg-card, radius-lg, `padding 18px 20px`, mb 14 ; `card-title` 13px/700 + icône 15px primary `book-open` ; `card-subtitle` 12px muted mb 14) — `form-grid` 2 col gap 16 :
   - Nom de la matière * — hint « Ex : Mathématiques, Français, Physique-Chimie »
   - Code matière * — hint « Code court unique (généré automatiquement) » → **auto-généré côté client** à partir du nom (3 premières lettres majuscules + `-` + n° séquentiel `001`… selon les codes existants), modifiable.
   - Abréviation (optionnel) — hint « Utilisée dans les tableaux et bulletins » → nouveau champ `abbreviation`.
   - Département / Filière * (select) → `domain` existant (voir Q4).
   - Niveau / Année d'étude * (select) → `level` : select des niveaux réels des classes de l'école (`Class.level` distincts) + « Tous niveaux ». (Assomption : mono-valeur, texte libre stocké.)
   - Statut * (select Obligatoire / Optionnelle (élective) / Facultative) → `kind` (`REQUIRED|ELECTIVE|OPTIONAL`), hint « Obligatoire, Optionnelle (élective) ou Facultative ».
   - Description / Syllabi (optionnel, `form-full`, textarea min-h 72) → `description`.
2. **Structure pédagogique et pondération** (`sliders-horizontal`) :
   - `adv-row-3` (gap 12) : Coefficient * (hint « Poids dans la moyenne générale ») → `defaultCoefficient` ; Note maximale (« Barème par défaut ») → `maxScore` def 20 ; Note de passage (« Seuil de validation ») → `passingScore` def 10.
   - `adv-row` (gap 14) : Volume horaire total (h) (« Nombre d'heures total annuel ») → `totalHours` ; Dont CM / TD / TP = 3 inputs flex-1 gap 6 (« Cours magistral · TD · TP ») → `hoursCM/hoursTD/hoursTP`.
   - `adv-row` : Type d'évaluation * (select ; hint « Examen final, contrôle continu, projet, hybride ») → `evaluationType` (catalogue : Contrôle continu · Examen final · Contrôle continu + Examen final · Projet · Hybride) ; Capacité max. d'élèves (optionnel, « Ex : 35 », hint « Limite de places (cours d'option) ») → `maxCapacity`.
   - `section-divider` puis 2 `toggle-row` (title 13px/600, sub 11px muted, `Switch`) : « Inclure dans la moyenne générale » → `includeInAverage` (def true) ; « Afficher dans le bulletin » → `showOnBulletin` (def true).
3. **Assignation et logistique** (`user-check`) : `adv-row` : Enseignant responsable (select avec avatar 22px — `TeacherPicker` réel, hint « L'enseignant doit être créé dans la liste des enseignants ») → `responsibleTeacherId` ; Salle / Type de local requis (optionnel, select catalogue : Salle de cours standard · Amphithéâtre · Laboratoire · Salle informatique · Gymnase · Atelier · Autre) → `room`. Puis Prérequis (optionnel, multi-select des autres matières, placeholder « Sélectionner des matières prérequises… », hint « Matières devant être validées au préalable ») → relation m2m `prerequisites`.
4. **Options avancées et paramètres** (`settings-2`) : `adv-row` : Année académique / Semestre (select **lecture seule** = année active, hint « Rattachement à la période en cours ») ; Note éliminatoire (optionnel, « Ex : 6 / 20 », hint « En dessous de ce seuil, la matière est éliminatoire ») → `eliminatoryScore`.
5. **Bandeau conseil** (`bg-warning`, radius-lg, `padding 14px 18px`, icône `lightbulb` 18px warning-fg) : « Continuez avec l'onglet "Programme annuel" » + sous-texte ; bouton secondary bordé warning « Aller au programme → » (création : désactivé tant que non enregistré ; édition : ouvre l'onglet).

### Colonne droite (300px)
6. **Apparence** (`palette`) : label Icône → `icon-grid` 8 col gap 5, `icon-option` 36×36 `bg-muted` radius-md, sélectionné = `bg-secondary` + `border 2px primary` + icône primary ; 16 icônes lucide (calculator, flask-conical, book, globe, landmark, music, dumbbell, monitor, pencil-ruler, atom, map, brush, microscope, languages, star, layout-dashboard) → `icon`. Couleur d'accent → `color-swatches` 26px ronds gap 7, sélectionné = `box-shadow 0 0 0 2px card, 0 0 0 4px currentColor` ; 10 couleurs (#2563eb #7c3aed #388e3c #c2185b #e65100 #00897b #f59e0b #ad1457 #1976d2 #455a64) → `color`. Divider, « Aperçu » 12px/600 : ligne `bg-background` radius-md `10px 12px` avec chip 34×34 (fond = couleur à 12 % / icône couleur), nom 13px/600, méta 11px « CODE · Domaine · Coeff. N », badge statut à droite.
7. **Statut de publication** (`toggle-right`) : 3 `status-option` (`9px 12px`, radius-md, mb 6) radio 16px : Active (« Visible et utilisée dans les évaluations ») / Brouillon (« En cours de configuration, non visible ») / Archivée (« Plus utilisée, conservée pour historique ») ; sélectionné = `bg-secondary`, titre primary ; non sélectionné = `bg-background border`. → `status` (`ACTIVE|DRAFT|ARCHIVED`).
8. **Classes concernées** (`school`, sub « Sélection rapide — détails dans l'onglet Affectations ») : liste de toutes les classes de l'année active, ligne `7px 10px` radius-md, coché = `bg-secondary` + case 14px primary ✓ + nom primary ; décoché = `bg-background border` + case bordée ; à droite « N élèves » 11px muted. À la création → un `ClassSubject` par classe cochée (coefficient = `defaultCoefficient`). En édition → reflète/édite les affectations réelles (upsert/delete).

## Données / modèle (migration `22_subject_profile`)
```prisma
model Subject {
  … existants (name, code, domain, isActive)
  abbreviation      String?
  level             String?
  kind              String   @default("REQUIRED")   // REQUIRED | ELECTIVE | OPTIONAL
  description       String?
  defaultCoefficient Int?    // pré-remplit ClassSubject.coefficient
  maxScore          Int      @default(20)
  passingScore      Int      @default(10)
  totalHours        Int?
  hoursCM           Int?
  hoursTD           Int?
  hoursTP           Int?
  evaluationType    String?
  maxCapacity       Int?
  includeInAverage  Boolean  @default(true)
  showOnBulletin    Boolean  @default(true)
  responsibleTeacherId String?  + relation Teacher "SubjectResponsible" (SetNull)
  room              String?
  eliminatoryScore  Int?
  icon              String?   // nom lucide du catalogue
  color             String?   // hex du catalogue
  status            String   @default("ACTIVE") // ACTIVE | DRAFT | ARCHIVED — `isActive` reste = status !== 'ARCHIVED' (synchronisé serveur)
  prerequisites Subject[] @relation("SubjectPrerequisites")
  requiredBy    Subject[] @relation("SubjectPrerequisites")
  chapters      SubjectChapter[]   // voir programme-annuel.md
}
```
- `isActive` conservé (dashboard, filtres liste) et **dérivé** de `status` à chaque écriture ; l'archivage depuis la liste (`PATCH {isActive}`) devient `PATCH {status}`.
- `getSubjectVisual(name, {icon,color})` : l'icône/couleur stockées priment sur la table `KNOWN` ; fond = couleur à 12 % d'opacité (`color-mix`), badges inchangés.

## API
- `GET /api/school/subjects/[id]` (nouveau) → fiche complète : champs ci-dessus + `prerequisiteIds`, `responsibleTeacher {id,name,photoUrl}`, `classSubjects[]` (class {id,name,level, studentCount}, teacher {id,name,photoUrl}, coefficient, weeklyHours), `chapterCount`, `activeYear {id,label}`.
- `POST /api/school/subjects` étendu (tous les champs optionnels sauf `name`) + `classIds?: string[]` (crée les pivots dans la même tx) + `prerequisiteIds?`.
- `PATCH /api/school/subjects/[id]` étendu idem (sans classIds — l'onglet Affectations gère les pivots).
- `GET /api/school/subjects` : ajoute `status`, `icon`, `color`, `abbreviation`, `defaultCoefficient` (la liste affiche le badge Brouillon).

## Token mapping
| Banani | Projet |
|---|---|
| `--primary #6c2bd9`, `--secondary #ede9fb` | `primary`, `secondary` |
| `--warning #fff8e1 / --warning-foreground` | `warning` / `warning-foreground` |
| `--radius-md 6px / lg 8px` | `rounded-md` / `rounded-lg` |
| 11px / 12px / 13px | `text-2xs` / `text-xs` / `text-caption` |
| `card padding 18px 20px` | `px-5 py-[18px]` |
| `form-input padding 8px 12px 13px` | `Field` existant (vérifier hauteur ≈ 36px) |

## Responsive (mobile-first)
- **Base 375** : sous-en-tête empilé (Retour au-dessus, titre, actions en ligne wrap), tabs scrollables horizontalement, grille 1 col (colonne droite sous la gauche), `form-grid`/`adv-row` 1 col, `icon-grid` 8 col reste (36px × 8 + gaps = 323px OK), footer boutons wrap (Créer pleine largeur).
- **md 768** : `form-grid`/`adv-row` 2 col, `adv-row-3` 3 col.
- **lg 1024+** : grille `1fr 300px`, footer sur une ligne — mock fidèle à 1280.

## Interactions / états
- Validation client : nom (≥2), code (unique côté serveur → 409 `SUBJECT_CODE_TAKEN` affiché sous le champ), coefficient 1–10, notes 0–maxScore, passingScore ≤ maxScore.
- « Enregistrer comme brouillon » = même POST avec `status:'DRAFT'`. « Créer la matière » = statut choisi dans la carte (def ACTIVE). Succès → toast + redirection `/configuration/matieres/[id]?tab=programme` (le mock pousse vers Programme annuel via le bandeau) — **assomption : redirection vers la fiche, onglet Informations** (bandeau visible), pas directement vers Programme.
- Édition : header actions = badge statut + « Enregistrer » ; footer identique sans « brouillon ».
- Loading : squelettes des cartes ; erreur réseau : bannière `role=alert`.

## Copy
Toutes les chaînes FR ci-dessus, dans `src/app/(school)/configuration/matieres/subject-form.constants.ts` (catalogues : KIND, EVALUATION_TYPES, ROOM_TYPES, DOMAINS, ICONS, COLORS).

## Checklist
- [x] Migration 22 + routes (POST/PATCH étendus, GET [id])
- [x] `SubjectPageShell` + `SubjectTabsBar` + `SubjectForm` (mobile-first)
- [x] Liste : bouton/actions → routes ; badge Brouillon ; suppression de `SubjectFormModal`
- [x] 375 / 768 / 1280 vérifiés en navigateur
- [x] format / lint / typecheck / test

## Écarts assumés vs mock
- **Colonne droite 360 px (lg) / 420 px (xl)** au lieu de 300 px — retour utilisateur 2026-08-17 (« doit occuper beaucoup plus d'espace ») ; c'est devenu la largeur de référence de toute l'app école via `ASIDE_GRID` (`src/lib/layout.ts`, garde-fou `layout.test.ts`).
- En-tête (Retour · titre · actions · onglets) et footers rendus en cartes arrondies dans la marge de la page (ne collent plus à la sidebar / topbar) ; « champs obligatoires » au-dessus de la grille pour aligner Identité et Apparence.
- Actions uniquement dans l'en-tête (pas de footer dupliqué) ; « Archivée » masqué en création ; grille d'icônes 8 colonnes fluides.

## Open questions for user
Voir message batché du 2026-08-17 (page vs modale, onglets Compétences/Évaluations, sémantique Brouillon, catalogue Département).
