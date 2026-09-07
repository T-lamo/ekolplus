import type {
  TextBlock,
  TextVerticalAlign,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import type { RichAlign, RichBlock, RichRun } from '../rich-text';

const ALIGN_CLASS: Record<TextBlock['align'], string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
};

// 'middle' / 'bottom' stretch the block to its container (BulletinPage gives
// the wrapper the full column height on a halves page, the remaining height
// on a full page) and place the paragraphs inside it, the way the livret's
// verse sits vertically centered on the back cover (spec §12).
const VALIGN_CLASS: Record<TextVerticalAlign, string> = {
  top: '',
  middle: 'flex h-full flex-col justify-center',
  bottom: 'flex h-full flex-col justify-end',
};

// Placeholders a template author can type in a text block (spec 2026-09-06
// §4.2); an unknown {name} is printed as typed.
const VARIABLES: Record<string, (d: BulletinRenderData) => string> = {
  eleve: (d) => d.studentName,
  classe: (d) => d.className,
  annee: (d) => d.academicYearLabel,
  periode: (d) => d.termLabel,
  ecole: (d) => d.schoolName,
};
export function substituteVariables(text: string, data: BulletinRenderData): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const read = VARIABLES[key];
    return read ? read(data) : match;
  });
}

// Rich runs become React text nodes wrapped in strong/em/u: the author's
// text is never parsed as markup, so no injection is possible here or in
// the PDF (which renders this same tree).
function renderRuns(runs: RichRun[], data: BulletinRenderData): React.ReactNode {
  return runs.map((run, i) => {
    let node: React.ReactNode = substituteVariables(run.text, data);
    const marks = run.marks ?? [];
    if (marks.includes('underline')) node = <u>{node}</u>;
    if (marks.includes('italic')) node = <em>{node}</em>;
    if (marks.includes('bold')) node = <strong>{node}</strong>;
    // A run size is a validated integer (px); it never comes from markup.
    const style = run.size !== undefined ? { fontSize: `${run.size}px` } : undefined;
    return (
      <span key={i} style={style}>
        {node}
      </span>
    );
  });
}

const RICH_ALIGN_CLASS: Record<RichAlign, string> = ALIGN_CLASS;

function renderRich(blocks: RichBlock[], data: BulletinRenderData): React.ReactNode {
  return blocks.map((block, i) => {
    const alignClass = block.align ? RICH_ALIGN_CLASS[block.align] : '';
    if (block.kind === 'p') {
      return (
        <p key={i} className={`mb-2 whitespace-pre-line last:mb-0 ${alignClass}`.trim()}>
          {renderRuns(block.runs, data)}
        </p>
      );
    }
    const List = block.kind === 'ol' ? 'ol' : 'ul';
    return (
      <List
        key={i}
        className={`mb-2 pl-5 whitespace-pre-line last:mb-0 ${block.kind === 'ol' ? 'list-decimal' : 'list-disc'} ${alignClass}`.trim()}
      >
        {block.items.map((runs, j) => (
          <li key={j}>{renderRuns(runs, data)}</li>
        ))}
      </List>
    );
  });
}

export function render({
  block,
  data,
}: {
  block: TextBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const paragraphs = substituteVariables(block.text, data)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const rich = block.rich && block.rich.length > 0 ? block.rich : null;
  return (
    <div
      className={`${ALIGN_CLASS[block.align]} ${VALIGN_CLASS[block.verticalAlign ?? 'top']}`.trim()}
      style={{
        fontSize: block.fontSize,
        fontWeight: block.bold ? 700 : 400,
        fontStyle: block.italic ? 'italic' : 'normal',
      }}
    >
      {rich
        ? renderRich(rich, data)
        : paragraphs.map((p, i) => (
            <p key={i} className="mb-2 whitespace-pre-line last:mb-0">
              {p}
            </p>
          ))}
    </div>
  );
}
