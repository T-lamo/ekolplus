# Dossiers enrichis (Élève / Parent / Prof) — Design

Statut : approuvé en conversation le 2026-09-02.
Origine : audit de deux documents Word fournis par l'utilisateur (« Ribrik pou baz
done lekol la », « base de donnee ecole Wegens ») décrivant les données qu'une
école haïtienne réelle (ECEMB) attend d'un système de gestion scolaire.
Sous-projet 1 sur 7 identifiés lors de cet audit (RH & Paie, Casier
disciplinaire, Bulletin maternelle, Bourse & Cantine, Documents officiels,
Inventaire restent à spécifier séparément).

## 1. Objectif

Compléter les fiches `Student`, `Guardian` et `Teacher` existantes avec les
champs identifiés comme manquants lors de l'audit, sans créer de nouvel écran
ni de nouveau module — uniquement des ajouts à des formulaires et fiches déjà
en place. C'est la fondation la plus simple des 7 sous-projets et elle
débloque le futur module « Documents officiels » (qui aura besoin du NISU
entre autres).

## 2. Décisions verrouillées (2026-09-02)

1. **Documents administratifs de l'élève = fichiers scannés réels**, pas une
   simple case à cocher. Stockés via Cloudinary comme le reste de l'app.
2. **NIF et NIU sont deux champs distincts**, pas un identifiant générique
   unique. Appliqué à `Guardian` (nouveau) et `Teacher` (remplace l'ancien
   champ générique `idNumber`).
3. **Ces documents administratifs ne suivent PAS le flux `photoUrl`
   existant** (URL Cloudinary publique sans expiration). Ce sont des pièces
   d'identité de mineurs (acte de naissance, carnet de vaccination) — l'app
   ne doit stocker que l'identifiant Cloudinary interne (`public_id`), jamais
   l'URL publique, et ne servir le fichier qu'au travers d'une route
   authentifiée et vérifiée côté serveur. `photoUrl` (portrait) n'est pas
   concerné et reste inchangé.

## 3. Modèle de données

### 3.1 `Guardian` — ajouts

```prisma
model Guardian {
  // ... champs existants inchangés ...
  nif          String? // Numéro d'Identification Fiscale
  niu          String? // Numéro d'Identifiant Unique
  vitalStatus  String? // "VIVANT" | "DECEDE" — texte libre, pas de catalogue
                        // fixe (même convention que Student.status)
}
```

### 3.2 `Teacher` — ajouts et migration de `idNumber`

```prisma
model Teacher {
  // ... champs existants inchangés, SAUF idNumber supprimé ...
  birthPlace String? // aligné sur Student.placeOfBirth — Teacher n'a
                      // aujourd'hui aucun champ de lieu de naissance
  diploma    String? // texte libre, ex. "Licence en Sciences de l'Éducation"
  nif        String?
  niu        String?
}
```

`idNumber` était un champ texte libre unique dont l'exemple en commentaire
était déjà `"NIF-2024-0042"` — il portait donc déjà sémantiquement un NIF.
Migration : recopier `idNumber` existant vers `nif` par script SQL (même
schéma que la migration `36_staff_role_members` : carry-over écrit à la main,
appliqué au merge via `prisma db execute` + `migrate resolve --applied`,
jamais `migrate dev`/`migrate reset` sur la base partagée), puis supprimer la
colonne `idNumber`.

### 3.3 `Student` — ajout

```prisma
model Student {
  // ... champs existants inchangés ...
  nisu String? // Numéro d'Identification Scolaire Unique (MENFP)
}
```

`previousSchool` (nom de l'ancienne école, déjà présent) et `placeOfBirth`
(déjà présent) couvrent déjà deux points de l'audit — aucun changement requis
sur ces deux champs.

### 3.4 Nouveau modèle `StudentDocument`

```prisma
enum StudentDocumentType {
  BIRTH_CERTIFICATE
  VACCINATION_RECORD
  PREVIOUS_SCHOOL_RECORD
}

model StudentDocument {
  id           String              @id @default(cuid())
  studentId    String
  student      Student             @relation(fields: [studentId], references: [id], onDelete: Cascade)
  type         StudentDocumentType
  fileKey      String              // Cloudinary public_id — PAS d'URL stockée (§4)
  fileName     String              // nom original, affiché dans l'UI
  mimeType     String
  sizeBytes    Int
  uploadedAt   DateTime            @default(now())
  uploadedById String?
  uploadedBy   User?               @relation(fields: [uploadedById], references: [id], onDelete: SetNull)

  @@unique([studentId, type])
  @@index([studentId])
}
```

Un seul fichier « courant » par type et par élève : un nouvel upload sur un
type déjà présent **remplace** la ligne (`upsert`), même convention à un seul
slot que `Student.photoUrl`. Pas d'historique de versions — hors scope (YAGNI :
aucun des deux documents sources ne demande de conserver les anciennes
versions).

## 4. Confidentialité des documents administratifs

