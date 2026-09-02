# Multi-espaces (multi-casquettes) — Design

Statut : approuvé en conversation le 2026-09-01, en attente de relecture de la spec.
Prérequis : permission manager RBAC (spec `2026-09-01-permission-manager-design.md`, livré).

## 1. Objectif

Une même personne peut cumuler plusieurs casquettes dans une école : enseignant,
staff administratif (rôle staff : Comptable, Secrétaire, ...), direction
(OWNER/ADMIN), voire tuteur d'un élève. Aujourd'hui un compte lié à un profil
enseignant est verrouillé hors de l'app école (`resolveMySchool()`
deny-by-default), donc un rôle staff qui lui est assigné ne s'applique jamais.
Objectif : **un seul compte, plusieurs espaces**, avec le choix de l'espace à la
connexion et la bascule à tout moment.

## 2. Décisions verrouillées (2026-09-01)

1. **Un compte enseignant devient « double profil » quand un rôle staff avec au
   moins un droit lui est assigné.** Sans rôle staff, un enseignant reste
   verrouillé hors de l'app école comme aujourd'hui. Ce qu'un double profil
   voit dans l'app école est exactement ce que ses grants permettent (RBAC
   existant, rien de plus).
2. **Les comptes élève/parent ne reçoivent jamais de rôle staff.** (Par
   construction : les élèves n'ont pas de ligne `OrganizationMember`, donc ils
   n'apparaissent pas dans l'onglet Administrateurs.)
3. **Page intermédiaire seulement pour les multi-casquettes.** Un compte
   mono-espace atterrit directement dans son espace (zéro friction, l'onglet du
   login est ignoré pour lui). Un compte multi-espaces atterrit sur
   « Choisissez votre espace » (une carte par casquette), l'onglet du login
   pré-sélectionnant la carte correspondante.
4. **Bascule sans déconnexion** : un sélecteur « Mes espaces » dans le menu
   utilisateur de chaque shell (école, enseignant, élève) liste les espaces du
   compte et permet de traverser dans les deux sens.
5. **Même logique pour un directeur-enseignant** (OWNER/ADMIN + profil prof) :
   deux cartes, deux espaces, même sélecteur.
6. Le message d'erreur « mauvais onglet » envisagé initialement est abandonné :
   ce flow rend le cas impossible (mono-casquette = onglet ignoré,
   multi-casquettes = page de choix).
