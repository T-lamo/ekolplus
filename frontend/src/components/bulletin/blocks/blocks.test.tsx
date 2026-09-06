import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
// The client type mirrors the server schema structurally (see types.ts's
// header note), so the server default is a valid fixture here.
import { DEFAULT_BULLETIN_CONFIG as DEFAULT_CONFIG } from '@/lib/server/bulletin-templates';
import type { BulletinRenderData } from '../render-data';
import { render as renderCriteriaGrids } from './criteriaGrids';
import { render as renderSignatures } from './signatures';
import { render as renderText } from './text';
import { render as renderAppreciation } from './appreciation';
import { render as renderCover } from './cover';
import { render as renderYearGrid } from './yearGrid';
import { render as renderYearDecisions } from './yearDecisions';
import { render as renderYearSignatures } from './yearSignatures';

const config: BulletinTemplateConfig = {
  ...DEFAULT_CONFIG,
  signatures: { director: true, homeroom: true, guardian: false },
};

const data: BulletinRenderData = {
  schoolName: 'École Les Étoiles',
  schoolLogoUrl: null,
  directorSignatureUrl: null,
  period: '1er Trimestre',
  academicYear: '2026-2027',
  studentName: 'Jonathan Alexis',
  className: 'Kindergarten A',
  classSize: 6,
  studentNumber: 'EL-2026-047',
  subjects: [],
  overallAverage: null,
  classAverage: null,
  rank: null,
  rankedCount: 0,
  generalAppreciation: 'Bon trimestre.',
  absencesDays: null,
  retards: null,
  firstName: 'Jonathan',
  lastName: 'Alexis',
  schoolAddress: null,
  schoolPhone: null,
  schoolEmail: null,
  termLabel: '1er Trimestre',
  academicYearLabel: '2026-2027',
  qualitativeSubjects: [
    {
      subjectName: 'Comportement',
      ratingScale: ['Toujours', 'Souvent'],
      criteria: [{ label: 'Serviable', level: 1 }],
    },
  ],
  nisu: null,
};

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe('criteriaGrids block', () => {
  it('keeps the modern look by default: colored header row with a Critère label', () => {
    const out = html(
      renderCriteriaGrids({
        block: { id: 'g', type: 'criteriaGrids', visible: true, showScaleHeader: true },
        config,
        data,
      }),
    );
    expect(out).toContain('Critère');
    expect(out).toContain(`background:${config.primaryColor}`);
    expect(out).not.toContain('border:1px solid');
  });

  it('style grid draws a border on every cell and a plain header without the Critère label', () => {
    const out = html(
      renderCriteriaGrids({
        block: {
          id: 'g',
          type: 'criteriaGrids',
          visible: true,
          showScaleHeader: true,
          style: 'grid',
        },
        config,
        data,
      }),
    );
    expect(out).not.toContain('Critère');
    expect(out).not.toContain(`background:${config.primaryColor}`);
    // 1 blank header + 2 scale headers + 1 criterion label + 2 rating cells
    expect(out.match(/border:1px solid/g)?.length).toBe(6);
    expect(out).toContain('Comportement');
  });

  const threeSubjects: BulletinRenderData = {
    ...data,
    qualitativeSubjects: [
      { subjectName: 'Développement intellectuel', ratingScale: ['Bien'], criteria: [] },
      { subjectName: 'Développement physique', ratingScale: ['Bien'], criteria: [] },
      { subjectName: 'Comportement', ratingScale: ['Bien'], criteria: [] },
    ],
  };

  it('subjects keeps only the listed subjects, in the listed order, ignoring case and accents', () => {
    const out = html(
      renderCriteriaGrids({
        block: {
          id: 'g',
          type: 'criteriaGrids',
          visible: true,
          showScaleHeader: true,
          subjects: ['comportement', 'Developpement Physique'],
        },
        config,
        data: threeSubjects,
      }),
    );
    expect(out).not.toContain('Développement intellectuel');
    expect(out.indexOf('Comportement')).toBeLessThan(out.indexOf('Développement physique'));
  });

  it('renders nothing when no listed subject exists, and everything in data order without a list', () => {
    const none = renderCriteriaGrids({
      block: {
        id: 'g',
        type: 'criteriaGrids',
        visible: true,
        showScaleHeader: true,
        subjects: ['Musique'],
      },
      config,
      data: threeSubjects,
    });
    expect(none).toBeNull();
    const all = html(
      renderCriteriaGrids({
        block: { id: 'g', type: 'criteriaGrids', visible: true, showScaleHeader: true },
        config,
        data: threeSubjects,
      }),
    );
    expect(all.indexOf('Développement intellectuel')).toBeLessThan(all.indexOf('Comportement'));
  });
});

