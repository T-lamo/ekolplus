# Programme Annuel (fiche matière · onglet) — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `2jFhG8pLw1l_` (« Programme Annuel », flow `2oB_n5kLBeuy`) — fetché 2026-08-17
- Extraits bruts : scratchpad `programme-annuel.main.html` / `programme-annuel.css`
- Route : `/configuration/matieres/[id]?tab=programme` — onglet 2 du shell décrit dans `add-matiere.md`.
- Header actions (mode édition) : badge statut · « ⤓ Exporter » (secondary) · « ✓ Enregistrer » (primary).

## Structure map (`main-scroll` padding `16px 20px 0`, grille `1fr 240px` gap 16)
### Toolbar (`section-toolbar`, mb 14)
- Titre 15px/700 « Programme par trimestre » + sous-titre 12px muted « Rédigez les chapitres et objectifs de chaque trimestre. Glissez-déposez pour réordonner. »
- Droite : 2 `btn-secondary` compacts (12px, `6px 11px`) : « ⤒ Importer », « ⧉ Dupliquer de l'an passé » → **toasts « bientôt »** (aucune source : pas d'import structuré, pas de programme d'une année passée en base) — honnête, pas silencieux.

### Colonne gauche — un `trimestre-block` par période (`Term`) de l'année active
- Bloc : `bg-card radius-lg border`, mb 12, overflow hidden. Header (`12px 16px`, cliquable = accordéon Radix) : `t-pill` 30px rond (T1 `#ede9fb/#6c2bd9`, T2 `#e6f9f0/#1a9e5c`, T3 `#fff8e1/#f59e0b`, cycle au-delà) · `t-title` 14px/700 (`Term.label`) + `t-meta` 12px muted (« Septembre – Décembre 2024 » = mois FR de `startDate` – `endDate`) · badge « N chapitres » (secondary / success / warning selon l'index du trimestre) · droite : `h-chip` (`bg-muted`, `3px 10px`, 12px/600) « 28 h » + chevron up/down 16px.
- Body (`border-top`, `10px 14px 12px`) : `chapter-row` (`flex gap 10, padding 10px 0, border-b sauf dernier`) :
  - `drag-handle` grip-vertical 15px muted (framer-motion `Reorder.Item` — drag réel, `order` persisté),
  - `ch-index` 22px rond (couleurs du trimestre) numéro global,
  - `ch-main` : titre 13px/600 (input inline sans bordure), objectifs 12px muted lh 1.5 (textarea auto-height inline), `ch-meta-row` gap 12 mt 6 : « 🕒 Durée : [8 h] » (`ch-meta-value` `bg-muted radius-sm 1px 8px` 11px/600 — input numérique inline), « 📖 Manuel ch. 1-2 » (input inline `reference`), badge secondary 10px `competence`,
  - `ch-actions` : `ch-action-btn` 26px poubelle destructive.
  - `add-chapter-row` : `border-top dashed`, `padding 8px 0 2px 32px`, 12px/500 primary « ⊕ Ajouter un chapitre ».
- État vide (aucune période) : carte « Aucune période scolaire — crée d'abord tes trimestres dans Paramètres › Année scolaire » + lien.
- Édition inline avec **autosave debounce 600 ms** par chapitre (`PATCH`), création immédiate (`POST` titre vide « Nouveau chapitre »), suppression avec confirm.

### Colonne droite (240px, sticky top)
- `info-card` (`bg-card radius-lg border`, mb 12) · `ic-header` (`11px 14px 9px`, 13px/700, icône 14px primary, border-b) · `ic-body` (`12px 14px`) · `stat-row` (`5px 0`, 12px, border-b sauf dernier ; label muted/500, valeur 700).
1. **Résumé du programme** (`bar-chart-2`) : Total chapitres · Heures totales · une ligne par trimestre « 28 h · 3 ch. » · bloc « Répartition / 78 h total » 11px muted + barre segmentée 6px radius 99 (couleurs T1/T2/T3) + légende points 8px.
2. **Calendrier scolaire** (`calendar`) : `tl-item` point 10px couleur + label 12px/600 + dates 11px muted « Sept. 2024 → Déc. 2024 ».
3. **Matière** (`info`) : chip icône 32px + nom 13px/700 + « CODE · Coeff. N » ; stat-rows Enseignant (responsable ou 1er enseignant des affectations) · Classes (noms joints) · Statut (badge).

### Footer (`page-footer` `10px 24px`)
- Gauche : icône book-marked + « 9 chapitres · 78 heures au total sur 3 trimestres ».
- Droite : Annuler (ghost, recharge) · « ⤓ Exporter PDF » → **CSV** réel via `exportToCsv` (libellé « Exporter CSV » — pas de PDF serveur pour ce tableau, écart documenté) · « ✓ Enregistrer le programme » (flush des autosaves en attente + toast).

## Données / modèle (même migration 22)
```prisma
model SubjectChapter {
  id         String  @id @default(cuid())
  subjectId  String
  subject    Subject @relation(fields:[subjectId], references:[id], onDelete: Cascade)
  termId     String
  term       Term    @relation(fields:[termId], references:[id], onDelete: Cascade)
  order      Int
  title      String
  objectives String?
  hours      Float?
  reference  String?   // « Manuel ch. 1-2 »
  competence String?   // badge
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([subjectId, termId, order])
}
```
## API
- `GET /api/school/subjects/[id]/chapters` → `{ terms:[{id,label,order,startDate,endDate}], chapters:[…] }` (périodes de l'année active).
- `POST …/chapters` `{termId,title,…}` (order = max+1) · `PATCH …/chapters/[chapterId]` (champs + `order`) · `DELETE` · `PUT …/chapters/reorder` `{termId, ids[]}` (tx).
- Droits : lecture MEMBER, écriture ADMIN (comme les subjects).

## Responsive
- Base 375 : colonne droite sous la gauche, toolbar empilée, footer wrap ; `chapter-row` garde grip+index+main, actions passent sous le titre si < 400px (flex-wrap).
- lg : `1fr 240px`, sticky.

## Checklist
- [x] Modèle `SubjectChapter` + 5 routes (`chapters` GET/POST, `[chapterId]` PATCH/DELETE, `reorder` PUT) + 12 tests
- [x] `ProgrammeTab` (accordéon Radix ouvert par défaut + `Reorder` framer-motion via poignée + autosave 600 ms par chapitre, flush à l'unmount et sur « Enregistrer le programme »)
- [x] Résumé / Calendrier / Matière cards (colonne sticky 240 px)
- [x] 375 / 1280 vérifiés ; ajout/édition/suppression réels (POST 201, PATCH 200 autosave, DELETE) — badge d'onglet mis à jour en direct

## Écarts assumés vs mock
- « Importer » / « Dupliquer de l'an passé » → toasts « bientôt disponible » (aucune source de données réelle).
- « Exporter PDF » → **Exporter CSV** (réel, `exportToCsv`) ; pas de rendu PDF serveur pour ce tableau.
- Les actions du header (Exporter / Enregistrer) vivent dans le footer de l'onglet (le mock les duplique) — le header ne garde que le badge statut.
- Palette T1/T2/T3 = tokens `secondary/primary`, `success`, `warning` (cycle au-delà de 3 périodes).
- Colonne droite = `ASIDE_GRID` (360 px lg / 420 px xl, `src/lib/layout.ts`) au lieu de 240 px — largeur unique dans toute l'app école (retour utilisateur 2026-08-17).
