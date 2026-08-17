# Add Class (« Ajouter une classe ») — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `WSAJOFgz4ml5` (« Add Class », flow `2oB_n5kLBeuy`) — fetché 2026-08-17
- Routes : `/configuration/classes/nouvelle` (création) et `/configuration/classes/[id]` (édition, même formulaire) — remplacent la modale `ClassFormModal` (supprimée), exactement comme la fiche matière a remplacé `SubjectFormModal`.
- Même chrome que la fiche matière : en-tête en carte (« ← Retour » · chip · titre · meta · actions) avec la barre d'onglets à l'intérieur, note « champs * obligatoires » au-dessus de la grille, colonne droite = `ASIDE_GRID` (360/420 px). Décision utilisateur 2026-08-17 : **la couleur d'identification passe dans la colonne droite** (carte « Apparence », comme pour les matières) au lieu de la carte Informations générales.

## Structure map (`main-content` `20px 24px`, grille `1fr 300px` gap 18 → `ASIDE_GRID`)
### En-tête (`page header` + `.tabs-bar`)
- Retour · titre 20px « Ajouter une classe » / nom de la classe · sous-titre « Année scolaire 2024-2025 — Nouvelle configuration de classe ». Actions : « Annuler » (secondary) · « 💾 Enregistrer la classe » (primary). Les actions du bas du mock (Annuler / Prévisualiser / Enregistrer) sont **retirées** (règle « une seule action par page » ; l'aperçu est vivant dans la colonne droite).
- Onglets (`.tab-item` 13px, `10px 18px`, actif primary + souligné 2px, badge 18px rond `.tab-badge` muted / `.done` success ✓) : Informations générales · Professeur principal · Matières · Notes & Évaluation. Le mock empile les 4 cartes sous le 1er onglet → **onglets = ancres** (scroll vers la carte + suivi au scroll), badge ✓ quand la section est complète, compteur sinon.

### Colonne gauche — 4 `form-card` (réutilise `FormCard`/`FormGroup`/`TextInput`/`BareSelect` des matières)
1. **Informations générales** (`school`) : Nom * (hint « Ex : 3ème A, NS1, Philo Sciences... ») · Niveau scolaire * (select = catalogue `GET /api/school/grade-levels` + « Autre… » saisie libre ; si catalogue vide → saisie libre + lien Configuration › Niveaux) · Salle (opt) · Capacité maximale * (hint) · Filière / Série (opt, saisie libre — nouveau champ `Class.track`) · Année scolaire * (lecture seule = année active, comme la fiche matière).
2. **Professeur principal** (`user-check`) : select enseignant (avatar) opt, hint « Ce professeur recevra les bulletins et rapports de la classe » ; « Matière principale » du mock → **lecture seule** : matières déjà enseignées par le prof choisi (`teacher.subjects`), pas de champ dédié (aucune donnée modèle).
3. **Matières de la classe** (`book-open`) : filtre, « N matières sélectionnées sur M disponibles », Tout sélectionner / désélectionner, une `subject-row` par matière active (checkbox 16px, nom 13px/500, chip « Coeff. N » = `defaultCoefficient`), lien « + Créer une nouvelle matière » → `/configuration/matieres/nouvelle`. Création : `subjectIds` dans le POST (pivots `ClassSubject` créés dans la même transaction, `coefficient = defaultCoefficient`). Édition : bascule **à la volée** via `POST /api/school/class-subjects` / `DELETE …/[id]` (comme la fiche matière) ; une matière avec des notes est **verrouillée** (le DELETE renvoie désormais 409 `CLASS_SUBJECT_HAS_EVALUATIONS` — la suppression du pivot cascade sur les évaluations).
4. **Configuration des notes** (`notebook-pen`) : **lecture seule** — aucun paramètre de notation par classe dans le modèle (barème = par matière, périodes = année active, calcul = moyenne pondérée par coefficient, modèle de bulletin = modèle actif de l'école) ; la carte affiche ces valeurs héritées avec des liens vers les écrans qui les gèrent. Écart assumé (pas de faux champs).

### Colonne droite (`info-card` : header 12px/700 + body 14px, `info-row` 11px)
1. **Apparence** (`palette`) : « Couleur d'identification » — mêmes pastilles 26px que la fiche matière (palette `SUBJECT_COLORS` partagée), hint « Couleur affichée sur les cartes et badges » ; puis **Aperçu de la carte** (`.preview-card` : barre 3px couleur, nom 18px/700, sous-titre « Salle 12 — Bât. B · 3ème », 2 stats Élèves / Matières).
2. **Récapitulatif** (`info`) : Nom · Niveau · Salle · Capacité · Matières (primary) · Prof. principal · Année.
3. **Checklist** (`check-circle`) : Nom · Niveau · Capacité · Matières (N) · Prof. principal (optionnel) ; bandeau warning « Le professeur principal est recommandé mais optionnel à la création. ».
4. **Après création** (`arrow-right-circle`) : 1 Inscrire les élèves → `/eleves` · 2 Affecter les enseignants → `/configuration/affectations` · 3 Configurer la scolarité → `/scolarite/configuration` (liens réels ; en édition, mêmes liens = navigation rapide).

## Données / modèle (migration 24)
```prisma
model Class { …  color String?  track String? … }
```
- `GET /api/school/classes` : + `color`, `track`. `POST` : + `color`, `track`, `subjectIds[]` (tx). `PATCH /[id]` : + `color`, `track`. **Nouveau `GET /[id]`** : classe + `subjectIds` + `lockedSubjectIds` (pivots avec évaluations) + `studentCount` + `homeroomTeacher`.
- Liste des classes : la tuile de la carte et le point de couleur du tableau utilisent `color` (fallback primary).

## Responsive
- Base 375 : en-tête empilé, onglets défilants, grille 1 colonne (colonne droite dessous), lignes de formulaire 1 col ; sm : 2 col ; lg : `ASIDE_GRID`.

## Checklist
- [x] Migration 24 + routes (GET/POST/PATCH classes, garde DELETE class-subjects) + 9 tests
- [x] `PageTabsBar` + `PageHeaderCard` génériques (badges ✓/compteur) — `SubjectTabsBar` / `SubjectPageShell` les réutilisent
- [x] `ClassForm` + `useClassForm` + `useClassFormData` + `ClassPageShell` (ancres + scroll-spy) ; pages `nouvelle` / `[id]` ; liste → routes (couleur sur tuile + point du tableau) ; suppression `ClassFormModal`
- [x] 375 / 1280 / 1440 vérifiés ; création réelle (POST 201 + 3 pivots) et bascule à la volée en édition (DELETE 204)
- [x] format / lint / typecheck / test

## Écarts assumés vs mock
- Actions du bas retirées ; « Prévisualiser » = aperçu vivant à droite.
- « Matière principale » et « Configuration des notes » en lecture seule (pas de modèle de données) — documenté dans la carte.
- Couleur d'identification à droite (demande utilisateur), palette partagée avec les matières.
