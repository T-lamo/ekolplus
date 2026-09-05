import type {
  AppreciationBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// `style: 'lines'` renders the general appreciation as ruled lines instead
// of the default boxed paragraph — spec §9.1: "le texte de l'appréciation
// générale posé sur N lignes réglées, lignes vides si absent."
export function render({
  block,
  data,
}: {
  block: AppreciationBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  if (block.style === 'lines') {
    const lineCount = block.lines ?? 3;
    const text = data.generalAppreciation ?? '';
    return (
      <div>
        <div className="mb-1.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
          Appréciation générale du conseil de classe
        </div>
        <div>
          {Array.from({ length: lineCount }).map((_, i) => (
            <div
              key={i}
              className="border-b border-[#c9c4dd] text-2xs leading-[22px] text-[#1a1a2e] italic"
            >
              {i === 0 ? text : ''}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#e8e4f6] bg-[#faf9ff] p-2.5">
      <div className="mb-1 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
        Appréciation générale du conseil de classe
      </div>
      <div className="text-2xs leading-relaxed text-[#1a1a2e] italic">
        {data.generalAppreciation || 'Aucune appréciation générale saisie.'}
      </div>
    </div>
  );
}
