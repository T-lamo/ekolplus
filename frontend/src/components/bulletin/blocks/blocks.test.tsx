import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
// The client type mirrors the server schema structurally (see types.ts's
// header note), so the server default is a valid fixture here.
import { DEFAULT_BULLETIN_CONFIG as DEFAULT_CONFIG } from '@/lib/server/bulletin-templates';
import type { BulletinRenderData } from '../render-data';
import { SAMPLE_BULLETIN_DATA } from '../sample-bulletin-data';
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

  it('renders the school logo as an <img> when the school has one, alt-texted for a graceful fallback', () => {
    const block = {
      id: 'c',
      type: 'cover' as const,
      visible: true,
      sectionLabel: 'Section',
      titlePattern: 'Bulletin du {term}',
      showLogo: true,
      framed: false,
      fields: [],
    };
    const out = html(
      renderCover({
        block,
        config,
        data: { ...data, schoolLogoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png' },
      }),
    );
    expect(out).toContain('<img');
    expect(out).toContain('src="https://res.cloudinary.com/demo/image/upload/logo.png"');
    expect(out).toContain(`alt="${data.schoolName}"`);
    // No onError fallback fires in a static render (no browser event loop),
    // so this only pins the markup contract; the retry-then-placeholder
    // behavior itself needs a real browser and is covered by manual/E2E
    // verification instead.
  });
});

describe('cover block, carnet options', () => {
  const coverBlock = {
    id: 'c',
    type: 'cover' as const,
    visible: true,
    sectionLabel: 'Section primaire',
    titlePattern: 'Carnet scolaire',
    showLogo: false,
    framed: true,
    fields: ['fullName', 'className', 'nisu', 'academicYear'] as const,
  };
  const dataWithNisu: BulletinRenderData = { ...data, nisu: '0123456789' };

  it('prints Elève (full name) and NISU with their default labels, and renames a field through fieldLabels', () => {
    const out = html(
      renderCover({
        block: {
          ...coverBlock,
          fields: [...coverBlock.fields],
          fieldLabels: { academicYear: 'Année Scolaire' },
        },
        config,
        data: dataWithNisu,
      }),
    );
    expect(out).toContain('Elève :');
    expect(out).toContain('Jonathan Alexis');
    expect(out).toContain('NISU :');
    expect(out).toContain('0123456789');
    expect(out).toContain('Année Scolaire :');
    expect(out).not.toContain('Année Académique');
  });

  it('keeps capitals by default and prints as typed with uppercase: false', () => {
    const upper = html(
      renderCover({
        block: { ...coverBlock, fields: [...coverBlock.fields] },
        config,
        data: dataWithNisu,
      }),
    );
    expect(upper).toContain('uppercase');
    const typed = html(
      renderCover({
        block: { ...coverBlock, fields: [...coverBlock.fields], uppercase: false },
        config,
        data: dataWithNisu,
      }),
    );
    expect(typed).not.toContain('uppercase');
  });

  it('draws the rounded frame and places the logo below the title on request', () => {
    const out = html(
      renderCover({
        block: {
          ...coverBlock,
          fields: [...coverBlock.fields],
          frameStyle: 'rounded',
          showLogo: true,
          logoPosition: 'belowTitle',
        },
        config,
        data: dataWithNisu,
      }),
    );
    expect(out).toContain('border-radius:40px');
    // Logo placeholder (no logo url) comes after the title text.
    expect(out.indexOf('Carnet scolaire')).toBeLessThan(out.indexOf('lucide'));
  });
});

