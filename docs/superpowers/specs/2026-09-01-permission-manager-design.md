# Gestionnaire de rôles & permissions (RBAC école) — Design

Date : 2026-09-01
Statut : validé en discussion (choix utilisateur enregistrés), en attente de relecture de cette spec
Écrans Banani sources : flow `2oB_n5kLBeuy` — « Permission Manager » (`Sr4sWYaoaPZ0`), « Create Role » (`OlsuHWlZ3rkJ`)

## 1. Objectif

Permettre à une école de définir des rôles personnalisés pour son personnel
(Comptable, Secrétaire, Surveillant, …) et de contrôler, module par module et
action par action, ce que chaque rôle autorise. Un utilisateur connecté voit
automatiquement — sidebar, pages, boutons — uniquement ce que son rôle
permet, et le serveur refuse tout appel hors de ses droits.

## 2. Décisions produit (verrouillées avec l'utilisateur, 2026-09-01)

1. **Périmètre : staff école uniquement.** Les rôles personnalisés
   s'appliquent aux comptes `OrganizationMember` de rôle org `MEMBER`.
   `OWNER` et `ADMIN` restent accès total : affichés dans l'UI comme deux
   « rôles système » (Propriétaire, Administrateur) épinglés, matrice en
   lecture seule tout-activé, non modifiables, non supprimables. Les
   portails enseignant (`/espace-enseignant`, `/api/teacher/*`) et élève ne
   sont pas touchés : leur scoping propre (deny-by-default portal-only,
   ownership par `ClassSubject.teacherId`, etc.) reste la seule règle qui
   les gouverne.
2. **Moteur : fait maison typé, zéro dépendance.** Pas de Casbin (chargement
   de politiques à chaque cold start Vercel, adaptateur DB, cache
   multi-instances incohérent), pas de CASL (sur-ingénierie pour une matrice
   booléenne fixe). Les permissions sont des données (`grants String[]` sur
   le rôle), la vérification est un helper TypeScript partagé.
3. **Refus par défaut.** Un `MEMBER` sans rôle assigné ne voit que son
   profil et ses paramètres personnels. Conséquence de déploiement assumée :
   les comptes MEMBER staff existants perdent l'accès au déploiement jusqu'à
   attribution d'un rôle (à faire immédiatement après la mise en ligne).
4. **Attribution des rôles : onglet Administrateurs.** Colonne « Rôle »
   (select) pour les lignes MEMBER ; « Accès complet » statique pour
   OWNER/ADMIN. Pas d'écran d'assignation séparé en v1.
5. **Application complète côté serveur en v1** (pas de v1 « visuelle ») :
   chaque famille de routes `/api/school/*` vérifie la permission.

## 3. Modèle de données (Prisma, migration versionnée)

Nom du modèle : **`StaffRole`** (et non `SchoolRole` — ce nom est déjà pris
côté frontend par le type org `'OWNER' | 'ADMIN' | 'MEMBER'` exporté de
`SchoolPlanContext` ; réutiliser le même mot pour deux concepts différents
serait un piège).

```prisma
model StaffRole {
  id          String   @id @default(cuid())
  schoolId    String
  school      School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  name        String
  description String?
  grants      String[] @default([]) // "module.action", ex. "eleves.view"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  members     OrganizationMember[]

  @@unique([schoolId, name])
  @@index([schoolId])
}
```

`OrganizationMember` gagne :

```prisma
staffRoleId String?
staffRole   StaffRole? @relation(fields: [staffRoleId], references: [id], onDelete: SetNull)
```

Un membre a au plus un rôle. La suppression d'un rôle remet ses membres à `null` (⇒ refus par défaut) après confirmation explicite dans l'UI.

## 4. Vocabulaire des permissions — `frontend/src/lib/permissions.ts`

Module **pur, partagé client/serveur** (pas de `server-only`), source unique
de vérité :

- `PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'export']`
- `PERMISSION_MODULES` : registre ordonné, groupé en 4 sections :

| Section (UI) | Clé module | Couvre | Actions applicables |
|---|---|---|---|
| Général | `dashboard` | Tableau de bord, flux d'activité | view, export |
| Académique | `eleves` | Dossiers & inscriptions élèves | les 5 |
| Académique | `enseignants` | Personnel & affectations | les 5 |
| Académique | `notes` | Carnet de notes, évaluations, bulletins | les 5 |
| Académique | `appreciations` | Appréciations | les 5 |
| Académique | `presences` | Présences, absences, retards | les 5 |
| Académique | `emploiDuTemps` | Emploi du temps | les 5 |
| Finance | `paiements` | Scolarité : paiements, relances, config. frais | les 5 |
| Configuration | `configuration` | Classes, matières, niveaux, salles, modèle de bulletin | view, create, edit, delete |
| Configuration | `parametres` | Établissement, année scolaire, périodes | view, create, edit, delete |

