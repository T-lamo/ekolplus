// Rich text of the bulletin's free-text block, as a small structured document
// instead of HTML: paragraphs and lists made of text runs that carry marks.
// Nothing a template author types is ever interpreted as markup, on screen
// or in the PDF (React renders the runs as text nodes), so bold, italic,
// lists and alignment come without any HTML injection surface. The shape
// is validated by the server schema (bulletin-templates.ts) and mirrored in
// the editor types (modele-bulletin/types.ts).
export type RichMark = 'bold' | 'italic' | 'underline';
export type RichAlign = 'left' | 'center' | 'right' | 'justify';

export interface RichRun {
  text: string;
  marks?: RichMark[] | undefined;
  /** Font size in px, within [RICH_SIZE_MIN, RICH_SIZE_MAX]; absent = the block's size. */
  size?: number | undefined;
}

export interface RichParagraph {
  kind: 'p';
  align?: RichAlign | undefined;
  runs: RichRun[];
}

export interface RichList {
  kind: 'ul' | 'ol';
  align?: RichAlign | undefined;
  items: RichRun[][];
}

export type RichBlock = RichParagraph | RichList;

export const RICH_MARKS: readonly RichMark[] = ['bold', 'italic', 'underline'];
export const RICH_ALIGNS: readonly RichAlign[] = ['left', 'center', 'right', 'justify'];
export const RICH_SIZE_MIN = 6;
export const RICH_SIZE_MAX = 48;
/** Sizes offered by the editor's toolbar (px). */
export const RICH_SIZES: readonly number[] = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];

/** A run size is only kept when it is an integer inside the allowed range. */
export function normalizeRichSize(value: unknown): number | undefined {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) return undefined;
  return n >= RICH_SIZE_MIN && n <= RICH_SIZE_MAX ? n : undefined;
}

/** Plain text (the block's `text`, paragraphs separated by a blank line) as rich blocks. */
export function richTextFromPlain(text: string): RichBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ kind: 'p', runs: [{ text: p }] }));
}

/** The rich blocks flattened back to the block's plain `text` (fallback + length cap). */
export function richTextToPlain(blocks: RichBlock[]): string {
  return blocks
    .map((b) =>
      b.kind === 'p'
        ? b.runs.map((r) => r.text).join('')
        : b.items.map((runs) => `- ${runs.map((r) => r.text).join('')}`).join('\n'),
    )
    .join('\n\n')
    .trim();
}

export function isRichTextEmpty(blocks: RichBlock[]): boolean {
  return richTextToPlain(blocks).length === 0;
}

// ---- DOM → rich (editor side) ----------------------------------------------
// Structural DOM types so the parser is unit-tested without a browser; only
// element names, text content, `style.textAlign`, `style.fontSize` (px) and
// the `align` attribute are read. Everything else (attributes, unknown elements, scripts) is
// dropped: an unknown element contributes nothing but its text.

export interface DomNodeLike {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomNodeLike>;
  getAttribute?: (name: string) => string | null;
  style?: { textAlign?: string | undefined; fontSize?: string | undefined } | undefined;
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
]);

function readAlign(node: DomNodeLike): RichAlign | undefined {
  const raw = (node.style?.textAlign || node.getAttribute?.('align') || '').toLowerCase();
  return RICH_ALIGNS.includes(raw as RichAlign) ? (raw as RichAlign) : undefined;
}

function normalizeMarks(marks: RichMark[]): RichMark[] | undefined {
  const unique = RICH_MARKS.filter((m) => marks.includes(m));
  return unique.length ? unique : undefined;
}

interface InlineStyle {
  marks: RichMark[];
  size?: number | undefined;
}

function readSize(node: DomNodeLike): number | undefined {
  const raw = node.style?.fontSize;
  if (!raw || !/^\d+(\.\d+)?px$/.test(raw)) return undefined;
  return normalizeRichSize(Math.round(parseFloat(raw)));
}

function pushText(runs: RichRun[], text: string, style: InlineStyle): void {
  if (!text) return;
  const m = normalizeMarks(style.marks);
  const last = runs[runs.length - 1];
  if (last && sameMarks(last.marks, m) && last.size === style.size) {
    last.text += text;
    return;
  }
  runs.push({
    text,
    ...(m ? { marks: m } : {}),
    ...(style.size !== undefined ? { size: style.size } : {}),
  });
}