describe('text block rich content', () => {
  const base = {
    id: 't',
    type: 'text' as const,
    visible: true,
    text: 'fallback',
    align: 'left' as const,
    fontSize: 12,
    bold: false,
    italic: false,
  };

  it('renders paragraphs, marks, lists and per-paragraph alignment from the structured runs', () => {
    const out = html(
      renderText({
        block: {
          ...base,
          rich: [
            {
              kind: 'p',
              align: 'center',
              runs: [
                { text: 'Extrait ' },
                { text: 'des règlements', marks: ['bold', 'underline'] },
              ],
            },
            {
              kind: 'ol',
              items: [[{ text: 'Promu (e)' }], [{ text: 'Maintenu', marks: ['italic'] }]],
            },
          ],
        },
        config,
        data,
      }),
    );
    expect(out).toContain('text-center');
    expect(out).toContain('<strong><u>des règlements</u></strong>');
    expect(out).toContain('<ol class="mb-2 pl-5 whitespace-pre-line last:mb-0 list-decimal">');
    expect(out).toContain('<li><span><em>Maintenu</em></span></li>');
    expect(out).not.toContain('fallback');
  });

  it('prints markup typed by the author as literal text (no injection through a run)', () => {
    const out = html(
      renderText({
        block: {
          ...base,
          rich: [{ kind: 'p', runs: [{ text: '<img src=x onerror=alert(1)> & {eleve}' }] }],
        },
        config,
        data,
      }),
    );
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; Jonathan Alexis');
  });

  it('prints a run size as an inline px font size on the span', () => {
    const out = html(
      renderText({
        block: {
          ...base,
          rich: [
            {
              kind: 'p',
              runs: [
                { text: 'Petit', size: 8 },
                { text: ' Grand', size: 24 },
              ],
            },
          ],
        },
        config,
        data,
      }),
    );
    expect(out).toContain('<span style="font-size:8px">Petit</span>');
    expect(out).toContain('<span style="font-size:24px"> Grand</span>');
  });

  it('falls back to the plain text when rich is absent or empty', () => {
    const out = html(renderText({ block: { ...base, rich: [] }, config, data }));
    expect(out).toContain('fallback');
  });
});

describe('text block variables', () => {
  it('replaces {eleve}, {classe}, {annee}, {periode}, {ecole} and leaves unknown variables', () => {
    const out = html(
      renderText({
        block: {
          id: 't',
          type: 'text',
          visible: true,
          text: 'Nom {eleve} · {classe} · {annee} · {periode} · {ecole} · {autre}',
          align: 'left',
          fontSize: 10,
          bold: false,
          italic: false,
        },
        config,
        data,
      }),
    );
    expect(out).toContain(
      'Nom Jonathan Alexis · Kindergarten A · 2026-2027 · 1er Trimestre · École Les Étoiles · {autre}',
    );
  });
});

describe('yearGrid block', () => {
  const dataWithYear: BulletinRenderData = { ...data, year: SAMPLE_BULLETIN_DATA.year };

  it('prints one two-column group per period with Notes/Sur sub-headers and a border on every cell', () => {
    const out = html(
      renderYearGrid({
        block: { id: 'g', type: 'yearGrid', visible: true },
        config,
        data: dataWithYear,
      }),
    );
    expect(out).toContain('Matières');
    for (const label of ['1er contrôle', '2ème contrôle', '3ème contrôle', '4ème contrôle']) {
      expect(out).toContain(`colSpan="2"`);
      expect(out).toContain(label);
    }
    expect(out.match(/>Notes</g)).toHaveLength(4);
    expect(out.match(/>Sur</g)).toHaveLength(4);
    expect(out).toContain('border:1px solid #1a1a2e');
  });

  it('prints points with a decimal comma, Sur only for graded periods, and empty cells otherwise', () => {
    const out = html(
      renderYearGrid({
        block: { id: 'g', type: 'yearGrid', visible: true },
        config,
        data: dataWithYear,
      }),
    );
    expect(out).toContain('>62,7<');
    expect(out).toContain('>80<');
    // Anglais has no grade in the 2nd period: empty Notes cell, Sur still printed.
    expect(out).toContain('>60<');
    // The two ungraded periods print no Sur at all: 5 subjects × 2 graded periods = 10 Sur cells.
    expect(out.match(/>(80|60|40)</g)).toHaveLength(10);
  });

  it('prints Total, Moyenne and Place rows', () => {
    const out = html(
      renderYearGrid({
        block: { id: 'g', type: 'yearGrid', visible: true },
        config,
        data: dataWithYear,
      }),
    );
    expect(out).toContain('>Total<');
    expect(out).toContain('>227,7<');
    expect(out).toContain('>320<');
    expect(out).toContain('>Moyenne<');
    expect(out).toContain('>7,1<');
    expect(out).toContain('>Place<');
    expect(out).toContain('>4e<');
    expect(out).toContain('>6e<');
  });

  it('prints a bold domain heading row when the domain changes and showDomains is on', () => {
    const on = html(
      renderYearGrid({
        block: { id: 'g', type: 'yearGrid', visible: true, showDomains: true },
        config,
        data: dataWithYear,
      }),
    );
    expect(on).toContain('>Sciences<');
    expect(on).toContain('>Lettres<');
    const off = html(
      renderYearGrid({
        block: { id: 'g', type: 'yearGrid', visible: true },
        config,
        data: dataWithYear,
      }),
    );
    expect(off).not.toContain('>Lettres<');
  });

  it('uses the custom Notes/Sur labels', () => {
    const out = html(
      renderYearGrid({
        block: { id: 'g', type: 'yearGrid', visible: true, notesLabel: 'Pts', maxLabel: 'Max' },
        config,
        data: dataWithYear,
      }),
    );
    expect(out.match(/>Pts</g)).toHaveLength(4);
    expect(out.match(/>Max</g)).toHaveLength(4);
  });
});

