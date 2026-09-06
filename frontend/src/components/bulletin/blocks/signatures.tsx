import type {
  SignaturesBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { SigBox } from '../render-data';

interface Signatory {
  key: 'director' | 'homeroom' | 'guardian';
  label: string;
  imageUrl: string | null;
  size: number;
}

export function render({
  block,
  config,
  data,
}: {
  block: SignaturesBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const size = config.layout.signatureSize ?? 32;
  const director: Signatory | null = config.signatures.director
    ? {
        key: 'director',
        label: block.labels?.director ?? 'Signature du Directeur',
        imageUrl: data.directorSignatureUrl,
        size,
      }
    : null;
  const homeroom: Signatory | null = config.signatures.homeroom
    ? {
        key: 'homeroom',
        label: block.labels?.homeroom ?? 'Signature du Titulaire de classe',
        imageUrl: null,
        size,
      }
    : null;
  const guardian: Signatory | null = config.signatures.guardian
    ? {
        key: 'guardian',
        label: block.labels?.guardian ?? 'Signature du Parent / Tuteur',
        imageUrl: null,
        size,
      }
    : null;
  const ordered = (
    block.homeroomFirst ? [homeroom, director, guardian] : [director, homeroom, guardian]
  ).filter((s): s is Signatory => s != null);

  // 'lines': a signature line with the label beneath and no heading, the
  // way the livret's Word document lays out « La jardinière » and
  // « La direction » (spec §12).
  if (block.style === 'lines') {
    return (
      <div className="flex gap-6 pt-2">
        {ordered.map((s) => (
          <div key={s.key} className="flex flex-1 flex-col items-center justify-end">
            {s.imageUrl && (
              <img
                src={s.imageUrl}
                alt={s.label}
                className="mb-1 w-auto object-contain"
                style={{ height: s.size }}
              />
            )}
            <div
              className="w-full border-b border-[#1a1a2e]"
              style={{ minHeight: s.imageUrl ? 0 : s.size }}
            />
            <div className="mt-1 text-center text-xs text-[#1a1a2e]">{s.label}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
        Signatures
      </div>
      <div className="flex gap-3.5">
        {ordered.map((s) => (
          <SigBox
            key={s.key}
            label={s.label}
            color={config.primaryColor}
            imageUrl={s.imageUrl}
            size={s.size}
          />
        ))}
      </div>
    </div>
  );
}
