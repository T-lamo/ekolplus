# Espace Enseignant — Redesign shell + écrans (alignement charte admin)

**Date :** 2026-08-31
**Statut :** Validé par Amos (sections shell/navigation approuvées explicitement ; contenu dashboard, présentation emploi du temps et liste élèves choisis via questions fermées ; paramètres personnels ajoutés à la demande ; ordre de lancer l'implémentation donné le 2026-08-31).

## Problème

Le portail enseignant livré en Phases 1-2 (`/espace-enseignant/*`) a un design propre : pages nues mobile-first 375px, barre d'onglets basse (`TeacherBottomNav`), listes de cartes empilées. Ça ne ressemble pas à l'application vue par un compte admin (ex. amosdorceus2023@gmail.com) : sidebar sombre, topbar, dashboard, tableaux paginés. Deux designs coexistent dans la même app — inacceptable (cf. mémoire « Cohérence UI à l'échelle de l'app »).

## Décision : Approche A — troisième déclinaison du shell existant

Le code a déjà `AdminSidebar`/`AdminTopbar` et `SchoolSidebar`/`SchoolTopbar`, bâtis sur les briques génériques `components/layout/sidebar/*` et `components/layout/topbar/*`. On crée la troisième paire : **`TeacherSidebar` / `TeacherTopbar`**, sans toucher aux deux autres.

Approches écartées : réutiliser littéralement le layout école avec des liens conditionnels (le layout école redirige justement `isTeacherOnly` vers `/espace-enseignant` ; couplage fragile) ; restyler le shell léger actuel (pas de sidebar/navbar = ne répond pas à la demande).

## 1. Shell

- **Desktop** : `TeacherSidebar` à gauche — même `SIDEBAR_WIDTH`, repliable (`useSidebarCollapse`), fond `bg-sidebar-dark`, `SidebarUserProfile` en bas (avatar + menu : Paramètres, Déconnexion). `TeacherTopbar` en haut : fil d'ariane, badge année scolaire, indicateur hors-ligne, menu d'aide — mêmes widgets que le topbar école, moins ce qui n'a pas de sens pour un enseignant (à trancher au plan : notifications si l'endpoint est accessible aux comptes enseignants, sinon omis pour cette phase).
- **Mobile** : sidebar en drawer (même overlay/animation que le layout école) + `MobileBottomNav` générique décliné avec les liens enseignant. **`TeacherBottomNav` est supprimé.**
- Le layout `(teacher)/espace-enseignant/layout.tsx` reproduit la structure de `(school)/layout.tsx` (gate `useUser`, drawer, collapse) — la redirection actuelle des non-enseignants reste.
- Thèmes/couleurs : automatiques via les tokens `@theme` dès qu'on utilise les composants existants. Aucun hex en dur.

## 2. Navigation

Entrées du `TeacherSidebar` :
- Accueil (`/espace-enseignant`)
- Mes classes (`/espace-enseignant/classes`)
- Emploi du temps (`/espace-enseignant/emploi-du-temps`)
- Paramètres (`/espace-enseignant/parametres`) — aussi dans le menu du profil sidebar.

