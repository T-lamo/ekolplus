import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  BulletinTemplateConfig,
  Page,
} from '@/app/(school)/configuration/modele-bulletin/types';
// The client type mirrors the server schema structurally (see types.ts).
import { DEFAULT_BULLETIN_CONFIG } from '@/lib/server/bulletin-templates';
import type { BulletinRenderData } from './render-data';
import { BulletinPage } from './BulletinPage';
import { SAMPLE_BULLETIN_DATA } from './sample-bulletin-data';

const data: BulletinRenderData = {
  schoolName: 'École',
  schoolLogoUrl: null,
  directorSignatureUrl: null,
  period: '1er Trimestre',
  academicYear: '2026-2027',
  studentName: 'Jonathan Alexis',
  className: 'Kindergarten A',
  classSize: 6,
  studentNumber: 'EL-1',
  subjects: [],
  overallAverage: null,
  classAverage: null,
  rank: null,
  rankedCount: 0,
  generalAppreciation: null,
  absencesDays: null,
  retards: null,
  firstName: 'Jonathan',
  lastName: 'Alexis',
  schoolAddress: null,
  schoolPhone: null,
  schoolEmail: null,
  termLabel: '1er Trimestre',
  academicYearLabel: '2026-2027',
  qualitativeSubjects: [],
  nisu: null,
};

const page: Page = {
  id: 'p1',
  layout: 'halves',
  showPageNumber: false,
  blocks: [
    {
      id: 't',
      type: 'text',
      visible: true,
      text: 'Verset',
      align: 'justify',
      fontSize: 12,
      bold: false,
      italic: false,
    },
  ],
};

function render(config: BulletinTemplateConfig) {
  return renderToStaticMarkup(
    <BulletinPage page={page} pageIndex={0} totalPages={1} config={config} data={data} />,
  );
}

describe('BulletinPage decoration stripes', () => {
  it('draws the top and bottom gradient stripes by default', () => {
    const out = render(DEFAULT_BULLETIN_CONFIG);
    expect(out.match(/linear-gradient\(90deg/g)?.length).toBe(2);
  });

  it('draws none when layout.showDecoration is false (the livret has no stripes)', () => {
    const out = render({
      ...DEFAULT_BULLETIN_CONFIG,
      layout: { ...DEFAULT_BULLETIN_CONFIG.layout, showDecoration: false },
    });
    expect(out).not.toContain('linear-gradient(90deg');
    expect(out).toContain('Verset');
  });
});

describe('sidebar layout', () => {
  const sidebarPage: Page = {
    id: 'grille',
    layout: 'sidebar',
    asideWidth: 22,
    showPageNumber: false,
    blocks: [
      {
        id: 'line',
        type: 'text',
        visible: true,
        text: 'Nom',
        align: 'left',
        fontSize: 10,
        bold: true,
        italic: false,
      },
      { id: 'grid', type: 'yearGrid', visible: true },
      { id: 'sig', type: 'yearSignatures', visible: true, breakBefore: 'column' },
    ],
  };
  const render = (p: Page) =>
    renderToStaticMarkup(
      <BulletinPage
        page={p}
        pageIndex={0}
        totalPages={1}
        config={DEFAULT_BULLETIN_CONFIG}
        data={{ ...data, year: SAMPLE_BULLETIN_DATA.year }}
        chrome={false}
      />,
    );

  it('splits the blocks into a main column and an aside at the first breakBefore, aside width from asideWidth', () => {
    const out = render(sidebarPage);
    expect(out).toContain('grid-template-columns:minmax(0, 1fr) 22%');
    const main = out.slice(
      out.indexOf('data-testid="bulletin-page-main"'),
      out.indexOf('data-testid="bulletin-page-aside"'),
    );
    expect(main).toContain('data-block-id="line"');
    expect(main).toContain('data-block-id="grid"');
    expect(main).not.toContain('data-block-id="sig"');
    const aside = out.slice(out.indexOf('data-testid="bulletin-page-aside"'));
    expect(aside).toContain('data-block-id="sig"');
  });

  it('defaults the aside width to 25% and puts every block in the main column without a breakBefore', () => {
    const out = render({
      ...sidebarPage,
      asideWidth: undefined,
      blocks: sidebarPage.blocks.map((b) => ({ ...b, breakBefore: undefined })),
    });
    expect(out).toContain('grid-template-columns:minmax(0, 1fr) 25%');
    const aside = out.slice(out.indexOf('data-testid="bulletin-page-aside"'));
    expect(aside).not.toContain('data-block-id=');
  });

  it('stretches the yearSignatures block to the column height', () => {
    const out = render(sidebarPage);
    const sig = out.slice(out.indexOf('data-block-id="sig"'));
    expect(sig.slice(0, 400)).toContain('flex-grow:1');
  });

  it('keeps the content row at full height and the footer row auto-sized when a footer message is set', () => {
    const out = renderToStaticMarkup(
      <BulletinPage
        page={sidebarPage}
        pageIndex={0}
        totalPages={1}
        config={{
          ...DEFAULT_BULLETIN_CONFIG,
          content: {
            ...DEFAULT_BULLETIN_CONFIG.content,
            footerMessage: 'Ensemble vers la réussite',
          },
        }}
        data={{ ...data, year: SAMPLE_BULLETIN_DATA.year }}
        chrome={false}
      />,
    );
    expect(out).toContain('grid-template-rows:minmax(0, 1fr) auto');
    const footer = out.slice(
      out.indexOf('Ensemble vers la réussite') - 200,
      out.indexOf('Ensemble vers la réussite'),
    );
    expect(footer).toContain('grid-column:1 / -1');
  });
});
