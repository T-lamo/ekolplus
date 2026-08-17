# Affectations Classes (fiche matière · onglet) — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `FMTCFae5gsD6` (« Affectations Classes », flow `2oB_n5kLBeuy`) — fetché 2026-08-17
- Extraits bruts : scratchpad `affectations-classes.main.html` / `affectations-classes.css`
- Route : `/configuration/matieres/[id]?tab=affectations` — onglet 5 du shell (`add-matiere.md`). Badge d'onglet = nb classes affectées.
- Header actions : badge statut · « ✓ Enregistrer » (primary).
- **Une seule source de vérité** : le pivot `ClassSubject` (déjà utilisé par `/configuration/affectations` et `/configuration/coefficients`, cf. `epic-4-data-model.md`). Cet onglet = la même table filtrée sur une matière, éditée en place. Écriture via `POST /api/school/class-subjects` (upsert) et `DELETE /api/school/class-subjects/[id]` existants.

## Structure map (`main-content` `20px 24px`, grille `1fr 260px` gap 18)
### Colonne gauche
1. **KPI row** (4 `stat-mini-card` : `bg-card border radius-lg`, `14px 18px`, valeur 22px/800 lh 1, label 12px muted/500) : Classes affectées (valeur primary) · Enseignants assignés · Élèves concernés (success-fg) · Sans enseignant (warning-fg). Grille 2 col mobile → 4 col md.
2. **Affectations des classes** (`section-card` : `bg-card border radius-lg` mb 18 ; header `14px 18px` border-b, titre 14px/700 icône `link` primary) — droite : filtre (`bg-muted radius-md 6px 10px` min-w 180, « Filtrer les classes… ») + `btn-primary` compact « + Ajouter une classe » (ouvre un popover/select des classes non affectées → upsert avec `coefficient = defaultCoefficient`).
   - `class-table` : th 11px/600 uppercase ls .6px muted `0 14px 10px` ; td `12px 14px` 13px border-b (dernier sans) ; colonnes : Classe (`class-row-name` 600 + `class-row-level` 12px muted = code matière) · Niveau (`badge-blue` `#e0f0ff/#2563eb` = `info`) · Enseignant assigné (`teacher-cell` avatar 28px + nom 13px/500 + sous-titre 11px muted « Prof. principal » si prof principal de la classe, sinon « Prof. de {matière} » ; sans prof → `teacher-select` chip `bg-muted` warning « 👤+ Assigner un enseignant ▾`) → **`TeacherPicker`-select inline**, upsert au changement · Coeff. (`coeff-input` 48px `bg-muted border radius-md` 13px/700 primary centré — input numérique, upsert au blur) · Élèves (13px/600 = nb inscriptions) · Heures/sem. (input `weeklyHours` inline, « 4 h ») · Statut (`badge-success` Active / `badge-warning` « Sans prof. ») · Actions (crayon primary = focus ligne, poubelle destructive = DELETE avec confirm) — ligne « sélectionnée » `bg #f7f5ff`.
   - Sous la table `add-row-btn` (`border 1.5px dashed`, `10px 14px`, centré, 12px muted) « + Ajouter une classe à cette matière ».
   - État vide (`no-class-state` `40px 20px` centré) : « Aucune classe n'a encore cette matière » + bouton.
3. **Bandeau alerte** (si ≥1 sans prof : `bg-warning border #fcd34d radius-lg 12px 16px`, icône alert-triangle) : « N classe(s) sans enseignant assigné » 13px/600 + « La classe **5ème C** n'a pas d'enseignant de {matière}. Veuillez assigner un enseignant pour activer cette affectation. » 12px `#92400e` + bouton secondary « Résoudre » (scroll + focus sur le 1er select vide).
4. **Enseignants disponibles pour cette matière** (`section-card`, header + `btn-secondary` compact « + Ajouter un enseignant » → `/enseignants` (création)) — body `14px 18px` col gap 10 : une ligne par enseignant qui enseigne déjà cette matière (`ClassSubject.teacherId` distincts) : `bg-background border radius-md 12px 14px` : avatar 36px + nom 13px/600 + « {matière} · N classe(s) assignée(s) » 11px muted ; droite : badge « Disponible » (success) / « Chargé » (warning, si heures totales/sem ≥ `weeklyHoursTarget` ou ≥ 18 h sans cible) + « 8 h/sem. » 12px muted (somme réelle de tous ses `weeklyHours`, toutes matières). Vide : « Aucun enseignant n'est encore assigné à cette matière. »

### Colonne droite (260px)
`sidebar-info-card` (`bg-card border radius-lg` p 16 mb 14 ; titre 13px/700 icône 15px mb 10 ; `stat-row-sm` `6px 0` 12px border-b, label muted/500, valeur 700).
1. **Matière** (`info`) : chip 34px + nom + « CODE · Coeff. N » ; Catégorie (domain) · Coefficient par défaut · Classes affectées (primary) · Total élèves · Statut (badge 10px).
2. **Résumé des affectations** (`bar-chart-2`) : Total classes · Avec enseignant (success) · Sans enseignant (warning) · Heures total/sem. ; « Taux de couverture / 80 % » + barre 6px `bg-muted` / primary (= avec prof ÷ total).
3. **Classes non affectées** (`circle-alert` warning) : « Ces classes n'ont pas encore cette matière dans leur programme. » ; lignes `bg-muted radius-md 8px 10px` : nom 12px/600 + « N élèves » 11px muted + `btn-primary` mini (11px `4px 10px`) « + Affecter » (upsert direct). Vide : « Toutes les classes ont cette matière ✓ ».
4. **Navigation rapide** (`layers`) : 3 lignes `bg-muted radius-md 7px 10px` « → Programme annuel / Compétences / Évaluations » (Compétences/Évaluations selon Q2).

### Footer (`form-footer` `16px 24px`)
- Gauche : icône link + « 5 classes affectées · 142 élèves · 3 enseignants · 1 classe sans enseignant ».
- Droite : « Annuler les modifications » (ghost — recharge) · « ⤓ Exporter » (CSV réel) · « ✓ Enregistrer les affectations » (les modifs sont déjà persistées à la volée → flush + toast « Affectations enregistrées »).

## Données
- Aucun nouveau modèle. `GET /api/school/subjects/[id]` fournit `classSubjects[]` (avec `class.studentCount`, `class.homeroomTeacherId`, `teacher.photoUrl`, `teacher.weeklyHoursTotal`, `teacher.weeklyHoursTarget`) + `unassignedClasses[]` (classes de l'année active sans pivot) — évite 3 allers-retours.
- Écritures : `POST /api/school/class-subjects` (upsert, existant) · `DELETE /api/school/class-subjects/[id]` (existant).

## Responsive
- Base 375 : KPI 2×2, table → **cartes empilées** (nom + niveau, select prof, coeff/heures côte à côte, statut, actions) via `md:table` ; colonne droite dessous ; footer wrap.
- md : table classique 8 colonnes avec `overflow-x-auto` ; lg : `1fr 260px`.

## Checklist
- [x] `AffectationsTab` (KPI, table md+ / cartes < md, select prof inline, coeff + heures « commit on blur », popover « Ajouter une classe », bandeau, enseignants disponibles, colonne droite, footer)
- [x] `GET /api/school/subjects/[id]` enrichi (`classSubjects` avec `studentCount`/`isHomeroomTeacher`, `unassignedClasses`, `teachers` avec charge hebdo + Disponible/Chargé)
- [x] 375 / 1280 vérifiés ; assignation d'un enseignant réelle (POST class-subjects 200 → KPI/résumé/badge d'onglet recalculés)

## Écarts assumés vs mock
- Toute modification est persistée à la volée ; « Enregistrer les affectations » confirme (toast) et « Annuler les modifications » recharge.
- Sous 1280 px avec la sidebar dépliée la table (min 820 px) défile horizontalement dans sa carte — le mock est à 1440.
- « Chargé » = charge hebdo réelle ≥ `weeklyHoursTarget` (ou ≥ 18 h sans cible).