- Type `PermissionGrant =` template literal `${ModuleKey}.${ActionKey}` ;
  seules les combinaisons applicables sont valides.
- Helpers : `hasGrant(grants, module, action)`, `sanitizeGrants(unknown[])`
  (ignore silencieusement les grants inconnus — compat avant/arrière),
  `allGrants()` (pour « tout cocher » et l'affichage des rôles système).
- Chaque module porte : `section`, `labelKey`/`subLabelKey` (i18n),
  `icon` (nom lucide) et `dotBg`/`dotFg` pour la pastille de la matrice
  (couleurs du design, via tokens/valeurs locales à l'écran — les couleurs
  de données ne sont pas thémées, conforme à la convention de l'app).

L'accès au gestionnaire de permissions lui-même n'est **pas** un module de
la matrice : il est réservé OWNER/ADMIN (évite l'auto-verrouillage).

## 5. Application côté serveur

Nouveau `frontend/src/lib/server/school-permissions.ts` :

- `resolveMyGrants(userId)` → `{ schoolId, orgRole, grants: 'ALL' | Set<PermissionGrant> } | null`
  (`'ALL'` pour OWNER/ADMIN ; `Set` — possiblement vide — pour MEMBER via
  son `staffRole.grants` ; `null` si pas d'école, mêmes règles que
  `resolveMySchool()`, portal-only inclus).
- `resolveMySchoolWithPermission(userId, module, action)` → soit le même
  contexte école que `resolveMySchool()`, soit une `NextResponse` :
  404 (pas d'école — convention anti-fuite inchangée) ou **403 code stable
  `PERMISSION_DENIED`** (membre authentifié de l'école mais sans le droit).

Câblage : dans chaque route `/api/school/*`, l'appel `resolveMySchool()`
devient `resolveMySchoolWithPermission(userId, <module>, <action>)` — une
ligne par handler. Mapping famille → module :

Le mapping est **par route**, pas par répertoire : les sous-ressources d'une
fiche mappent vers le module qui les possède (ex. `students/[id]/attendance`
→ `presences`, pas `eleves`).

| Routes | Module |
|---|---|
| `students` (liste, fiche, CRUD, invite) | `eleves` |
| `teachers` | `enseignants` |
| `evaluations` (+ `[id]/grades`), `bulletin-templates`, `students/[id]/results`, `students/[id]/bulletins`, `classes/[id]/bulletins` | `notes` |
| `students/[id]/appreciations`, `classes/[id]/appreciations` | `appreciations` |
| `attendance`, `students/[id]/attendance` | `presences` |
| `timetable` | `emploiDuTemps` |
| `fees` | `paiements` |
| `classes`, `class-subjects`, `grade-levels`, `rooms`, `subjects` | `configuration` |
| `academic-year`, `academic-year-rollover`, `terms`, `reset-year` | `parametres` |
| `dashboard`, `activity` | `dashboard` |
| `GET /api/school` (bootstrap) et `GET /api/school/billing/plan` (snapshot du shell, porte `role` + `permissions`) | liste blanche : accessibles à tout membre — l'écran Paramètres personnels et le shell en dépendent |
| `billing`, `export` (ZIP Zone Dangereuse, déjà OWNER-only) | inchangés |

Action par méthode : GET → `view`, POST → `create`, PATCH/PUT → `edit`,
DELETE → `delete` ; les endpoints d'export CSV → `export`. Cas
particuliers réglés au plan d'implémentation (ex. `PUT .../grades` = `edit`
sur `notes` ; le verrou `gradeEntryEnabled` par période reste inchangé et
s'additionne).

Le plan d'implémentation inventorie **chaque fichier route** un par un ;
aucune route `/api/school/*` ne reste sur `resolveMySchool()` nu, et un test
tripwire le verrouille (grep des routes school → doit utiliser le helper
permission sauf liste blanche explicite : bootstrap, billing).

## 6. Côté client — « automatique dès la connexion »

- Le snapshot du shell `GET /api/school/billing/plan` (déjà consommé par
  `SchoolPlanProvider` sur chaque page école, et qui porte déjà `role`)
  renvoie en plus `permissions: 'ALL' | PermissionGrant[]`.
- `SchoolPlanContext` expose `permissions` ; nouveau hook `usePermissions()`
  par-dessus : `can(module, action)`, `canSee(module)`. (Le portail
  enseignant n'a pas de `SchoolPlanProvider` : zéro impact.)
- **Sidebar** : `NavItem` gagne `module?: ModuleKey` ; nouvelle passe
  `filterSectionsByPermissions(sections, perms)` appliquée en plus du filtre
  `minRole` existant (Abonnement inchangé). `perms === null` (chargement) ne
  masque rien, même convention que le filtre rôle actuel.
- **Pages** : chaque page école vérifie `canSee(module)` et affiche un état
  « Accès non autorisé » propre (pas de page blanche) si on y arrive par URL
  directe. Les boutons Créer / Modifier / Supprimer / Exporter et les menus
  d'action sont conditionnés par `can()`.
- Le code `PERMISSION_DENIED` de l'API est traduit en message clair (switch
  sur `ApiError.code`, jamais sur le message).

## 7. Écrans (pixel-perfect Banani → design system SchoolGesti)

Traduction, pas collage : tokens de thème SchoolGesti (`bg-secondary`,
`text-primary`, …) au lieu du teal Banani ; shell réel (sidebar/topbar de
l'app) au lieu du mock ; composants existants (`Card`, `Button`, `Badge`,
`Switch`, `Modal`, `ConfirmContext`) ; aucun tiret cadratin dans les textes
(« · » ou ponctuation classique) ; mobile-first.

### 7.1 `/settings/permissions` — Gestion des permissions

- Précédent de routage : `/settings/nouvelle-annee` (sous-page de
  Paramètres). Accès OWNER/ADMIN (client + serveur) ; lien d'entrée depuis
  l'onglet Administrateurs.
- **Panneau Rôles** (gauche, 240px desktop) : rôles système Propriétaire et
  Administrateur épinglés (badge « Système », compteurs réels), puis les
  rôles personnalisés triés par nom, compteur de membres par rôle, bouton
  « + », note « Les modifications s'appliquent immédiatement aux
  utilisateurs ayant ce rôle. ». Mobile : le panneau devient un select
  pleine largeur au-dessus de la matrice.
- **Carte résumé du rôle** : icône, nom, badge « N utilisateurs »,
  description, « Modifié le {date} » (locale de l'UI), actions Modifier
  (nom/description — réutilise la modal de création en mode édition) et
  Supprimer.
- **Matrice** : table Module × (Voir, Créer, Modifier, Supprimer, Exporter)
  avec en-têtes à icônes, lignes groupées par sections (Général, Académique,
  Finance, Configuration) issues du registre, pastille colorée par module,
  interrupteurs (`Switch`). Cellules non applicables : vides (pas de
  switch). Rôles système : interrupteurs tout-activé désactivés (lecture
  seule). La table défile horizontalement dans son conteneur sur mobile
  (convention `TABLE_SCROLL`).
- **Barre de pied** : « Rôle : {name} · {n} utilisateurs concernés ·
  Dernière mise à jour le {date} », actions Supprimer ce rôle (danger,
  confirmation avec rappel du nombre de membres qui repasseront en refus par
  défaut), Annuler (reset de l'état local), Enregistrer (PATCH des grants ;
  toast ; état « modifications non enregistrées » suivi localement).
- « Dupliquer le rôle » : POST d'un nouveau rôle avec les grants du rôle
  courant et un nom « {name} (copie) », qui devient sélectionné.
- États : chargement (skeleton), erreur réseau, école sans rôle
  personnalisé (matrice affichée sur un rôle système + invitation à créer le
  premier rôle).

### 7.2 Modal « Créer un rôle » (Étape 1/2)

Badges « Nouveau rôle » / « Étape 1/2 », nom (requis, exemples en hint),
description (optionnelle), carte aperçu (« Permissions à définir plus
tard », « Actif »), note de pied « La gestion des permissions se fera dans
l'écran de la matrice après la création. », Annuler / Créer le rôle. À la
création : le rôle (grants vides) devient sélectionné dans la matrice —
c'est l'étape 2. Erreur nom dupliqué : message inline (code stable
`ROLE_NAME_TAKEN`). Le même formulaire sert en mode « Modifier »
(nom/description seulement).

### 7.3 Onglet Administrateurs — colonne « Rôle »

Pour chaque ligne : OWNER/ADMIN → texte statique « Accès complet » ;
MEMBER → select des rôles de l'école + option « Aucun rôle (aucun accès) »,
PATCH immédiat avec toast. Lien « Gérer les rôles et permissions » vers
`/settings/permissions`.

## 8. API (nouvelles routes — toutes `runtime='nodejs'`, `withRequestContext`, `requireAuth`, `verifyCsrf` sur mutations, `hasMinRole('ADMIN')`)

- `GET /api/school/roles` → `{ roles: [{ id, name, description, grants, memberCount, updatedAt }], systemCounts: { owners, admins } }`
- `POST /api/school/roles` — body `{ name, description?, grants? }`
  (grants pour la duplication), 409 `ROLE_NAME_TAKEN` sur doublon
  (contrainte unique + catch P2002).
- `PATCH /api/school/roles/[id]` — `{ name?, description?, grants? }`,
  grants passés par `sanitizeGrants`. 404 anti-fuite si le rôle n'est pas de
  l'école du caller.
- `DELETE /api/school/roles/[id]` — les membres repassent à `staffRoleId =
  null` (comportement du `SetNull`).
- Attribution : il n'existe aujourd'hui aucune route de gestion des
  membres (l'onglet Administrateurs est en lecture seule sur le payload de
  `GET /api/school`). Nouvelle route `PATCH /api/school/members/[userId]`
  acceptant `{ staffRoleId: string | null }`, pour les membres MEMBER
  uniquement (400 pour OWNER/ADMIN), min-role ADMIN. Le payload `members`
  de `GET /api/school` gagne `staffRoleId`.

## 9. i18n

Nouveau namespace `permissions` (fr/en/ht — ht avec `_review`) : écrans 7.1
et 7.2, libellés des modules/sections/actions (consommés depuis le registre
via `labelKey`), messages d'erreur (`PERMISSION_DENIED`, `ROLE_NAME_TAKEN`),
état « Accès non autorisé » réutilisable. Ajouts à `settings.json` pour la
colonne Rôle de l'onglet Administrateurs. Enregistrement dans
`MESSAGE_NAMESPACES`, `src/i18n/request.ts`, `src/types/next-intl.d.ts`
(`locales.test.ts` verrouille la parité).

## 10. Tests

- `permissions.test.ts` : registre cohérent (pas de doublon, actions
  applicables), `hasGrant`, `sanitizeGrants` (grants inconnus ignorés),
  template-literal types compilent.
- `school-permissions.test.ts` : OWNER/ADMIN → ALL ; MEMBER avec rôle →
  grants exacts ; MEMBER sans rôle → refus ; portal-only → null (inchangé) ;
  `resolveMySchoolWithPermission` renvoie 403 `PERMISSION_DENIED` /
  404 / contexte selon les cas.
- Routes `roles` : CRUD complet, CSRF, min-role ADMIN, 404 anti-fuite
  cross-école, P2002 → `ROLE_NAME_TAKEN`, delete → members SetNull.
- Une famille de routes témoin re-testée avec le nouveau guard (ex.
  `students`) : MEMBER sans grant → 403, avec grant → 200, OWNER inchangé.
- Tripwire : test qui parcourt `app/api/school/**/route.ts` et échoue si un
  handler utilise `resolveMySchool(` hors liste blanche (bootstrap,
  billing, export Zone Dangereuse) — même mécanique que
  `runtime-enforcement.test.ts`.
- Filtre sidebar : `filterSectionsByPermissions` (unit, à côté de
  `role-filter.test.ts`).

## 11. Déploiement & migration

- Migration versionnée (`pnpm db:migrate:dev` → `db:migrate:deploy` en CI).
- Purement additif côté schéma ; **impact fonctionnel** : les MEMBER staff
  existants perdent l'accès jusqu'à attribution d'un rôle. Procédure
  post-déploiement : créer les rôles, les attribuer depuis l'onglet
  Administrateurs. Les comptes portal-only (enseignants liés) sont déjà
  hors `/api/school/*`, aucun changement pour eux.
- CLAUDE.md : ajouter un paragraphe décrivant le sous-système (registre,
  helper serveur, convention « toute nouvelle route school passe par
  `resolveMySchoolWithPermission` »).

## 12. Hors périmètre v1

Portails enseignant/élève, back-office SUPERADMIN (`/admin`), facturation
(`billing`, reste ADMIN-only), historique d'audit des changements de
permissions, permissions par champ, multi-rôles par membre.
