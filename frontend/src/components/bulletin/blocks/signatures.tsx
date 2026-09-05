import type {
  SignaturesBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { SigBox } from '../render-data';

export function render({
  block,
  config,
  data,
}: {
  block: SignaturesBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  return (
    <div>
      <div className="mb-1.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
        Signatures
      </div>
      <div className="flex gap-3.5">
        {config.signatures.director && (
          <SigBox
            label={block.labels?.director ?? 'Signature du Directeur'}
            color={config.primaryColor}
            imageUrl={data.directorSignatureUrl}
            size={config.layout.signatureSize ?? 32}
          />
        )}
        {config.signatures.homeroom && (
          <SigBox
            label={block.labels?.homeroom ?? 'Signature du Titulaire de classe'}
            color={config.primaryColor}
          />
        )}
        {config.signatures.guardian && (
          <SigBox
            label={block.labels?.guardian ?? 'Signature du Parent / Tuteur'}
            color={config.primaryColor}
          />
        )}
      </div>
    </div>
  );
}
