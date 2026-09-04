# Module Personnel + connexion par nom d'utilisateur — Design

Statut : approuvé en conversation le 2026-09-04, en attente de relecture de la spec.
Prérequis : permission manager RBAC (`2026-09-01-permission-manager-design.md`, livré),
multi-espaces (`2026-09-01-multi-espaces-design.md`, livré), et l'onglet
Administrateurs avec invitations par email (commit `d1444f4`, 2026-09-04 :
`POST /api/school/members`, `InviteMemberModal.tsx`, `members/[userId]/invite/`,
`DELETE members/[userId]`) qui sert de fondation au chemin « email » — voir §12.

## 1. Objectif

Deux manques, résolus ensemble :

1. **Créer un membre du personnel n'a pas de vrai point d'entrée.** Un enseignant se
   crée dans Enseignants, un administratif s'« invite » depuis un onglet de Paramètres,
   et rien ne gère le compte (identifiants, mot de passe) après coup. Objectif : **un
   module « Personnel »** unique (liste, fiche, création), qui couvre enseignants et
   personnel administratif, câblé sur la gestion des rôles existante, et qui gère le
   compte de chacun.
2. **Tout le monde n'a pas d'email.** Dans beaucoup d'écoles (Haïti, Afrique
   francophone) une partie du personnel n'a pas d'adresse email. Objectif : un compte
   peut se connecter **par email ou par nom d'utilisateur**, sur le même écran de
   connexion. Un compte « nom d'utilisateur » ne reçoit aucun email ; son mot de passe
   initial est généré et remis de vive voix, et il peut le changer lui-même une fois
   connecté.

## 2. Décisions verrouillées (2026-09-04)

1. **Un seul écran de connexion.** Le champ email devient « Email ou nom
   d'utilisateur ». Pas d'onglet ni de second écran ; le serveur reconnaît le format.
2. **Un compte peut porter les deux identifiants.** `email` et `username` sont chacun
   optionnels, au moins un des deux est obligatoire. Quand les deux existent, l'un ou
   l'autre permet de se connecter.
3. **Mot de passe initial généré automatiquement**, affiché une seule fois à l'admin
   juste après la création, jamais renvoyé ni stocké en clair. Pas de saisie manuelle.
4. **Mot de passe oublié d'un compte sans email = réinitialisation par un admin**, qui
   génère un nouveau mot de passe et le transmet. Pas de question de sécurité, pas de
   SMS.
5. **Périmètre : tout le monde.** Employés administratifs, enseignants et élèves
   reçoivent la possibilité « nom d'utilisateur » dans la même passe.
6. **Les enseignants sont des employés.** Enseignants et personnel administratif
   sont gérés dans **un seul module « Personnel »** qui remplace l'entrée Enseignants
   de la sidebar et l'onglet Administrateurs de Paramètres.
7. **Fusion au niveau interface seulement.** `Teacher` et `OrganizationMember`
   restent deux tables séparées, avec toute leur logique existante (multi-espaces,
   verrouillage du portail enseignant, RBAC, emploi du temps). La liste et la fiche
   les regroupent à l'écran ; une personne peut avoir l'un, l'autre, ou les deux.
8. **Le mode de connexion n'est pas figé.** Un compte créé par nom d'utilisateur peut
   recevoir un email plus tard (et inversement) depuis l'onglet Compte de sa fiche.

## 3. Périmètre

Dans le périmètre :