`/api/upload` (seule voie d'upload existante dans l'app) renvoie une
`secure_url` Cloudinary **publique et sans expiration** — adapté à une photo
de profil, pas à un acte de naissance ou un carnet de vaccination d'un
mineur. `frontend/src/app/api/upload/route.ts` documente déjà explicitement
cette limite : *« For private files (KYC docs, invoices, IDs) this route must
be wrapped with Cloudinary signed delivery URLs or an owner-gated proxy. The
v1 starter ships neither. »* Ce sous-projet est le premier à toucher
exactement ce cas.

Traitement retenu :

- **`uploadBuffer()` (`lib/server/upload/cloudinary-client.ts`, non protégé
  par CLAUDE.md) reçoit un troisième paramètre optionnel** :
  `uploadBuffer(publicId, body, { deliveryType: 'authenticated' })`, qui
  passe `type: 'authenticated'` aux options Cloudinary. C'est le point
  technique clé : signer une URL ne protège rien si le fichier a été uploadé
  avec le type de livraison public par défaut (`upload`) — l'URL non signée
  resterait servable. Sans ce paramètre, la garantie de confidentialité du
  §1 décision 3 ne tient pas. Appel existant de `/api/upload` (photos)
  inchangé — paramètre omis, comportement public identique à aujourd'hui.
- Nouvelle route serveur dédiée `POST /api/school/students/[id]/documents`
  (pas de réutilisation directe de `/api/upload` généraliste, pour garder
  `application/pdf` scopé aux seuls documents élève plutôt que d'élargir
  l'allowlist globale — voir §6). `requireAuth` + `requireSchoolPermission
  ('eleves', 'edit')` + vérification que l'élève appartient à l'école de
  l'appelant. Upload via `uploadBuffer(publicId, body, { deliveryType:
  'authenticated' })`, mais seul le `public_id` est persisté dans
  `StudentDocument.fileKey` — `secure_url` n'est ni stocké ni renvoyé au
  client dans la réponse de création.
- Nouvelle route de lecture `GET /api/school/students/[id]/documents/[type]/file`
  — `requireAuth` + `requireSchoolPermission('eleves', 'view')` + même
  vérification d'appartenance à l'école, puis génère une URL signée à courte
  durée (quelques minutes) via `cloudinary.utils.private_download_url()` (ou
  `cloudinary.url(fileKey, { type: 'authenticated', sign_url: true,
  expires_at })`) et redirige (302) dessus. Comme le fichier est stocké en
  type `authenticated`, l'URL non signée est intrinsèquement inaccessible —
  la signature à courte durée est une seconde barrière, pas la seule.
- `GET /api/school/students/[id]/documents` liste les 3 types avec statut
  (fourni / manquant), nom de fichier et date, sans jamais inclure `fileKey`
  brut dans la réponse (seul un id de document opaque est renvoyé, consommé
  par la route de lecture ci-dessus).

## 5. Écrans touchés

- `StudentFormModal.tsx` — champ NISU (élève), champs NIF / NIU / statut
  vital sur la section responsable (`Guardian`).
- Fiche élève `frontend/src/app/(school)/eleves/[id]/` — nouvel onglet
  « Documents » (aux côtés de `BulletinsTab`, `PresencesTab`,
  `AppreciationsTab`, `NotesResultatsTab`) : 3 lignes fixes (Acte de
  naissance, Carnet de vaccination, Dossier de l'ancienne école) avec statut,
  upload/remplacement, téléchargement via la route gated du §4.
- `enseignants/[id]` + formulaire d'ajout/édition prof — lieu de naissance,
  diplôme, NIF, NIU (remplaçant l'ancien champ unique `idNumber` dans l'UI).

## 6. Configuration

`UPLOAD_ALLOWED_MIME` (env, route `/api/upload` généraliste) reste **inchangé**
— les documents élève passent par leur propre route dédiée (§4) avec sa
propre allowlist locale (`application/pdf`, `image/jpeg`, `image/png`), pour
ne pas élargir silencieusement ce que n'importe quel upload authentifié de
l'app peut accepter.

## 7. Tests

- Migration Prisma : script de carry-over `idNumber → nif` vérifié 1 pour 1
  (même méthode que la vérification `staffRoleId → staffRoles` de la migration
  36).
- Route de lecture document : 401 sans session, 404 si l'élève n'appartient
  pas à l'école de l'appelant (pas de fuite d'existence), 403 sans le grant
  `eleves.view`, 200 + redirection signée sinon.
- Route d'upload document : mêmes gardes en écriture (`eleves.edit`), rejet
  MIME hors allowlist locale, `@@unique([studentId, type])` vérifié par un
  upsert qui remplace proprement l'ancien document.
- Formulaires : nouveaux champs entièrement optionnels, aucune régression sur
  la création/édition existante d'élève, de responsable ou de professeur.
- `locales.test.ts` : nouvelles clés fr/en/ht dans les namespaces `Eleves` et
  `Enseignants` existants (pas de nouveau namespace).

## 8. Hors scope (rappel)

Les 6 autres sous-projets identifiés lors de l'audit (RH & Paie, Casier
disciplinaire, Bulletin maternelle/préscolaire, Bourse enrichie & Cantine,
Documents officiels générés, Inventaire/Logistique) ne sont pas couverts ici
et feront chacun l'objet de leur propre spec.