`route-match.ts` : garder Accueil en exact-match, Mes classes/Emploi du temps/Paramètres en prefix-match (l'entrée `/espace-enseignant` exacte existe déjà depuis Phase 2).

i18n : réutiliser `teacherPortal.nav.*` (home/classes/timetable/ariaLabel existent) + ajouter `settings` et les clés topbar/shell manquantes.

## 3. Accueil = dashboard enseignant

Quatre blocs (tous validés) :
1. **Cours d'aujourd'hui** — les séances du jour (dérivées de `thisWeekSessions` par date), heure, matière, classe, salle. En premier.
2. **Stats de ses classes** — cartes de synthèse façon dashboard admin : nb de classes (distinctes homeroom + matières), nb de matières enseignées, nb d'élèves au total. Style : cartes compactes uniformes, PAS de stat tiles colorées (mémoire « Cartes : look simple obligatoire »).
3. **Aperçu de la semaine** — mini-vue de la semaine en cours avec lien vers l'emploi du temps complet.
4. **Raccourcis d'actions** — accès rapides Mes classes / Emploi du temps.

**Extension API (additive)** : `GET /api/teacher/me` gagne un `studentCount` par entrée de `classSubjects` et `homeroomClasses` (comptage `Enrollment` sur l'`academicYearId` de la classe, même règle que les endpoints roster). Le total d'élèves du dashboard se calcule côté client en dédupliquant par `classId`. Aucun champ existant ne change (les 4 pages actuelles continuent de marcher pendant la transition).

## 4. Mes classes + fiche classe

- **Mes classes** : conserver les deux sections (Mes classes en titulariat / Mes matières) mais présentées en `CardGrid` (max 4 colonnes) avec les cartes compactes standard de l'app, `studentCount` affiché.
- **Fiche classe (rosters)** : tableau façon écran Élèves admin — conventions `LIST_PAGE`/`TABLE_SCROLL`/`STICKY_THEAD`, 20 par page, `Pager` compact, tableau qui défile dans sa zone. Colonnes : Nom, Prénom, Matricule. Pagination côté client (les rosters d'une classe restent petits ; les endpoints Task 3 renvoient déjà tout).
- Le fil d'ariane du topbar couvre le retour (le lien « Retour » actuel disparaît avec le nouveau shell).

## 5. Emploi du temps — grille admin en lecture seule

Réutiliser les vrais composants de vue de `components/school/timetable/` (semaine/agenda/mois, légende, navigation de semaine, sélecteur de vue) filtrés sur l'enseignant, en **mode lecture seule** :
- La page enseignant passe elle-même `teacherId` (déjà en place depuis le fix du 2026-08-31) à `GET /api/school/timetable` — seule source de données.
- **Pas d'appels aux endpoints verrouillés** : les pickers/filtres classe-enseignant-salle du toolbar admin chargent des listes via `/api/school/*` inaccessibles aux comptes enseignants → le toolbar enseignant est une version réduite (navigation de semaine + sélecteur de vue seulement). Si les composants de vue exigent des props issues de ces listes, on les alimente à partir des sessions reçues.
- Aucune création/édition : pas de `SessionFormModal`, pas de click-to-edit. Les composants de vue reçoivent un flag/omission de handler qui neutralise l'édition — modification minimale et additive de ces composants partagés (aucun changement de comportement côté admin).
- Export CSV : repris s'il est purement client et découplé des filtres admin, sinon hors périmètre.

## 6. Paramètres enseignant (`/espace-enseignant/parametres`)

Onglets : **Profil** (nom, avatar, changement de mot de passe — le ProfilTab école fait déjà tout ça), **Apparence** (ThemePicker), **Langue** (LanguagePicker).

Vérifié le 2026-08-31 : ces trois onglets ne consomment que `/api/auth/me` (PATCH), `/api/auth/change-password`, `/api/auth/set-password` — aucune route `/api/school/*`, donc déjà accessibles aux comptes enseignants. Travail = extraction/réutilisation des composants d'onglets existants de `(school)/settings/` (extraction vers un emplacement partagé si leurs props/contexte le permettent proprement, sinon déclinaison mince), avec le namespace `settings` existant. Pas d'onglets Établissement/Année scolaire/Administrateurs/Notifications/Zone dangereuse côté enseignant.

## Hors périmètre

- Aucun nouveau droit côté API au-delà du `studentCount` additif.
- Pas de nouvelles fonctionnalités métier (saisie de notes, présences enseignant…) — uniquement la refonte de présentation des écrans existants + paramètres personnels.
- Les shells admin/école ne changent pas (hors ajouts strictement additifs à des composants partagés, sans changement de comportement existant).

## Contraintes transverses

- Tokens `@theme` uniquement, pas de hex en dur ; cartes compactes uniformes sans couleurs par carte.
- i18n fr/ht/en complet pour toute nouvelle chaîne (namespaces `teacherPortal`/`teacherClasses`/`teacherTimetable` étendus, registres `locales.ts`/`request.ts`/`next-intl.d.ts` mis à jour ensemble — le compte annoncé dans CLAUDE.md doit être re-vérifié en live au merge, leçon récurrente).
- Pas de tirets cadratins dans les chaînes visibles.
- `pnpm format && lint && typecheck && test` verts avant tout commit.
- Route Handlers : `export const runtime = 'nodejs'` (seul `/api/teacher/me` est touché, déjà conforme).

## Tests

- Extension `/api/teacher/me` : tests Vitest étendus (studentCount correct, scoping inchangé).
- Composants timetable partagés modifiés : les tests existants restent verts ; le mode lecture seule est vérifié par typecheck + revue (convention du projet : pas de tests de rendu pour les pages présentationnelles).
- Vérification manuelle navigateur (desktop + 375px) avec le compte `carline.michel@lesetoiles.edu.ht` avant toute promotion vers `main` — dette déjà tracée en Phase 2, qui s'applique aussi ici.
