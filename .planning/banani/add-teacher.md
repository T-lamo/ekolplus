# Add Teacher — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `HmgFVw_38Y6C` — fetché 2026-08-14 — `fetches/epic4-forms/add-teacher.html`
- Route : `/enseignants/nouveau` (création) + `/enseignants/[id]/modifier` (édition, même composant prérempli)
- Remplace `TeacherFormModal` (supprimé) — décision utilisateur : « le design Banani est beaucoup plus complet ».

## Structure map
1. **Header** : bouton retour + « Ajouter un enseignant » / sous-titre + actions Annuler / Créer l'enseignant. « Enregistrer comme brouillon » du mock = différé (pas de modèle brouillon) — non rendu.
2. **Barre d'étapes** : le mock montre 4 étapes mais rend une seule page scrollable → implémentée comme ancres visuelles reflétant les vraies sections : Identité / Coordonnées / Poste & Matières (l'étape « Accès & Compte » du mock est différée, « Récapitulatif » = le résumé sticky).
3. **Section Identité & Photo** : upload photo (réel, `ImageUploader`), civilité / prénom* / nom*, naissance, genre, nationalité, n° d'identification.
4. **Section Coordonnées** : email, téléphone principal (`PhoneInput`), téléphone secondaire, adresse.
5. **Section Poste & Matières** : statut (catalogue réel ACTIVE/ON_LEAVE/INACTIVE), type de contrat, date d'embauche, heures/semaine (objectif contractuel — distinct des heures calculées depuis les affectations), matières + classes en **tags lecture seule** issus des vraies affectations (édition) avec lien vers Affectations — le mock les rend éditables ici mais le modèle réel les dérive de `ClassSubject` (matière×classe×enseignant), impossible sans classe. Hint du mock conservé.
6. **Section Accès à la plateforme** : différée honnête — carte « Bientôt disponible » (pas de faux identifiants ni de toggles permissions morts).
7. **Résumé sticky droite** : aperçu live (photo, civilité+nom, statut badge, compteurs matières/classes/heures) + checklist champs requis live + bandeau warning si manquants.

## Données / modèle
- `name` reste la colonne canonique (consommée par listes/bulletins/affectations). Nouveau : `civility`, `firstName`, `lastName` (nullable) ; le submit compose `name = "prénom nom"`. Édition d'une fiche legacy sans prénom/nom : split best-effort au premier espace.
- Migration 20 (`20_teacher_student_profiles`) ajoute : civility, firstName, lastName, dateOfBirth, gender, nationality, idNumber, secondaryPhone, address, contractType, hiredAt, weeklyHoursTarget.
- API : POST/PATCH `/api/school/teachers(/[id])` étendus (additif) ; GET détail ajouté sur `[id]` (profil complet + matières/classes/heures réelles).
- Requis bloquants = prénom + nom (le DB n'exige que `name`). Email/téléphone marqués * dans le mock → suivis dans la checklist mais non bloquants (fiches legacy sans email).

## Responsive
- Base 375px : sections empilées, résumé après le formulaire (non sticky), steps bar scrollable, grilles 1 col.
- md : grilles 2-3 col. lg/xl : layout 2 colonnes `1fr 300px`, résumé sticky — mockup fidèle.

## Écarts assumés
- « Enregistrer comme brouillon » omis (pas de modèle draft).
- Matières/classes non éditables ici (affectations réelles), tags lecture seule + lien.
- Section Accès plateforme → carte différée.
- « Nationalité » = champ libre (pas de catalogue pays en base).

## Checklist
- [ ] Migration 20 + routes étendues
- [ ] Page mobile-first, ancres/steps, résumé live
- [ ] 375 / 768 / 1280 vérifiés
- [ ] format/lint/typecheck/test
