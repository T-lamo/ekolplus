// Garde-fou : la largeur du panneau droit est unique dans l'app école
// (`ASIDE_GRID` dans ./layout.ts). Toute grille `grid-cols-[1fr_NNNpx]` codée
// en dur sous src/app/(school) ou src/components/school fait échouer la CI —
// on importe la constante au lieu de réinventer une largeur.
import { describe, expect, it } from 'vitest';
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASIDE_GRID, CARD_GRID, CARD_GRID_CONTAINER } from './layout';

const ROOT = resolve(__dirname, '../..');
// `(school)` is a route group — parentheses must be escaped for fast-glob.
const GLOBS = [`${fg.escapePath('src/app/(school)')}/**/*.tsx`, 'src/components/school/**/*.tsx'];
// Une colonne droite à largeur fixe : `1fr_320px`, `1fr_340px`, …
const HARD_CODED_ASIDE = /grid-cols-\[1fr_\d+(?:px|rem)\]/;

describe('layout consistency: right-hand column width is shared', () => {
  const files = fg.sync(GLOBS, { cwd: ROOT, absolute: true });

  it('discovered school pages/components', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('ASIDE_GRID declares one lg and one xl width', () => {
    expect(ASIDE_GRID).toMatch(/lg:grid-cols-\[1fr_\d+px\]/);
    expect(ASIDE_GRID).toMatch(/xl:grid-cols-\[1fr_\d+px\]/);
  });

  for (const file of files) {
    const rel = file.replace(ROOT + '/', '');
    it(`${rel} does not hard-code a right-column width`, () => {
      const src = readFileSync(file, 'utf8');
      const match = HARD_CODED_ASIDE.exec(src);
      expect(
        match,
        `${rel} uses \`${match?.[0]}\` — import ASIDE_GRID from '@/lib/layout' instead`,
      ).toBeNull();
    });
  }
});

// Garde-fou : la grille de cartes est plafonnée à 4 colonnes (décision
// utilisateur 2026-08-17 « quatre éléments par ligne ») et suit la largeur du
// contenu via des container queries nommées — le wrapper `<CardGrid>` porte
// le conteneur, jamais `<main>` (les modales `fixed` seraient confinées).
describe('layout consistency: list-card grid', () => {
  it('CARD_GRID caps at 4 columns and never lists more', () => {
    expect(CARD_GRID).toMatch(/grid-cols-4/);
    expect(CARD_GRID).not.toMatch(/grid-cols-[5-9]/);
    expect(CARD_GRID).not.toMatch(/auto-fill/);
  });
  it('CARD_GRID queries the named `cards` container declared by CARD_GRID_CONTAINER', () => {
    expect(CARD_GRID_CONTAINER).toBe('@container/cards');
    expect(CARD_GRID).toMatch(/@min-\[\d+px\]\/cards:grid-cols-2/);
    expect(CARD_GRID).toMatch(/@min-\[\d+px\]\/cards:grid-cols-4/);
  });
  it('the school layout <main> is not a container (would confine fixed modals)', () => {
    const src = readFileSync(resolve(ROOT, 'src/app/(school)/layout.tsx'), 'utf8');
    expect(src).not.toMatch(/@container/);
  });
});
