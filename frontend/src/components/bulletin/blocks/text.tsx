import type {
  TextBlock,
  TextVerticalAlign,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

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
  return (
    <div
      className={`${ALIGN_CLASS[block.align]} ${VALIGN_CLASS[block.verticalAlign ?? 'top']}`.trim()}
      style={{
        fontSize: block.fontSize,
        fontWeight: block.bold ? 700 : 400,
        fontStyle: block.italic ? 'italic' : 'normal',
      }}
    >
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-2 whitespace-pre-line last:mb-0">
          {p}
        </p>
      ))}
    </div>
  );
}
