# Contribuer à Schoolgesti

Ce document décrit comment travailler sur ce dépôt : environnement, style de commit, tests et étapes avant une pull request. Pour l'installation initiale, voir la section [Démarrage](README.md#démarrage) du README ; ce fichier ne la répète pas.

## Prérequis

- Node ≥ 20 (la version exacte utilisée en CI est épinglée dans [`.nvmrc`](.nvmrc))
- pnpm ≥ 9 (`packageManager` dans [`package.json`](package.json) épingle `pnpm@9.15.0`)
- Un projet [Neon](https://neon.tech) Postgres (l'app n'a pas de base locale, voir `.env.example`)

## Organisation des branches

- `main` → production, [schoolgesti.com](https://schoolgesti.com)
- `develop` → environnement de test, testing.schoolgesti.com

Travaillez sur une branche de fonctionnalité créée à partir de `develop`, puis ouvrez une pull request vers `develop`. `main` ne reçoit que des fusions depuis `develop` une fois la fonctionnalité vérifiée en test.

**Point d'attention actuel** : le workflow CI (`.github/workflows/ci.yml`) ne se déclenche que sur `push`/`pull_request` vers `main`. Une branche fusionnée dans `develop` ne passe donc par aucune vérification automatique avant son déploiement sur testing.schoolgesti.com — seul le hook pre-commit local (voir plus bas) protège cette branche. Lancez `pnpm format && pnpm lint && pnpm typecheck && pnpm test` vous-même avant de fusionner dans `develop`.

### Travail concurrent sur le même arbre

Plusieurs sessions (humaines ou agents) travaillent parfois en parallèle dans le même checkout. L'index Git est partagé :

- Toujours `git add <chemins explicites>`, jamais `git add -A` ni `git add .`.
- Si `git status` montre des fichiers indexés (`M `/`A `) que vous n'avez pas touchés, une autre session est probablement en cours : committez avec `git commit --only -- <vos chemins>` pour ne pas embarquer son travail.
- Un fichier peut porter des modifications non commitées de deux sessions à la fois. Avant un `commit --only`, vérifiez que le fichier ne référence pas un symbole introduit par l'autre session et absent de vos propres chemins — sinon votre commit isolé casse la compilation une fois extrait de ce contexte.

## Conventions de commit

[Conventional Commits](https://www.conventionalcommits.org/), format `type(scope): résumé à l'impératif`. Exemples réels du dépôt :

```
feat(bulletin): rich text for the free-text block, edited in a modal
fix(bulletin): a template assigned to a level applies to every class of that level
refactor(matieres): split subject form into a 4-step wizard
chore: expose db:seed-bulletin-templates and db:seed-plans from the root package
docs(bulletin): design spec for the annual carnets scolaires
```

Types courants : `feat`, `fix`, `refactor`, `chore`, `docs`, `test`. Le scope est le module concerné (`bulletin`, `niveaux`, `matieres`, `sidebar`, …), pas le nom du fichier.

## Hook pre-commit

`.husky/pre-commit` lance `lint-staged` (Prettier + ESLint sur les fichiers indexés) puis `pnpm typecheck` sur tout le workspace (~2-3 s). Les tests ne tournent **pas** dans ce hook — ils sont trop longs pour chaque commit et s'exécutent en CI. `git commit --no-verify` saute le hook ; à réserver aux cas où vous savez exactement pourquoi (jamais pour contourner une erreur de type réelle).

## Avant d'ouvrir une pull request

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Les quatre doivent passer. `pnpm test` lance la suite Vitest complète (2220 tests au 7 septembre 2026 — voir `pnpm test` pour le nombre à jour). Si votre changement touche le rendu de bulletin ou une page interactive, une vérification visuelle réelle (navigateur, pas seulement les tests) est fortement recommandée — voir les patterns dans [CLAUDE.md](frontend/CLAUDE.md).

## Style de test

- Vitest, environnement Node — **pas de jsdom**. Les composants qui rendent du HTML sont testés via `renderToStaticMarkup`, pas via des events DOM interactifs.
- Fichiers colocalisés : `mon-fichier.ts` → `mon-fichier.test.ts` dans le même dossier.
- Les routes qui touchent Prisma utilisent le mock partagé sous `frontend/src/test-utils/`.
- Toute route sous `frontend/src/app/api/**` doit exporter `export const runtime = 'nodejs'` — un test de garde (`runtime-enforcement.test.ts`) échoue sinon en CI.

## i18n

Toute chaîne visible par un utilisateur (école, enseignant, élève) doit passer par `next-intl` — jamais de texte en dur dans un composant. Les fichiers de messages vivent sous `frontend/src/messages/{fr,ht,en}/<namespace>.json`, un namespace par écran. Le français est la langue de référence ; le créole haïtien porte un indicateur `_review` sur les chaînes pas encore relues par une personne native (exclu du test de parité de clés). [`locales.test.ts`](frontend/src/lib/locales.test.ts) échoue si les trois langues divergent.

## Où vivent les autres documents

- [`CLAUDE.md`](CLAUDE.md) — référence d'architecture et invariants, chargée automatiquement par Claude Code ; c'est la source de vérité la plus détaillée sur le fonctionnement du projet.
- `docs/superpowers/specs/` et `docs/superpowers/plans/` — specs de conception et plans d'implémentation des fonctionnalités importantes, un fichier par date/sujet.
- [`PRUNING.md`](PRUNING.md) — protocole pour retirer proprement une fonctionnalité optionnelle (paiements Bictorys, OAuth Google, etc.).
- [`SECURITY.md`](SECURITY.md) — signaler une vulnérabilité.
- [`CHANGELOG.md`](CHANGELOG.md) — historique des changements notables.

## Secrets

Ne commitez jamais de fichier `.env*` réel (seul `.env.example`, avec des valeurs d'exemple, est suivi) ni le contenu de `frontend/CREDENTIALS.local.md`. Si un secret a été exposé par erreur (poussé, collé dans un ticket, partagé), faites-le tourner (générez-en un nouveau et mettez à jour les variables d'environnement du déploiement concerné) avant de continuer.
