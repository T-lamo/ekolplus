'use client';

// Small rich-text editor for the bulletin's free-text block: bold, italic,
// underline, text size, bulleted / numbered lists and paragraph alignment. It edits a
// contentEditable surface and hands back a structured document
// (components/bulletin/rich-text.ts), never HTML: the DOM is read through an
// allowlist parser, so anything pasted that is not one of the supported
// marks is reduced to its text. Rendering the value back into the surface
// goes through document.createElement with text nodes only.
import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Underline,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  RICH_SIZES,
  normalizeRichSize,
  richTextFromDom,
  richTextToPlain,
  type RichAlign,
  type RichBlock,
  type RichRun,
} from '@/components/bulletin/rich-text';

interface RichTextEditorProps {
  value: RichBlock[];
  onChange: (value: RichBlock[]) => void;
  /** Height of the editing surface (CSS value). */
  minHeight?: number | string;
  autoFocus?: boolean;
}

function runsToDom(doc: Document, runs: RichRun[], parent: HTMLElement): void {
  for (const run of runs) {
    const lines = run.text.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) parent.appendChild(doc.createElement('br'));
      if (!line) return;
      let node: Node = doc.createTextNode(line);
      const marks = run.marks ?? [];
      if (marks.includes('underline')) {
        const u = doc.createElement('u');
        u.appendChild(node);
        node = u;
      }
      if (marks.includes('italic')) {
        const i = doc.createElement('i');
        i.appendChild(node);
        node = i;
      }
      if (marks.includes('bold')) {
        const b = doc.createElement('b');
        b.appendChild(node);
        node = b;
      }
      if (run.size !== undefined) {
        const span = doc.createElement('span');
        span.style.fontSize = `${run.size}px`;
        span.appendChild(node);
        node = span;
      }
      parent.appendChild(node);
    });
  }
}

function richToDom(doc: Document, blocks: RichBlock[], root: HTMLElement): void {
  root.replaceChildren();
  for (const block of blocks) {
    if (block.kind === 'p') {
      const p = doc.createElement('div');
      if (block.align) p.style.textAlign = block.align;
      runsToDom(doc, block.runs, p);
      if (!p.hasChildNodes()) p.appendChild(doc.createElement('br'));
      root.appendChild(p);
      continue;
    }
    const list = doc.createElement(block.kind);
    if (block.align) list.style.textAlign = block.align;
    for (const runs of block.items) {
      const li = doc.createElement('li');
      runsToDom(doc, runs, li);
      list.appendChild(li);
    }
    root.appendChild(list);
  }
  if (!root.hasChildNodes()) {
    const p = doc.createElement('div');
    p.appendChild(doc.createElement('br'));
    root.appendChild(p);
  }
}

/** Size (px) applied to the element the selection starts in, if any. */
function sizeAtSelection(surface: HTMLElement): number | undefined {
  const sel = surface.ownerDocument.getSelection();
  let node: Node | null = sel?.anchorNode ?? null;
  while (node && node !== surface) {
    if (node instanceof HTMLElement) {
      const size = normalizeRichSize(parseFloat(node.style.fontSize));
      if (size !== undefined) return size;
    }
    node = node.parentNode;
  }
  return undefined;
}

const ALIGN_COMMAND: Record<RichAlign, string> = {
  left: 'justifyLeft',
  center: 'justifyCenter',
  right: 'justifyRight',
  justify: 'justifyFull',
};