describe('yearDecisions block', () => {
  const dataWithYear: BulletinRenderData = { ...data, year: SAMPLE_BULLETIN_DATA.year };

  it('prints one roman-numbered row per period with Moyenne and Coefficient, then Moyenne Générale', () => {
    const out = html(
      renderYearDecisions({
        block: { id: 'd', type: 'yearDecisions', visible: true },
        config,
        data: dataWithYear,
      }),
    );
    expect(out).toContain('>Décisions<');
    expect(out).toContain('>Contrôle<');
    expect(out).toContain('>Moyenne<');
    expect(out).toContain('>Coefficient<');
    for (const n of ['I', 'II', 'III', 'IV']) expect(out).toContain(`>${n}<`);
    expect(out).toContain('>7,1<');
    expect(out).toContain('>6<');
    expect(out.match(/>16</g)).toHaveLength(2); // coefficient printed for the two graded periods only
    expect(out).toContain('>Moyenne Générale<');
    expect(out).toContain('>13,1<');
    expect(out).toContain('>32<');
  });

  it('uses the custom title', () => {
    const out = html(
      renderYearDecisions({
        block: { id: 'd', type: 'yearDecisions', visible: true, title: 'Bilan' },
        config,
        data: dataWithYear,
      }),
    );
    expect(out).toContain('>Bilan<');
    expect(out).not.toContain('>Décisions<');
  });

  it("shows a period's coefficient only when the student has an average, not merely when the class does", () => {
    // c2: hasGrades true (a classmate has an average) but the student was
    // absent the whole period, so average10 is null. The coefficient cell
    // must stay empty even though the class was graded.
    const dataWithAbsence: BulletinRenderData = {
      ...data,
      year: {
        terms: [
          {
            termId: 'c1',
            label: '1er contrôle',
            order: 1,
            hasGrades: true,
            subjects: [],
            totalPoints: 80,
            totalMax: 160,
            average10: 8,
            rank: 1,
            rankedCount: 10,
            coefficientSum: 16,
          },
          {
            termId: 'c2',
            label: '2ème contrôle',
            order: 2,
            hasGrades: true,
            subjects: [],
            totalPoints: null,
            totalMax: 160,
            average10: null,
            rank: null,
            rankedCount: 9,
            coefficientSum: 23,
          },
        ],
        generalAverage: 8,
        generalCoefficient: 16,
      },
    };
    const out = html(
      renderYearDecisions({
        block: { id: 'd', type: 'yearDecisions', visible: true },
        config,
        data: dataWithAbsence,
      }),
    );
    expect(out).not.toContain('>23<');
    // The graded period's own coefficient row and the Moyenne Générale row
    // both print 16 (the sum over graded periods only).
    expect(out.match(/>16</g)).toHaveLength(2);
  });
});

describe('yearSignatures block', () => {
  const dataWithYear: BulletinRenderData = { ...data, year: SAMPLE_BULLETIN_DATA.year };

  it('prints a Signatures heading and one Direction + Les Parents pair per period', () => {
    const out = html(
      renderYearSignatures({
        block: { id: 's', type: 'yearSignatures', visible: true },
        config,
        data: dataWithYear,
      }),
    );
    expect(out).toContain('>Signatures<');
    expect(out.match(/>Direction</g)).toHaveLength(4);
    expect(out.match(/>Les Parents</g)).toHaveLength(4);
  });

  it('uses the custom title and labels', () => {
    const out = html(
      renderYearSignatures({
        block: {
          id: 's',
          type: 'yearSignatures',
          visible: true,
          title: 'Visas',
          labels: { director: 'La direction', guardian: 'Le parent' },
        },
        config,
        data: dataWithYear,
      }),
    );
    expect(out).toContain('>Visas<');
    expect(out.match(/>La direction</g)).toHaveLength(4);
    expect(out.match(/>Le parent</g)).toHaveLength(4);
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
