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

export function render({
  block,
}: {
  block: TextBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const paragraphs = block.text
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
