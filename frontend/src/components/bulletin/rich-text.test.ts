import { describe, it, expect } from 'vitest';
import {
  richTextFromDom,
  richTextFromPlain,
  richTextToPlain,
  type DomNodeLike,
  type RichBlock,
} from './rich-text';

// Tiny DOM stand-in: enough shape for the parser, no browser needed.
function text(t: string): DomNodeLike {
  return { nodeType: 3, nodeName: '#text', textContent: t, childNodes: [] };
}
function el(
  tag: string,
  children: DomNodeLike[],
  opts: { align?: string; attrAlign?: string; size?: string } = {},
): DomNodeLike {
  return {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    textContent: children.map((c) => c.textContent ?? '').join(''),
    childNodes: children,
    getAttribute: (name) => (name === 'align' ? (opts.attrAlign ?? null) : null),
    style: { textAlign: opts.align, fontSize: opts.size },
  };
}

describe('richTextFromPlain / richTextToPlain', () => {
  it('splits plain text into one paragraph per blank line and back', () => {
    const rich = richTextFromPlain('Observations :\n\nL’élève est promu.\n\n\nFin');
    expect(rich).toEqual([
      { kind: 'p', runs: [{ text: 'Observations :' }] },
      { kind: 'p', runs: [{ text: 'L’élève est promu.' }] },
      { kind: 'p', runs: [{ text: 'Fin' }] },
    ]);
    expect(richTextToPlain(rich)).toBe('Observations :\n\nL’élève est promu.\n\nFin');
  });

  it('flattens list items with a dash so the plain fallback stays readable', () => {
    const rich: RichBlock[] = [
      { kind: 'ol', items: [[{ text: 'Promu' }], [{ text: 'Maintenu', marks: ['bold'] }]] },
    ];
    expect(richTextToPlain(rich)).toBe('- Promu\n- Maintenu');
  });
});

describe('richTextFromDom', () => {
  it('turns marked inline content and block alignment into runs with marks', () => {
    const root = el('div', [
      el('div', [text('Extrait '), el('b', [text('des '), el('i', [text('règlements')])])], {
        align: 'center',
      }),
      el('p', [text('Suite')], { attrAlign: 'right' }),
    ]);
    expect(richTextFromDom(root)).toEqual([
      {
        kind: 'p',
        align: 'center',
        runs: [
          { text: 'Extrait ' },
          { text: 'des ', marks: ['bold'] },
          { text: 'règlements', marks: ['bold', 'italic'] },
        ],
      },
      { kind: 'p', align: 'right', runs: [{ text: 'Suite' }] },
    ]);
  });

  it('reads ordered and unordered lists into items and keeps <br> as a line break', () => {
    const root = el('div', [
      text('Intro'),
      el('br', []),
      text('deuxième ligne'),
      el('ol', [
        el('li', [text('Promu (e)')]),
        el('li', [el('u', [text('Maintenu')]), el('br', [])]),
      ]),
      el('ul', [el('li', [text('')])]),
    ]);
    expect(richTextFromDom(root)).toEqual([
      { kind: 'p', runs: [{ text: 'Intro\ndeuxième ligne' }] },
      {
        kind: 'ol',
        items: [[{ text: 'Promu (e)' }], [{ text: 'Maintenu', marks: ['underline'] }]],
      },
    ]);
  });

  it('reads a list alignment that the browser put on the items', () => {
    const root = el('div', [
      el('ul', [
        el('li', [text('Promu')], { align: 'center' }),
        el('li', [text('Maintenu')], { align: 'center' }),
      ]),
    ]);
    expect(richTextFromDom(root)).toEqual([
      { kind: 'ul', align: 'center', items: [[{ text: 'Promu' }], [{ text: 'Maintenu' }]] },
    ]);
  });

  it('reads a px font size from a span and keeps only sizes inside the allowed range', () => {
    const root = el('div', [
      el('div', [
        el('span', [text('Petit ')], { size: '8px' }),
        el('span', [el('b', [text('gras')]), text(' grand')], { size: '24px' }),
        el('span', [text(' hors limite')], { size: '200px' }),
        el('span', [text(' pas en px')], { size: '2em' }),
      ]),
    ]);
    expect(richTextFromDom(root)).toEqual([
      {
        kind: 'p',
        runs: [
          { text: 'Petit ', size: 8 },
          { text: 'gras', marks: ['bold'], size: 24 },
          { text: ' grand', size: 24 },
          { text: ' hors limite pas en px' },
        ],
      },
    ]);
  });

  it('keeps only the text of unknown elements and drops scripts entirely', () => {
    const root = el('div', [
      el('div', [
        el('span', [text('ok ')]),
        el('a', [text('lien')]),
        el('script', [text('alert(1)')]),
        el('img', []),
      ]),
    ]);
    expect(richTextFromDom(root)).toEqual([{ kind: 'p', runs: [{ text: 'ok lien' }] }]);
  });

  it('merges adjacent runs with the same marks and ignores empty blocks', () => {
    const root = el('div', [
      el('div', [el('b', [text('a')]), el('strong', [text('b')]), text('c')]),
      el('div', [el('br', [])]),
    ]);
    expect(richTextFromDom(root)).toEqual([
      { kind: 'p', runs: [{ text: 'ab', marks: ['bold'] }, { text: 'c' }] },
    ]);
  });
});