function sameMarks(a: RichMark[] | undefined, b: RichMark[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((m, i) => m === y[i]);
}

function collectInline(node: DomNodeLike, style: InlineStyle, runs: RichRun[]): void {
  if (node.nodeType === TEXT_NODE) {
    pushText(runs, (node.textContent ?? '').replace(/\r/g, ''), style);
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const tag = node.nodeName.toUpperCase();
  if (tag === 'BR') {
    pushText(runs, '\n', style);
    return;
  }
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') return;
  const marks = [...style.marks];
  if (tag === 'B' || tag === 'STRONG') marks.push('bold');
  if (tag === 'I' || tag === 'EM') marks.push('italic');
  if (tag === 'U') marks.push('underline');
  const size = readSize(node) ?? style.size;
  const next: InlineStyle = { marks, ...(size !== undefined ? { size } : {}) };
  for (let i = 0; i < node.childNodes.length; i++) collectInline(node.childNodes[i]!, next, runs);
}

const NO_STYLE: InlineStyle = { marks: [] };

function trimRuns(runs: RichRun[]): RichRun[] {
  // Trailing line breaks the browser leaves behind a block end are noise.
  const out = runs.map((r) => ({ ...r }));
  while (out.length) {
    const last = out[out.length - 1]!;
    last.text = last.text.replace(/\n+$/, '');
    if (last.text) break;
    out.pop();
  }
  return out;
}

function isBlockElement(node: DomNodeLike): boolean {
  if (node.nodeType !== ELEMENT_NODE) return false;
  const tag = node.nodeName.toUpperCase();
  return BLOCK_TAGS.has(tag) || tag === 'UL' || tag === 'OL';
}

function hasBlockChild(node: DomNodeLike): boolean {
  for (let i = 0; i < node.childNodes.length; i++)
    if (isBlockElement(node.childNodes[i]!)) return true;
  return false;
}

/**
 * Reads a contentEditable root into rich blocks. Inline content that sits
 * directly under the root (before the browser wraps it in a div) becomes a
 * paragraph of its own; `<ul>/<ol>` become lists, every other block element
 * a paragraph; nested blocks are flattened in document order.
 */
export function richTextFromDom(root: DomNodeLike, inherited?: RichAlign): RichBlock[] {
  const blocks: RichBlock[] = [];
  let pending: RichRun[] = [];
  const pendingAlign: RichAlign | undefined = inherited;
  const flush = () => {
    const runs = trimRuns(pending);
    if (runs.length)
      blocks.push({ kind: 'p', ...(pendingAlign ? { align: pendingAlign } : {}), runs });
    pending = [];
  };
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i]!;
    if (!isBlockElement(child)) {
      collectInline(child, NO_STYLE, pending);
      continue;
    }
    flush();
    const tag = child.nodeName.toUpperCase();
    let align = readAlign(child) ?? inherited;
    if (tag === 'UL' || tag === 'OL') {
      const items: RichRun[][] = [];
      for (let j = 0; j < child.childNodes.length; j++) {
        const li = child.childNodes[j]!;
        // Browsers align a list by styling each <li>, never the list itself.
        if (!readAlign(child)) align = readAlign(li) ?? align;
        const runs: RichRun[] = [];
        collectInline(li, NO_STYLE, runs);
        const trimmed = trimRuns(runs);
        if (trimmed.length) items.push(trimmed);
      }
      if (items.length)
        blocks.push({ kind: tag === 'UL' ? 'ul' : 'ol', ...(align ? { align } : {}), items });
      continue;
    }
    if (hasBlockChild(child)) {
      blocks.push(...richTextFromDom(child, align));
      continue;
    }
    const runs: RichRun[] = [];
    collectInline(child, NO_STYLE, runs);
    const trimmed = trimRuns(runs);
    if (trimmed.length) blocks.push({ kind: 'p', ...(align ? { align } : {}), runs: trimmed });
  }
  flush();
  return blocks;
}
