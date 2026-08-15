# Cards Redesign — Banani « Classes Grid » → toutes les vues cartes

## Source
- Banani screen ID: `WCr1VTvFdbcZ` (« Classes Grid », flow `2oB_n5kLBeuy`)
- Fetched: 2026-08-15

## Anatomie de la carte Banani (langage à généraliser)
1. **Barre d'accent** — 5px en haut, couleur propre à l'entité
2. **En-tête** — titre 18px bold + sous-titre 11px muted, badge statut à droite
3. **Tuiles de stats** — grille 2 col, fond `--background`, label 10px / valeur 16px bold / sub 10px
4. **Barre de métrique** — label + track 5px + valeur colorée (Moy. classe)
5. **Ligne personne** — border-top, avatar 26px + nom 12px semibold + rôle 11px muted, badge à droite
6. **Pied** — border-top + mt-auto, boutons d'action rapide 12px (1 principal en `--secondary`/`--primary`, autres outline) + kebab ⋯ bordé aligné à droite

Le kebab du pied garde le menu ActionMenu existant (items inchangés). Les boutons rapides
dupliquent volontairement 1-2 actions du menu — c'est le pattern Banani pour les cartes
(la règle « pas de doublon » posée précédemment visait les lignes de tableau).

## Primitives NOUVELLES — `src/components/ui/CardKit.tsx`
- `CardAccentBar({ color })` — la barre 5px
- `StatTile({ label, value, sub? })` — tuile fond muted
- `MetricBar({ label, percent, color, display })` — barre de métrique
- `CardQuickAction({ icon, label, onClick, primary? })` — bouton du pied

REUSE : `Card`, `Avatar`, `ActionMenu`, `OverflowTags`, `Badge` locaux, `getSubjectVisual`, `getClassDotColor`.

## Mapping par page (données réelles disponibles uniquement)
| Page | Accent | En-tête | Tuiles | Métrique/extra | Ligne personne | Pied |
|---|---|---|---|---|---|---|
| Classes | `getClassDotColor(id)` | nom + salle, badge Active | Élèves « — / capacity places » ; Matières subjectCount | Moy. classe « — » (donnée pas encore servie) | prof principal ou « Non affecté », badge niveau | Voir (toast Epic 5) · Matières (→ coefficients) · ⋯ |
| Élèves | couleur de classe ou muted | avatar + nom + #numéro, badge statut | Classe ; Tuteurs (guardianCount) | date de naissance | — | Voir le profil (→ /eleves/[id]) · ⋯ |
| Enseignants | couleur 1ʳᵉ matière ou muted | avatar + nom + email, badge statut | Classes (count) ; Heures (Xh/sem.) | tags matières (OverflowTags) | — | Voir le profil (→ /enseignants/[id]) · ⋯ |
| Matières | `visual.iconFg` | icône + nom + code, badge statut | Coefficient ; Classes (count) | tags classes | 1ᵉʳ enseignant (+N) ou « Non assigné » | Modifier (modal) · ⋯ |
| Affectations | `visual.iconFg` | icône + matière + code, badge Active/Sans enseignant | Volume (Xh/sem.) ; Coefficient | — | enseignant ou « Non assigné », badge classe | Modifier (modal) · ⋯ |
| Coefficients | `visual.iconFg` | icône + nom + code, badge domaine | — (stepper = interaction principale) | Poids relatif en MetricBar Banani | — | pas de pied (pas de menu sur cette page) |
| Modèles bulletin | inchangé | — | — | — | — | déjà riche (aperçu MiniBulletin) |

## Tokens (Banani → projet, déjà alignés)
`--primary/secondary/success/warning/muted/…` = mêmes noms de tokens Tailwind du projet
(`bg-secondary text-primary`, `bg-success text-success-foreground`, …). `badge-blue` → `bg-info text-info-foreground`.
Aucune extension `@theme` nécessaire ; couleurs dynamiques par entité via `style={{ background }}` interdit ? —
le projet utilise déjà `style={{ background: visual.iconBg }}` pour les couleurs calculées par entité
(subject-visuals) : on garde ce pattern existant pour l'accent bar uniquement.

## Responsive
- Base 375px : `grid-cols-1`, cartes pleine largeur, boutons du pied wrap (`flex-wrap`)
- sm 640px+ : `grid-cols-2`
- lg 1024px+ : `grid-cols-3` (mockup Banani)
- Touch : toutes les actions tappables, pas d'affordance hover-only (kebab toujours visible)

## États
- Vide / chargement / erreur : inchangés (déjà gérés par page)
- Pagination : `Pager centered` conservé (choix utilisateur explicite, prime sur le
  « Affichage de 1 à 6 … » du mockup)

## Checklist
- [ ] `CardKit.tsx` (4 primitives)
- [ ] Classes (reproduction directe)
- [ ] Élèves / Enseignants / Matières / Affectations / Coefficients (déclinaisons)
- [ ] 375 / 768 / 1280 px vérifiés au navigateur
- [ ] typecheck + lint + format verts

## Open questions
- Aucune bloquante. Deux décisions prises et affichées : (1) boutons rapides + kebab
  coexistent au pied des cartes (pattern Banani) ; (2) « Moy. classe » affiché « — »
  tant que la donnée n'est pas servie par l'API (pattern carte incomplète Banani).
