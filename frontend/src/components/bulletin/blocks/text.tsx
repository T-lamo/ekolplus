import type {
  TextBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

const ALIGN_CLASS: Record<TextBlock['align'], string> = {
  left: 'text-left',
  center: 'text-center',
  justify: 'text-justify',
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
      className={ALIGN_CLASS[block.align]}
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
