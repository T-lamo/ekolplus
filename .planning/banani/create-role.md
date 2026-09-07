# Create Role (modal) — Banani → Next.js 16 / Tailwind v4 (SchoolGesti)

> **Note 2026-09-05 (partial supersession)** — `RoleFormModal` itself
> (create/edit a `StaffRole`, described below) is unchanged and still lives
> at `/settings/permissions` (role panel + permission matrix), per
> CLAUDE.md's Permission manager section. What moved is the **downstream
> assignment** of a role to a staff member: the old Administrateurs tab of
> `/settings` (a per-member "Rôles" checkbox popover) is retired
> (`0f85493`, "retire the Administrateurs tab, absorbed into Personnel") —
> that same popover now lives as the "Rôles" column on the unified
> `/personnel` list (`docs/superpowers/plans/2026-09-04-personnel-module.md`,
> spec `docs/superpowers/specs/2026-09-04-personnel-module-design.md`; see
> `STATUS.md`'s Personnel-module entry). Creating a role here still ends
> with assigning it to someone from `/personnel`, not from Administrateurs.

## Source
- Banani screen ID: `OlsuHWlZ3rkJ` (flow `2oB_n5kLBeuy`, "Separate Screen Regen")
- Fetched: 2026-09-01
- Spec produit : `docs/superpowers/specs/2026-09-01-permission-manager-design.md` (§7.2)

## Structure map
- Modal 720px max, overlay sombre — utiliser le composant `Modal` de l'app
  (gabarit, fermeture, focus trap existants priment sur le mock).
- **Header** : icône 44px (briefcase, fond secondary), rangée de badges
  « Nouveau rôle » + « Étape 1/2 », titre 22px bold « Créer un nouveau
  rôle », sous-titre : les permissions se configurent après création.
- **Form panel** (carte bordée) : champ « Nom du rôle * » (hint « Exemples :
  Comptable, Surveillant, Secrétaire. »), textarea « Description »
  (optionnel, hint « Vous pourrez configurer les permissions dans l'écran
  suivant. »).
- **Preview card** (fond muted) : icône shield-user 46px, « Aperçu du
  rôle », texte explicatif, badges « Permissions à définir plus tard » +
  « Actif ».
- **Footer** : note avec icône shield-check à gauche ; Annuler (outline) +
  « Créer le rôle » (primary + icône save) à droite.

## Component breakdown
- **NEW** `RoleFormModal` — `src/app/(school)/settings/permissions/RoleFormModal.tsx`,
  props `{ mode: 'create' | 'edit', role?, onSaved, onClose }` — le mode
  édition réutilise le même formulaire (nom/description) sans les badges
  d'étape ni la preview.
- **REUSE** `Modal`, `Button`, `Badge`, champs de formulaire existants
  (`TextInput`/`Field` selon les gabarits de l'app), `useToast`.

## Token mapping
Identique à `permission-manager.md` (teal Banani → tokens du thème actif ;
radii/typo : gabarits `Modal`/`Button` existants).

## Responsive plan
- **Base (375px)** : le `Modal` de l'app gère déjà le plein écran mobile ;
  form en 1 colonne (le mock est déjà 1 colonne), boutons du footer en
  pleine largeur empilés si l'espace manque.
- **lg (1024px+)** : 720px centré, fidèle au mock.

## Interactions / state
- Nom requis (validation inline), soumission → POST `/api/school/roles` ;
  409 `ROLE_NAME_TAKEN` → erreur inline sous le champ nom.
- Succès : toast, fermeture, le nouveau rôle devient sélectionné dans la
  matrice (étape 2).
- États : soumission en cours (bouton désactivé + libellé), erreur réseau.

## Copy / i18n
- Namespace `permissions` (fr/en/ht). Pas de tiret cadratin.

## Implementation checklist
- [ ] `RoleFormModal` (create + edit)
- [ ] Branchement POST/PATCH + gestion `ROLE_NAME_TAKEN`
- [ ] Sélection auto du rôle créé dans la matrice
- [ ] 375px / 1280px vérifiés
- [ ] i18n 3 locales

## Open questions for user
_(aucune — décisions verrouillées dans la spec)_
