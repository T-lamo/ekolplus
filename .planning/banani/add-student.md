# Add Student — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `OJ7XJIOjHxiM` — fetché 2026-08-14 — `fetches/epic4-forms/add-student.html`
- Route : `/eleves/nouveau` (création) + `/eleves/[id]/modifier` (édition, même composant prérempli)
- Remplace `StudentFormModal` (supprimé).

## Structure map
1. **Header** : titre/sous-titre + Annuler / Enregistrer l'élève. « Sauvegarder le brouillon » + « Étape suivante » du mock = différés (page unique, pas de wizard réel ni de drafts).
2. **Barre d'étapes** : ancres visuelles sur les vraies sections : Identité / Scolarité / Parents & Tuteurs / Options. (« Santé & Documents » du mock n'existe pas en base — remplacé par Options, écart documenté.)
3. **Colonne gauche sticky** : carte avatar (upload réel), carte Matricule (auto-généré à l'enregistrement — réel `studentNumber` affiché en édition), carte Statut d'inscription en radio-cartes (catalogue réel : Inscrit(e) / Absences répétées / Suspendu(e) — le « En attente » du mock n'existe pas).
4. **Section Identité** : prénom*/nom*, naissance*/lieu, genre en radios (Féminin/Masculin/Non précisé), nationalité, langue maternelle, adresse, téléphone élève, email élève.
5. **Section Scolarité** : année scolaire (lecture seule = année active, les classes en dépendent), classe*, type d'inscription (Nouvelle inscription/Réinscription/Transfert), date d'inscription (`enrolledAt` éditable), école précédente, n° de transfert, observations (textarea).
6. **Section Parents & Tuteurs** : les 2 blocs tuteurs existants (réels, `Guardian`), repris du modal actuel.
7. **Section Options** : « Bénéficiaire d'une bourse » = colonne réelle `scholarship` ; « Portail élève » + « Notifications parents » = différés honnêtes (carte « Bientôt » — pas de portail ni de canal parents).

## Données / modèle
- Migration 20 ajoute à Student : motherTongue, phone, email, enrollmentType, previousSchool, transferNumber, notes, scholarship (Boolean @default(false)).
- API : POST/PATCH `/api/school/students(/[id])` étendus (additif) + GET détail étendu ; `enrolledAt` devient éditable.
- Requis bloquants (inchangés) : prénom, nom, date de naissance, classe.

## Responsive
- Base 375px : colonne gauche (avatar/matricule/statut) au-dessus, sections empilées, grilles 1 col.
- md : grilles 2 col. lg/xl : layout `260px 1fr`, colonne gauche sticky — mockup fidèle.

## Écarts assumés
- Wizard 4 étapes → page unique à ancres (comme le mock le rend réellement).
- Statuts = catalogue réel (pas de « En attente »).
- Santé & Documents omis ; Portail/Notifications différés ; brouillon omis.

## Checklist
- [ ] Migration 20 + routes étendues
- [ ] Page mobile-first, colonne sticky, radios statut
- [ ] 375 / 768 / 1280 vérifiés
- [ ] format/lint/typecheck/test