describe('signatures block', () => {
  it('style lines renders an underline per signatory, no heading, director first by default', () => {
    const out = html(
      renderSignatures({
        block: {
          id: 's',
          type: 'signatures',
          visible: true,
          style: 'lines',
          labels: { homeroom: 'La jardinière', director: 'La direction' },
        },
        config,
        data,
      }),
    );
    expect(out).not.toContain('Signatures');
    expect(out).not.toContain('border-dashed');
    expect(out.indexOf('La direction')).toBeLessThan(out.indexOf('La jardinière'));
  });

  it('homeroomFirst puts the homeroom signatory before the director', () => {
    const out = html(
      renderSignatures({
        block: {
          id: 's',
          type: 'signatures',
          visible: true,
          style: 'lines',
          homeroomFirst: true,
          labels: { homeroom: 'La jardinière', director: 'La direction' },
        },
        config,
        data,
      }),
    );
    expect(out.indexOf('La jardinière')).toBeLessThan(out.indexOf('La direction'));
  });

  it('keeps the boxed look and the heading by default', () => {
    const out = html(
      renderSignatures({
        block: { id: 's', type: 'signatures', visible: true },
        config,
        data,
      }),
    );
    expect(out).toContain('Signatures');
    expect(out).toContain('border-dashed');
  });
});

describe('text block', () => {
  it('verticalAlign middle fills its container and centers the paragraphs', () => {
    const out = html(
      renderText({
        block: {
          id: 't',
          type: 'text',
          visible: true,
          text: 'Verset',
          align: 'right',
          verticalAlign: 'middle',
          fontSize: 12,
          bold: false,
          italic: false,
        },
        config,
        data,
      }),
    );
    expect(out).toContain('justify-center');
    expect(out).toContain('h-full');
    expect(out).toContain('text-right');
  });

  it('defaults to a plain top-aligned flow', () => {
    const out = html(
      renderText({
        block: {
          id: 't',
          type: 'text',
          visible: true,
          text: 'Verset',
          align: 'justify',
          fontSize: 12,
          bold: false,
          italic: false,
        },
        config,
        data,
      }),
    );
    expect(out).not.toContain('justify-center');
    expect(out).not.toContain('h-full');
  });
});

describe('appreciation block', () => {
  it('uses the custom title when given and the default heading otherwise', () => {
    const custom = html(
      renderAppreciation({
        block: {
          id: 'a',
          type: 'appreciation',
          visible: true,
          style: 'lines',
          lines: 3,
          title: 'Appréciations',
        },
        config,
        data,
      }),
    );
    expect(custom).toContain('Appréciations');
    expect(custom).not.toContain('conseil de classe');
    const fallback = html(
      renderAppreciation({
        block: { id: 'a', type: 'appreciation', visible: true, style: 'lines' },
        config,
        data,
      }),
    );
    expect(fallback).toContain('conseil de classe');
  });
});

describe('cover block', () => {
  it('frameStyle solid replaces the dashed frame', () => {
    const block = {
      id: 'c',
      type: 'cover' as const,
      visible: true,
      sectionLabel: 'Section',
      titlePattern: 'Bulletin du {term}',
      showLogo: false,
      framed: true,
      fields: [],
    };
    expect(html(renderCover({ block, config, data }))).toContain('border-dashed');
    expect(html(renderCover({ block: { ...block, frameStyle: 'solid' }, config, data }))).toContain(
      'border-solid',
    );
  });
});

describe('annual blocks without annual data', () => {
  it('render nothing when the view carries no `year` payload', () => {
    expect(
      renderYearGrid({ block: { id: 'g', type: 'yearGrid', visible: true }, config, data }),
    ).toBeNull();
    expect(
      renderYearDecisions({
        block: { id: 'd', type: 'yearDecisions', visible: true },
        config,
        data,
      }),
    ).toBeNull();
    expect(
      renderYearSignatures({
        block: { id: 's', type: 'yearSignatures', visible: true },
        config,
        data,
      }),
    ).toBeNull();
  });
});
