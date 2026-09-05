// Regression coverage for the `halves` page-layout bug (final review fix
// wave, item 1): a flex container (`display:flex` via the `flex flex-1
// flex-col` classes) combined with inline `columnCount`/`columnGap` styles
// silently produces a single column in real browsers, since `column-count`
// only affects block-formatting-context containers, not flex containers.
// No React component test infra (@testing-library/react, jsdom) exists in
// this repo yet, so this renders BulletinPage to a static HTML string via
// `react-dom/server` (already a project dependency) and inspects the
// emitted class/style attributes directly - no new devDependency needed.
//
// NOTE: this file is intentionally `.test.ts`, not `.test.tsx` - vitest.
// config.ts's `include` glob only picks up `src/**/*.test.ts`, and this
// file avoids JSX syntax entirely (plain `createElement` calls) so it
// compiles fine as a `.ts` module without touching that glob.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { BulletinPage } from './BulletinPage';
import { SAMPLE_BULLETIN_DATA } from './sample-bulletin-data';
import type {
  BulletinTemplateConfig,
  Page,
} from '@/app/(school)/configuration/modele-bulletin/types';

function baseConfig(): BulletinTemplateConfig {
  return {
    primaryColor: '#6c2bd9',
    pageFormat: 'LETTER',
    orientation: 'LANDSCAPE',
    pages: [],
    columns: {
      coefficient: true,
      classAverage: true,
      minMax: true,
      appreciation: true,
      absences: true,
      rank: true,
    },
    signatures: { director: true, homeroom: true, guardian: true },
    typography: {
      schoolName: 13,
      title: 17,
      tableBody: 11,
      tableHeader: 10,
      noteValue: 11,
      footer: 9,
    },
    content: {
      title: 'BULLETIN SCOLAIRE',
      footerMessage: null,
      pageNumberFormat: '{n} / {total}',
    },
    layout: {
      pageMargin: 20,
      blockSpacing: 10,
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#f0eef8',
      cellPaddingX: 6,
      cellPaddingY: 6,
      tableLineHeight: 1.4,
      showTableBackgrounds: false,
      logoSize: 52,
      signatureSize: 32,
    },
  };
}

// notes + signatures (signatures visible-last, matching the "pinned to the
// bottom of a full page" behaviour under test).
function makePage(layout: 'full' | 'halves'): Page {
  return {
    id: 'page-1',
    layout,
    showPageNumber: false,
    blocks: [
      {
        id: 'notes',
        type: 'notes',
        visible: true,
        ...(layout === 'halves' ? { breakBefore: 'column' } : {}),
      },
      { id: 'signatures', type: 'signatures', visible: true },
    ],
  };
}

function renderPage(layout: 'full' | 'halves'): string {
  const config = { ...baseConfig(), pages: [makePage(layout)] };
  return renderToStaticMarkup(
    createElement(BulletinPage, {
      page: config.pages[0]!,
      pageIndex: 0,
      totalPages: 1,
      config,
      data: SAMPLE_BULLETIN_DATA,
      chrome: false,
    }),
  );
}

function blocksContainerTag(html: string): string {
  const match = /<div data-testid="bulletin-page-blocks"[^>]*>/.exec(html);
  if (!match) throw new Error('bulletin-page-blocks container not found in rendered markup');
  return match[0];
}

function blockWrapperTag(html: string, blockId: string): string {
  const match = new RegExp(`<div data-block-id="${blockId}"[^>]*>`).exec(html);
  if (!match) throw new Error(`block wrapper for "${blockId}" not found in rendered markup`);
  return match[0];
}

describe('BulletinPage halves-layout column rendering', () => {
  it('a full-layout page keeps the block container as a real flex column (no CSS columns)', () => {
    const container = blocksContainerTag(renderPage('full'));
    expect(container).toContain('class="flex flex-1 flex-col"');
    expect(container).not.toContain('column-count');
    expect(container).not.toContain('column-gap');
  });

  it('a halves-layout page renders the block container as genuine CSS columns, not a flex container', () => {
    const container = blocksContainerTag(renderPage('halves'));
    // The container must NOT carry the flex-container classes ("flex" +
    // "flex-col") that previously made column-count a silent no-op.
    // "flex-1" alone is a flex-ITEM property and is fine to keep.
    expect(container).toContain('class="flex-1"');
    expect(container).not.toContain('flex-col');
    expect(container).toContain('column-count:2');
    expect(container).toContain('column-gap:20');
  });

  it('breakBefore:"column" on a halves-layout block maps to a real CSS break-before:column', () => {
    const wrapper = blockWrapperTag(renderPage('halves'), 'notes');
    expect(wrapper).toContain('break-before:column');
  });

  it('pins the last visible block (signatures) to the bottom on a full page via margin-top:auto', () => {
    const wrapper = blockWrapperTag(renderPage('full'), 'signatures');
    expect(wrapper).toContain('margin-top:auto');
  });

  it('does not apply margin-top:auto to the last visible block on a halves page (no flex context to pin against)', () => {
    const wrapper = blockWrapperTag(renderPage('halves'), 'signatures');
    expect(wrapper).not.toContain('margin-top:auto');
  });
});