- Modèle `User` : `email` optionnel, nouveau `username`.
- Connexion par identifiant unique (email ou nom d'utilisateur).
- Module Personnel : liste fusionnée, fiche à onglets adaptatifs, création unifiée,
  onglet Compte (identifiants, réinitialisation, renvoi d'invitation).
- Accès par nom d'utilisateur pour un enseignant existant (fiche Personnel) et pour un
  élève (bloc Accès de la fiche élève).
- Retrait de l'entrée Enseignants (redirections) et de l'onglet Administrateurs.

Hors périmètre (explicitement) :

- Fusion des tables `Teacher`/`OrganizationMember`.
- Changement de nom d'utilisateur par l'employé lui-même (seul le mot de passe est
  en libre-service, via Paramètres › Profil, déjà livré).
- Authentification à deux facteurs, SMS, question secrète.
- Comptes parents, import en masse d'identifiants.
- La page Rôles (`/settings/permissions`) reste où elle est : les rôles se
  configurent là, ils s'**assignent** dans la fiche Personnel.

## 4. Modèle de données

```prisma
model User {
  email    String? @unique   // était String @unique
  username String? @unique   // nouveau
  ...
}
```

- Postgres accepte plusieurs `NULL` sous un index unique : rien de spécial à faire.
- **Invariant applicatif** (pas de CHECK en base) : `email != null || username != null`.
  Vérifié à la création et à chaque modification d'identifiants
  (`NO_LOGIN_IDENTIFIER`). Un compte OAuth garde forcément un email.
- **Format du nom d'utilisateur** : 3 à 30 caractères, `[a-z0-9._-]`, commence par une
  lettre, stocké en minuscules (normalisé à la saisie et à la connexion). Le jeu de
  caractères exclut `@`, ce qui garantit qu'un nom d'utilisateur n'est jamais confondu
  avec un email. Unicité **globale** (niveau `User`, comme l'email), pas par école.
  Helper pur `frontend/src/lib/username.ts` (`normalizeUsername`, `USERNAME_REGEX`,
  `zUsername`), partagé client/serveur — `zod-helpers.ts` est protégé et n'est pas
  touché.
- `Teacher.email` et `Student.email` sont déjà `String?` : aucun changement.
- `emailVerifiedAt` garde son sens pour les emails ; il reste `null` sur un compte
  sans email, et le login ne le consulte que si `email != null`.
- Migration : `37_user_username` (rend `email` nullable, ajoute `username`). Aucune
  donnée à migrer.

## 5. Authentification

### 5.1 Connexion

`POST /api/auth/login` accepte `{ identifier, password }` (le champ `email` est
renommé ; le client `login/page.tsx` suit).

1. Normalisation : `identifier.trim().toLowerCase()`.
2. Détection : contient `@` → chemin email (validation `zEmail` existante, lookup
   `where: { email }`) ; sinon → chemin username (validation `USERNAME_REGEX`, lookup
   `where: { username }`). Un identifiant invalide dans les deux formats suit le chemin
   « utilisateur inconnu » (dummy bcrypt puis `INVALID_CREDENTIALS`), jamais un 400
   distinct : pas de fuite d'énumération.
3. Rate limit par identifiant et lockout : les helpers existants
   (`createEmailLimiter`, `isLockedOut`, `recordFailure`, `recordSuccess`) sont keyés
   par une chaîne opaque ; on leur passe l'identifiant normalisé au lieu de l'email.
   Aucun changement dans `rate-limit-store.ts` (protégé).
4. L'étape `EMAIL_NOT_VERIFIED` ne s'applique que si `user.email != null`. Un compte
   username-seul est actif dès sa création.
5. Message d'erreur générique : « Identifiant ou mot de passe incorrect » (clé
   `Login.errors.INVALID_CREDENTIALS` mise à jour dans les 3 langues).

### 5.2 Changement dans un fichier protégé (confirmation requise avant édition)

`frontend/src/lib/server/auth.ts` — `TokenPayload.email: string` devient
`string | null`. C'est l'unique retouche à un fichier protégé ; `createAccessToken`
passe la valeur telle quelle. Le plan d'implémentation commence par un audit
(`grep`) de tous les lecteurs de `TokenPayload.email` / `auth.user.email`
(Sentry scope, logs, `GET /api/auth/me`, templates de notification) pour tolérer
`null`. Aucune autre fonction d'`auth.ts` n'est modifiée.

### 5.3 Mot de passe généré

Nouveau helper `frontend/src/lib/server/initial-password.ts` :
`generateInitialPassword()` → 12 caractères tirés d'un alphabet sans ambiguïté
(pas de `0/O/1/l/I`), garantissant au moins une majuscule, une minuscule et un
chiffre, via `crypto.randomInt`. Le mot de passe est haché avec `hashPassword()`
(déjà exporté par `auth.ts`), renvoyé **une seule fois** dans la réponse HTTP de
l'action qui l'a créé, et n'apparaît dans aucun log (le logger redige déjà les
champs `password*` ; le champ de réponse s'appelle `temporaryPassword` et le plan
vérifie qu'il est couvert par la redaction).

### 5.4 Mot de passe oublié

Le flux `/forgot-password` reste par email. Le texte de la page précise qu'un
compte sans email doit s'adresser à l'administration de l'école. Un email ajouté
après coup à un compte username doit être vérifié (flux de vérification existant)
avant de servir à la connexion ou à la récupération ; la connexion par nom
d'utilisateur continue de fonctionner entre-temps.

## 6. Module Personnel

### 6.1 Navigation

- Sidebar : l'entrée « Enseignants » (`/enseignants`) devient **« Personnel »**
  (`/personnel`), même position, icône `Users`. Le module de permissions garde la clé
  interne `enseignants` (renommer la clé réécrirait le tableau `grants` de tous les
  `StaffRole` existants) ; seul son libellé change (« Personnel ») dans
  `permissions.ts` et dans la matrice de `/settings/permissions`.
- `/enseignants` et `/enseignants/[id]` → redirections permanentes vers
  `/personnel` et `/personnel/[id]`.
- Paramètres : l'onglet Administrateurs est retiré. Ce qu'il faisait (lister les
  membres, assigner des rôles, inviter) vit dans Personnel.
- Breadcrumb et `route-match.ts` mis à jour ; `breadcrumb.test.ts` suit.

### 6.2 Liste (`/personnel`)

Une ligne par **personne**, construite côté serveur en fusionnant :

- les `Teacher` de l'école (avec ou sans compte),
- les `OrganizationMember` de l'organisation (tous ont un compte),

dédoublonnés sur `userId` (une personne enseignante avec un rôle staff = une seule
ligne, deux badges). Les élèves n'apparaissent jamais (ils n'ont pas
d'`OrganizationMember`, et on ne lit pas `Student`).

Colonnes : Nom · Profils (badges « Enseignant », « Administrateur » ou nom des rôles
staff) · Compte (Aucun / En attente d'activation / Actif) · Connexion (Email /
Nom d'utilisateur / Les deux) · Actions. Filtre : **Tous · Enseignants · Personnel
administratif** ; recherche par nom, email, nom d'utilisateur. 20 par page, `Pager`
compact, `LIST_PAGE`/`TABLE_SCROLL`/`STICKY_THEAD` (cohérence UI app-wide).

Identifiant de ligne : `teacher.id` si la personne a un profil enseignant, sinon
`user.id` ; `GET /api/school/personnel/[id]` résout l'un ou l'autre (cuids
globalement uniques).

### 6.3 Fiche (`/personnel/[id]`)

En-tête : nom, badges de profils, statut du compte, mode de connexion.
Onglets, chacun affiché seulement s'il a un sens pour cette personne :

| Onglet | Visible si | Réservé à | Contenu |
|---|---|---|---|
| Infos | toujours | `enseignants.view` | identité, contact (formulaire enseignant existant, réutilisé) |
| Enseignement | profil `Teacher` | `enseignants.view` (édition : `.edit`) | classes, matières, affectations (onglet existant de la fiche enseignant, déplacé tel quel) |
| Accès & rôles | profil `OrganizationMember` | ADMIN+ | rôle d'organisation (Membre / Administrateur ; Administrateur réservé au OWNER), rôles staff (`MultiSelect` existant), résumé des droits |
| Compte | toujours | ADMIN+ (enseignant sans profil staff : `enseignants.edit`) | voir §6.5 |

Un bouton dans l'en-tête permet d'ajouter le profil manquant sans recréer de compte :
« Donner un accès enseignement » (crée le `Teacher` lié au `userId`) ou « Donner un
accès de gestion » (crée l'`OrganizationMember`, ADMIN+ seulement). C'est le cas
« double profil » du multi-espaces, déclenché depuis la fiche au lieu d'être
implicite.

### 6.4 Création (`/personnel/nouveau`)

Une page (pas un modal : trois blocs, trop dense pour un modal), même gabarit que le
wizard emploi du temps (`FormStepsBar`, `WizardNav`) :

1. **Identité** — prénom, nom, téléphone, email (optionnel). Mêmes champs que la
   création d'un enseignant aujourd'hui.
2. **Profils** — deux cases : « Enseigne dans l'établissement » (déplie matières /
   classes, existant) et « A accès à l'application de gestion » (déplie rôle
   d'organisation + rôles staff, comme le modal `InviteMemberModal`). Au moins une des
   deux. La seconde n'est proposée qu'à un ADMIN+ (un MEMBER avec `enseignants.create`
   crée un enseignant, pas un accès de gestion).
3. **Connexion** — trois choix :
   - **Pas de compte pour l'instant** (uniquement si profil enseignant seul : un
     enseignant peut exister sans accès, comme aujourd'hui).
   - **Par email** — exige un email au bloc 1 ; invitation par email (mécanique
     `createPortalInvite` existante, compte en attente jusqu'à l'activation).
   - **Par nom d'utilisateur** — champ pré-rempli par une suggestion
     `prenom.nom` (dédoublonnée `prenom.nom2`, …), modifiable, disponibilité vérifiée
     en direct (`GET /api/school/personnel/username-available?u=`). Compte créé
     **actif immédiatement**, mot de passe généré, aucun email.

À la validation, un seul appel `POST /api/school/personnel`, une seule transaction.
En mode nom d'utilisateur, la page se termine par le **panneau « Compte créé »**
(§6.6) ; en mode email par un toast « Invitation envoyée à … ».

### 6.5 Onglet Compte

Deux blocs :

- **Identifiants** — email (ajout / modification → vérification par email ;
  suppression refusée si c'est le seul identifiant), nom d'utilisateur (ajout /
  modification, disponibilité en direct ; suppression refusée si c'est le seul
  identifiant). Toute modification du nom d'utilisateur invalide les sessions
  (`tokenVersion++`), comme un changement de mot de passe.
- **Mot de passe** — selon l'état :
  - compte **en attente** (email, jamais activé) : « Renvoyer l'invitation »
    (route resend existante) ;
  - compte **sans email** : « Réinitialiser le mot de passe » → confirmation → nouveau
    mot de passe généré, `tokenVersion++`, panneau §6.6 ;
  - compte **avec email** actif : rappel que la personne passe par « Mot de passe
    oublié » ; pas de réinitialisation admin (l'admin ne doit pas pouvoir prendre la
    main sur un compte qui a un canal de récupération autonome).

### 6.6 Panneau « Compte créé » / « Mot de passe réinitialisé »

Composant unique `TemporaryPasswordPanel`, réutilisé à trois endroits (création
Personnel, accès enseignant existant, accès élève, réinitialisation) :
nom de la personne, nom d'utilisateur, mot de passe temporaire en monospace avec
bouton « Copier », bandeau d'avertissement « Ce mot de passe ne sera plus affiché.
Transmettez-le à la personne, elle pourra le changer dans ses paramètres. », bouton
« J'ai noté, fermer ». La valeur n'est jamais remise en cache ni dans l'URL.

### 6.7 Élèves

La fiche élève garde son bloc Accès ; il propose désormais deux actions côte à côte :
« Envoyer l'invitation » (existant, exige un email) et « Créer un accès par nom
d'utilisateur » (suggestion `prenom.nom`, panneau §6.6). Réinitialisation admin
disponible pour un compte élève sans email, gate `eleves.edit`. Les élèves ne sont
pas dans la liste Personnel.

## 7. API

Nouveau (préfixe `/api/school/`, tous `runtime = 'nodejs'`, CSRF sur les mutations) :

| Route | Autorisation | Rôle |
|---|---|---|
| `GET personnel` | `enseignants.view` | liste fusionnée, filtres `profile=all\|teacher\|staff`, `q`, pagination |
| `GET personnel/[id]` | `enseignants.view` (les blocs staff/compte ne sont renvoyés qu'à un ADMIN+) | détail fusionné |
| `POST personnel` | `enseignants.create` ; profil staff : ADMIN+ (OWNER si rôle ADMIN) | création unifiée (§6.4) |
| `GET personnel/username-available` | `enseignants.create` ou `.edit` | `{ available }`, sans révéler à qui appartient un nom pris |
| `POST personnel/[id]/profiles` | selon profil ajouté | ajoute le profil manquant (§6.3) |
| `POST teachers/[id]/access` | `enseignants.edit` | `{ mode: 'username', username }` pour un enseignant existant sans compte |
| `POST students/[id]/access` | `eleves.edit` | idem élève (pas d'`OrganizationMember`, comme l'invite) |
| `PATCH accounts/[userId]` | voir ci-dessous | `{ email?, username? }` (§6.5) |
| `POST accounts/[userId]/reset-password` | voir ci-dessous | uniquement si `email == null` ; renvoie `temporaryPassword` |

`accounts/*` résout d'abord à qui appartient le `userId` dans l'école (membre staff,
enseignant, élève) via un helper `resolveSchoolAccount(userId, mySchool)` et applique
la règle la plus stricte : membre staff → ADMIN+ (OWNER si la cible est ADMIN/OWNER ;
un ADMIN ne touche jamais au compte du OWNER) ; enseignant seul → `enseignants.edit` ;
élève → `eleves.edit`. 404 si le `userId` n'appartient pas à l'école.

Existant, conservé et étendu :

- `POST /api/school/members` (session parallèle) : reste le chemin « email » interne ;
  `POST personnel` l'appelle ou partage sa logique (`createPortalInvite`).
- `POST /api/school/members/[userId]/invite` (resend), `PATCH members/[userId]`
  (rôles) : inchangés, consommés par l'onglet Accès & rôles / Compte.
- `/api/school/teachers/*`, `/api/school/students/*` : inchangés ; l'onglet
  Enseignement et le bloc Affectations les consomment tels quels.
- `GET /api/auth/me` : `email` peut être `null`, `username` ajouté.

Tripwire RBAC-01 : `personnel/*`, `teachers/[id]/access`, `students/[id]/access`
passent par `requireSchoolPermission` ; `accounts/*` rejoint la whitelist aux côtés de
`members/` et `roles/` (autorisation par rang de rôle + résolution de compte, pas par
grant), avec un test témoin.

## 8. Codes d'erreur (stables, le client switche sur `ApiError.code`)

`NO_LOGIN_IDENTIFIER` (400) · `USERNAME_TAKEN` (409) · `EMAIL_ALREADY_IN_USE` (409,
existant) · `ALREADY_MEMBER` (409, existant) · `LAST_IDENTIFIER` (400, suppression du
seul identifiant) · `ACCOUNT_HAS_EMAIL` (400, réinitialisation admin refusée) ·
`PERMISSION_DENIED` (403) · `NOT_FOUND` (404 anti-fuite). Le format invalide d'un nom
d'utilisateur est un `VALIDATION_FAILED` (400) avec `field: 'username'`.

## 9. i18n

- Nouveau namespace `personnel` (38ᵉ entrée de `MESSAGE_NAMESPACES`, fr/ht/en,
  `_review` sur le créole) : liste, fiche, création, onglet Compte, panneau mot de
  passe, bloc Accès élève.
- Emprunts enregistrés (même convention que les portails) : `Enseignants.*` pour
  Infos/Enseignement, `Permissions.adminsTab.*` et `Settings.administrateurs.modal.*`
  pour les contrôles de rôles, `Eleves.invite.*` pour le bloc Accès élève.
- `Login` : libellé/placeholder du champ identifiant, message d'erreur générique.
- Pas de tiret cadratin dans les chaînes ; les noms de langue restent non traduits.

## 10. Tests

- `username.test.ts` : normalisation, regex, refus de `@`, bornes 3/30.
- `initial-password.test.ts` : longueur, classes de caractères garanties, alphabet.
- `login/route.test.ts` : chemin username (succès, mauvais mot de passe, compte
  inconnu → même réponse et même timing que l'email), compte username-seul non bloqué
  par `EMAIL_NOT_VERIFIED`, rate limit keyé sur l'identifiant, `email: null` dans le
  token.
- `personnel/route.test.ts` : fusion/dédoublonnage (enseignant sans compte, membre
  seul, double profil = une ligne), filtres, pagination, création dans chaque mode,
  gates (MEMBER+`enseignants.create` ne peut pas cocher « accès de gestion », ADMIN
  ne peut pas créer un ADMIN), conflits `USERNAME_TAKEN`/`EMAIL_ALREADY_IN_USE`.
- `accounts/*.test.ts` : résolution de compte, règle la plus stricte, `LAST_IDENTIFIER`,
  `ACCOUNT_HAS_EMAIL`, `tokenVersion` incrémenté.
- Tripwires existants : runtime enforcement, RBAC-01 (whitelist `accounts/`),
  `locales.test.ts` (38 namespaces), `breadcrumb.test.ts`.
- Vérification manuelle en navigateur (obligation UI) : création par nom
  d'utilisateur → déconnexion → connexion avec ce nom d'utilisateur → changement de
  mot de passe dans Profil ; connexion par email inchangée ; 375 px sur la liste, la
  fiche et la création.

## 11. Écrans Banani à préparer

Cinq écrans ; tout le reste réutilise l'existant ou ne change qu'un libellé.

1. **Personnel — Liste** (`/personnel`) : tableau (Nom · Profils · Compte ·
   Connexion · Actions), filtre Tous / Enseignants / Personnel administratif,
   recherche, bouton « + Ajouter ». Remplace la liste Enseignants. Prévoir l'état
   vide.
2. **Personnel — Fiche** (`/personnel/[id]`) : en-tête (nom, badges, statut du
   compte, mode de connexion, bouton « Donner un accès … ») et les 4 onglets. Les
   onglets Infos et Enseignement reprennent la fiche enseignant actuelle ; ce qui est
   nouveau, c'est **Accès & rôles** et surtout **Compte**, à dessiner dans ses trois
   états (en attente d'activation / sans email / avec email actif).
3. **Personnel — Ajouter** (`/personnel/nouveau`) : les trois blocs Identité ·
   Profils · Connexion, avec les deux cases de profils dépliées et les trois options
   de connexion (dont le champ nom d'utilisateur avec sa suggestion et son indicateur
   de disponibilité).
4. **Panneau « Compte créé » / « Mot de passe réinitialisé »** : nom, nom
   d'utilisateur, mot de passe temporaire + Copier, bandeau d'avertissement, bouton de
   fermeture. Un seul design, réutilisé partout.
5. **Fiche élève — bloc Accès** : les deux actions côte à côte (invitation par email /
   accès par nom d'utilisateur) et l'état « compte sans email » avec le bouton de
   réinitialisation. Seul ce bloc change sur la fiche élève.

Pas d'écran Banani pour : la page de connexion (libellé du champ changé en code),
la page Rôles (inchangée), le retrait de l'onglet Administrateurs.

## 12. Points de vigilance

- **Fondation « email » déjà livrée** (commit `d1444f4` : `POST /api/school/members`,
  resend, `PATCH { role }` réservé au directeur, `DELETE` avec garde-fous,
  `InviteMemberModal.tsx`, tests). Ce plan la réutilise telle quelle pour le chemin
  email ; il ne la réécrit pas. Le modal et l'onglet Administrateurs sont absorbés
  par la page de création et la fiche Personnel, et retirés à la fin (leurs tests
  migrent avec la logique).
- `auth.ts` : une seule ligne (`TokenPayload.email` nullable), à confirmer avant
  édition (§5.2).
- Emails et notifications : tout envoi keyé sur `user.email` doit court-circuiter
  proprement quand il est `null` (audit dans le plan ; les notifications in-app
  `/api/notifications` restent le canal universel).
- Seed dev : ajouter un compte staff « nom d'utilisateur seul » (identifiants dans
  `CREDENTIALS.local.md`) pour les vérifications manuelles.
- Plans Banani antérieurs `teachers-list.md`, `add-teacher.md`, `create-role.md`
  (partie assignation) : marqués SUPERSEDED dans `STATUS.md` au moment du merge.
