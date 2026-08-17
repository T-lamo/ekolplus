// Garde-fou : la largeur du panneau droit est unique dans l'app école
// (`ASIDE_GRID` dans ./layout.ts). Toute grille `grid-cols-[1fr_NNNpx]` codée
// en dur sous src/app/(school) ou src/components/school fait échouer la CI —
// on importe la constante au lieu de réinventer une largeur.
import { describe, expect, it } from 'vitest';
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASIDE_GRID } from './layout';

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
