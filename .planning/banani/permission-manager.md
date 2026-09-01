# Permission Manager — Banani → Next.js 16 / Tailwind v4 (SchoolGesti)

## Source
- Banani screen ID: `Sr4sWYaoaPZ0` (flow `2oB_n5kLBeuy`, "Separate Screen Regen")
- Fetched: 2026-09-01
- Spec produit : `docs/superpowers/specs/2026-09-01-permission-manager-design.md`

## Structure map
- **Shell (sidebar/topbar du mock)** : NON reproduit — le shell réel de l'app
  (SchoolSidebar/SchoolTopbar) est réutilisé ; seule la zone `#content` est
  implémentée. Le breadcrumb réel vient du topbar existant.
- **Page header** : titre « Gestion des Permissions » + sous-titre, actions
  « Dupliquer le rôle » (outline) et « Nouveau rôle » (primary) — gabarits
  `Button` de l'app (h1 extrabold comme les autres écrans, pas le 18px du
  mock si l'app fait autrement — cohérence app > mock pour le chrome).
- **`#permissions-layout`** : flex 2 colonnes, gap 18px, `#roles-panel`
  240px fixe + `#details-panel` flex-1.
- **`#roles-panel`** : label « RÔLES » uppercase 11-12px + bouton « + » ;
  liste de `role-card` (34px de haut, bordure, nom 13px semibold + compteur
  pill 20px) ; état actif = fond `--secondary` + texte primaire ; note
  d'info en bas (fond secondary, 12px).
- **`#perm-card`** : carte résumé (icône 42px arrondie fond secondary, nom
  16px bold, badge « N utilisateurs », description, ligne « Modifié le … »
  avec icône horloge 12px, boutons Modifier / Supprimer 34px) + matrice.
- **Matrice `#matrix-table`** : `table-layout: fixed`, 1ʳᵉ colonne 34%,
  5 colonnes d'action 13.2% centrées ; thead fond `#F7F8FC` → équivalent
  token muted, en-têtes icône+libellé empilés 11px uppercase ; lignes de
  section (`module-heading-row`) fond quasi-blanc, 12px bold uppercase ;
  cellule module = pastille 28px colorée + titre 13px semibold + sous-titre
  12px muted ; interrupteurs 36×20px (track) / thumb 14px.
- **`#footer-bar`** : carte séparée, méta à gauche (« Rôle : X · N
  utilisateurs · Dernière mise à jour … » — remplacer le tiret cadratin du
  mock par « · », convention CLAUDE.md), actions à droite : Supprimer ce
  rôle (danger soft), Annuler (outline), Enregistrer (primary + icône save).

## Component breakdown
- **PAGE** `src/app/(school)/settings/permissions/page.tsx` — client page,
  gated OWNER/ADMIN.
- **NEW** `RolesPanel` — liste des rôles (système épinglés + personnalisés),
  compteurs, sélection, bouton « + ». Desktop : colonne 240px ; mobile :
  select pleine largeur.
- **NEW** `PermissionMatrix` — table pilotée par le registre
  `lib/permissions.ts` (sections/modules/actions applicables), props :
  `grants`, `readOnly`, `onToggle(grant)`. Cellules non applicables vides.
- **NEW** `RoleSummaryCard` — icône/nom/badge/description/date + actions.
- **REUSE** `Card`, `Button`, `Badge`, `Switch` (celui de l'app — pas les
  divs du mock), `ConfirmContext` (suppression), `useToast`, `Skeleton`,
  `TABLE_SCROLL`/`STICKY_THEAD` de `lib/layout`.
- **REUSE** modal de création : voir `create-role.md` (même composant en
  mode édition nom/description).

## Token mapping (Banani "Admin Slate" → SchoolGesti)
| Banani | Projet |
|---|---|
| `--primary: #0EA5A4` (teal) | token `primary` du thème actif (`text-primary`, `bg-primary`) |
| `--secondary: #E6F7F6` | `bg-secondary` |
| `--muted / --muted-foreground` | `bg-muted` / `text-muted-foreground` |
| `--card`, `--border`, `--background` | `bg-card`, `border-border`, `bg-background` |
| `--destructive` | tokens destructive existants |
| thead `#F7F8FC`, heading rows `#FBFBFD` | nuances `bg-muted`/`bg-background` les plus proches — pas de hex en dur |
| pastilles modules (`#EAF9F4`/`#16A34A`, …) | portées par le registre `permissions.ts` (couleurs de données non thémées, comme les matières) |
| radii 6/8px | `rounded-md` / `rounded-lg` (gabarits Card/Button existants priment) |
| Iconify lucide | `lucide-react` (déjà présent) : shield-check, plus, copy, pencil, trash-2, eye, plus-circle, download, calculator, layout-dashboard, users, user-check, notebook-pen, calendar-check, calendar-days, wallet, settings-2, clock-3, info, save, x |

## Responsive plan (mock = desktop uniquement → mobile à concevoir)
- **Base (375px)** : header empilé (titre puis actions pleine largeur ou
  wrap) ; panneau rôles = `FilterSelect` pleine largeur + bouton « Nouveau
  rôle » ; carte résumé empilée ; matrice dans un conteneur `TABLE_SCROLL`
  (scroll horizontal interne, `min-w` ~560px, thead sticky) ; footer bar en
  colonne (méta puis boutons pleine largeur) ; touch targets ≥44px (les
  switches gardent leur zone de clic ≥44px via padding).
- **lg (1024px+)** : layout 2 colonnes du mock (240px + flex), footer bar en
  ligne — reproduction fidèle du mock 1280px.

## Interactions / state
- Sélection d'un rôle → charge ses grants dans un état local ; toggles
  modifient l'état local ; « Enregistrer » PATCH puis toast ; « Annuler »
  reset ; garde « modifications non enregistrées » avant changement de rôle
  (confirm).
- Rôles système : switches on + `disabled`, actions Modifier/Supprimer
  masquées, note explicative.
- Suppression : ConfirmContext avec le nombre de membres qui repasseront en
  refus par défaut.
- Loading : skeletons panneau + matrice ; erreur : message standard ;
  aucun rôle personnalisé : invite à créer le premier.
- Clavier : switches focusables, focus ring standard.

## Copy / i18n
- Namespace `permissions` (fr/en/ht, ht `_review`) — tout le texte des mocks
  traduit ; libellés modules/sections/actions consommés depuis le registre.
- Interdits : tirets cadratins ; « · » pour les paires courtes.

## Implementation checklist
- [ ] Registre `lib/permissions.ts` (préalable, voir spec §4)
- [ ] API roles CRUD (spec §8) — la page consomme les vraies réponses
- [ ] `RolesPanel` + `RoleSummaryCard` + `PermissionMatrix`
- [ ] Page + gating OWNER/ADMIN + entrée depuis l'onglet Administrateurs
- [ ] 375px : matrice scrollable, pas de scroll horizontal de page
- [ ] 768/1280px : fidèle au mock
- [ ] États vide / chargement / erreur
- [ ] Vérif dev server aux 3 breakpoints + `pnpm format && lint && typecheck && test`

## Open questions for user
_(aucune — décisions verrouillées dans la spec §2 le 2026-09-01)_