7. **Un membre peut cumuler plusieurs rôles staff** (ajout du 2026-09-01,
   amende la décision « un membre a au plus un rôle » de la spec permission
   manager). Ses droits effectifs sont l'**union** des grants de tous ses
   rôles. Corollaire : le système d'espaces s'adapte à tout nouveau rôle créé
   sans câblage particulier (l'espace Administration découle de « au moins un
   droit », jamais d'un rôle nommé).

## 3. Le modèle : trois espaces par compte

Un « espace » est une interface complète servie par la même app :

| Espace | URL d'entrée | Éligibilité du compte |
|---|---|---|
| Administration école | `/dashboard` | `OrganizationMember` OWNER/ADMIN, **ou** MEMBER dont l'union des grants de ses rôles staff est non vide |
| Espace enseignant | `/espace-enseignant` | `Teacher.userId` lié (quel que soit le rôle org) |
| Espace élève/parent | `/eleve` | `Student.userId` lié + gardes existantes d'`isStudentOnly` (User.role USER, pas de membership org) |

Source de vérité serveur : un helper `resolveMySpaces(userId)` dans
`frontend/src/lib/server/school.ts` (ou module voisin) renvoyant
`{ school: boolean; teacher: boolean; student: boolean }`, calculé à partir des
mêmes requêtes que `/api/auth/me` fait déjà (membership + staffRole.grants +
Teacher/Student links) — pas de nouvelle table, pas de duplication de règles.

## 4. Déblocage serveur — `resolveMySchool()`

Fichier : `frontend/src/lib/server/school.ts` (non protégé par CLAUDE.md, mais
sensible : c'est le verrou du portail).

Règle actuelle : `role === 'MEMBER' && isPortalOnlyAccount()` → `null`.

Nouvelle règle, en distinguant la nature du lien :

- lien **Student** → `null`, toujours (aucun déblocage possible).
- lien **Teacher** seul → `null` **sauf si** l'union des grants des rôles
  staff du membership est non vide → contexte école normal (les routes school
  appliquent ensuite `requireSchoolPermission` comme pour tout staff).
- pas de lien portail → comportement actuel inchangé.

Implémentation : `findMembership()` sélectionne en plus les rôles staff du
membre avec leurs `grants`; le test du verrou devient une fonction pure
testable. Aucun changement aux routes school elles-mêmes : le RBAC (tripwire
RBAC-01) fait déjà toute l'autorisation module par module.

### Cas particulier hérité : `GET /api/school/timetable`

Aujourd'hui un MEMBER lié enseignant y reçoit une vue scopée à ses propres
séances. Raffinement pour les doubles profils : **si le caller détient le grant
`emploiDuTemps.view`, la vue pleine école prime** (le rôle donne ce qu'il
accorde); sinon le scoping enseignant s'applique comme aujourd'hui. Une
condition dans la garde manuelle existante de cette route, plus un test.

## 5. `/api/auth/me` — `spaces` + `isTeacherOnly` resserré

- Nouveau champ additif : `spaces: { school, teacher, student }` (via
  `resolveMySpaces`). Consommé par le login, la page `/espaces` et le
  sélecteur.
- `isTeacherOnly` est **resserré** à son sens littéral : lié enseignant **et**
  aucun espace école (`spaces.teacher && !spaces.school`). Effets automatiques,
  sans toucher leurs consommateurs :
  - `(school)/layout.tsx` ne rebondit plus un double profil hors de l'app école
    (il ne rebondit que les « purement enseignants »).
  - Le login n'envoie plus d'office un double profil vers `/espace-enseignant`.
- `isStudentOnly` : inchangé.
- `teacherProfile` interne de `/me` : son calcul actuel est gaté
  `role === 'MEMBER'`; le calcul de `spaces.teacher` utilise le lien
  `Teacher.userId` directement (un directeur-enseignant a `spaces.teacher`
  true). Les routes `/api/teacher/*` fonctionnent déjà pour lui (vérifié :
  elles ne gatent pas sur le rôle org).

## 6. Connexion et page « Choisissez votre espace »

- `login/page.tsx` : après `refresh()`, router selon `me.spaces` :
  - plateforme (User.role ADMIN/SUPERADMIN) → `/admin` (inchangé, prioritaire);
  - 1 seul espace true → son URL directement;
  - ≥ 2 espaces true → `/espaces?pref=<onglet choisi>`;
  - 0 espace (compte sans école ni lien) → `/dashboard` (comportement actuel :
    l'écran « pas d'école » existant).
- Nouvelle page **`/espaces`** (`frontend/src/app/espaces/page.tsx`, hors des
  groupes `(school)`/`(teacher)` — shell minimal type page auth) :
  - auth requise; lit `me.spaces`;
  - 1 seule carte disponible → redirection immédiate (la page est sûre en
    favori);
  - une carte par espace : icône, titre, sous-titre, bouton « Entrer »;
  - `?pref=` (admin|teacher|student, issu de l'onglet du login) met la carte
    correspondante en avant (ordre/accent), sans bloquer les autres;
  - mobile-first, tokens du thème, aucun tiret cadratin.
- Les onglets du login restent visuellement tels quels; leur seul rôle devient
  la pré-sélection de `/espaces` (et zéro effet pour un mono-espace).

## 7. Sélecteur « Mes espaces »

- Composant partagé `SpaceSwitcher` (`frontend/src/components/layout/`)
  alimenté par `useUser().spaces` : liste les espaces disponibles, coche
  l'espace courant, navigue par `router.push`.
- Intégré au menu utilisateur des trois topbars (école, enseignant, élève).
  Masqué quand le compte n'a qu'un espace.
- L'entrée `/espaces` du sélecteur n'est pas nécessaire : les liens vont
  directement aux URL d'entrée.

## 8. Plusieurs rôles staff par membre (schéma + API + UI)

- **Schéma** : `OrganizationMember.staffRoleId` (1-à-N) est remplacé par une
  relation plusieurs-à-plusieurs implicite Prisma
  (`OrganizationMember.staffRoles StaffRole[]` ⇄ `StaffRole.members
  OrganizationMember[]`). Migration versionnée : création de la table de
  jointure, reprise des assignations existantes (`INSERT ... SELECT` depuis
  `staffRoleId`), puis suppression de la colonne. La suppression d'un rôle
  retire ses lignes de jointure : les membres **conservent leurs autres
  rôles** (plus de SetNull); un membre sans plus aucun rôle repasse en refus
  par défaut.
- **Résolution des droits** : `resolveGrantsFor` fait l'union des `grants` de
  tous les rôles du membre (toujours re-sanitisée). `GET /api/school` expose
  `staffRoleIds: string[]` par membre (remplace `staffRoleId`).
- **API** : `PATCH /api/school/members/[userId]` prend
  `{ staffRoleIds: string[] }` (liste complète, remplace l'existante; `[]` =
  aucun rôle). 404 anti-fuite si un id n'appartient pas à l'école; toujours
  réservé aux cibles MEMBER.
- **UI onglet Administrateurs** : la colonne « Rôle » devient « Rôles » : un
  bouton compact ouvrant un popover à cases à cocher (un item par rôle de
  l'école); la cellule affiche les noms des rôles cochés (ou « Aucun rôle »).
  Le compteur « N utilisateurs » des écrans de rôles compte les membres liés
  (inchangé sémantiquement via la jointure).
- Assigner des rôles à un MEMBER lié enseignant devient **opérant** (double
  profil). Le garde-fou envisagé précédemment (blocage) est remplacé par une
  mention informative sur ces lignes (petit badge « Enseignant »), pour que
  l'admin comprenne qu'il crée un double profil.
- Rien à faire pour les élèves/parents : jamais membres de l'org.

## 9. i18n

Namespace `spaces` (fr/en/ht, ht `_review`), enregistré `Spaces` (convention
casse existante) : titres/sous-titres des trois cartes, « Choisissez votre
espace », « Entrer », libellés du sélecteur « Mes espaces », badge
« Enseignant » de l'onglet Administrateurs. Les nouvelles chaînes du popover
multi-rôles vivent dans `Permissions.adminsTab` (namespace existant de cet
onglet). Parité de clés vérifiée par `locales.test.ts` (37 namespaces).

## 10. Tests

- `resolveMySchool` : lié enseignant sans rôle staff → null; avec rôles à
  grants vides → null; avec ≥ 1 grant (union) → contexte; lié élève + rôle
  staff → null; OWNER/ADMIN lié enseignant → contexte (inchangé).
- `resolveGrantsFor` : union de 2 rôles (recouvrement partiel → dédupliqué,
  ordre du registre); membre multi-rôles dont un rôle supprimé → droits des
  rôles restants.
- `resolveMySpaces` : les 6 combinaisons notables (mono ×3, prof+staff,
  directeur+prof, aucun espace).
- `PATCH /members/[userId]` : remplacement complet de la liste; `[]` vide
  tout; id d'une autre école → 404.
- `/api/auth/me` : `spaces` présent; `isTeacherOnly` false pour un double
  profil, true pour un prof pur.
- Timetable GET : MEMBER prof avec `emploiDuTemps.view` → vue pleine école;
  sans → scopée (test existant conservé).
- E2E manuel : Jean (prof + Comptable) → login → `/espaces` → 2 cartes →
  Administration → sidebar réduite à ses modules → sélecteur → Espace
  enseignant → retour.

## 11. Hors périmètre (assumé)

- Sidebar fusionné unique (les espaces restent des interfaces distinctes).
- Mémorisation du « dernier espace visité ».
- Invitation de membres du personnel (chantier séparé, voir conversation du
  2026-09-01).
- Rôles staff pour les comptes élève/parent (exclu par décision).