export function RichTextEditor({
  value,
  onChange,
  minHeight = 220,
  autoFocus = false,
}: RichTextEditorProps) {
  const t = useTranslations('Common.richText');
  const ref = useRef<HTMLDivElement>(null);
  // The last value this component emitted: an incoming `value` equal to it
  // is our own echo and must not rebuild the DOM (that would drop the caret).
  const emitted = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = JSON.stringify(value);
    if (key === emitted.current) return;
    richToDom(el.ownerDocument, value, el);
    emitted.current = key;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Size shown by the toolbar select: the one at the caret, refreshed on
  // every selection change while the editor is mounted.
  const [currentSize, setCurrentSize] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const doc = el.ownerDocument;
    const refresh = () => {
      if (el.contains(doc.activeElement)) setCurrentSize(sizeAtSelection(el));
    };
    doc.addEventListener('selectionchange', refresh);
    return () => doc.removeEventListener('selectionchange', refresh);
  }, []);
  // The selection to restore when the size select takes the focus.
  const savedRange = useRef<Range | null>(null);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const next = richTextFromDom(el);
    emitted.current = JSON.stringify(next);
    onChange(next);
  };

  const applySize = (size: number | undefined) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = el.ownerDocument.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    // execCommand('fontSize') wraps the selection in <font size="7">; each
    // wrapper becomes a span carrying the px size (or nothing, for the
    // block's default), with older sizes inside it cleared.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('fontSize', false, '7');
    for (const font of Array.from(el.querySelectorAll('font'))) {
      const span = el.ownerDocument.createElement('span');
      if (size !== undefined) span.style.fontSize = `${size}px`;
      for (const inner of Array.from(font.querySelectorAll<HTMLElement>('[style]')))
        inner.style.fontSize = '';
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    }
    setCurrentSize(size);
    emit();
  };

  const exec = (command: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Plain markup (b/i/u, text-align) instead of inline CSS spans, which
    // the parser reads directly.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false);
    emit();
  };

  const tools: { icon: typeof Bold; label: string; command: string }[] = [
    { icon: Bold, label: t('bold'), command: 'bold' },
    { icon: Italic, label: t('italic'), command: 'italic' },
    { icon: Underline, label: t('underline'), command: 'underline' },
    { icon: List, label: t('bulletList'), command: 'insertUnorderedList' },
    { icon: ListOrdered, label: t('numberedList'), command: 'insertOrderedList' },
    { icon: AlignLeft, label: t('alignLeft'), command: ALIGN_COMMAND.left },
    { icon: AlignCenter, label: t('alignCenter'), command: ALIGN_COMMAND.center },
    { icon: AlignRight, label: t('alignRight'), command: ALIGN_COMMAND.right },
    { icon: AlignJustify, label: t('alignJustify'), command: ALIGN_COMMAND.justify },
  ];

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/60 px-1.5 py-1">
        {tools.map(({ icon: Icon, label, command }, i) => (
          <span key={command} className="flex items-center">
            {i === 3 && (
              <>
                <span className="mx-1 h-4 w-px bg-border" />
                <select
                  title={t('size')}
                  aria-label={t('size')}
                  value={currentSize ?? ''}
                  onMouseDown={() => {
                    const range = ref.current?.ownerDocument.getSelection()?.getRangeAt(0);
                    savedRange.current =
                      range && ref.current?.contains(range.commonAncestorContainer)
                        ? range.cloneRange()
                        : null;
                  }}
                  onChange={(e) => applySize(normalizeRichSize(e.target.value))}
                  className="mr-1 h-7 rounded border border-border bg-card px-1 text-xs text-foreground outline-none"
                >
                  <option value="">{t('sizeDefault')}</option>
                  {RICH_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span className="mx-1 h-4 w-px bg-border" />
              </>
            )}
            {i === 5 && <span className="mx-1 h-4 w-px bg-border" />}
            <button
              type="button"
              title={label}
              aria-label={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(command)}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-card hover:text-foreground"
            >
              <Icon size={14} />
            </button>
          </span>
        ))}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Pasted text only: rich clipboard markup would otherwise reach the
          // surface before the parser strips it.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          emit();
        }}
        style={{ minHeight }}
        className="rich-text-surface overflow-y-auto px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground outline-none [&_li]:ml-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4"
      />
    </div>
  );
}

/** One-line summary of a rich value for the compact panel preview. */
export function richTextSummary(blocks: RichBlock[], max = 90): string {
  const plain = richTextToPlain(blocks).replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
