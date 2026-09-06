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
