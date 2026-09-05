import { LayoutTemplate } from 'lucide-react';
import type {
  HeaderBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// Renders combined with studentInfo by BulletinPage.tsx's fixed top row —
// this file only renders the LEFT half of that row (logo, school name,
// title, period line). See Ruling R4 in
// docs/superpowers/plans/2026-09-05-bulletin-pages-engine.md.
export function render({
  config,
  data,
}: {
  block: HeaderBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  const logoSize = config.layout.logoSize ?? 52;
  return (
    <>
      {data.schoolLogoUrl ? (
        <img
          src={data.schoolLogoUrl}
          alt={data.schoolName}
          className="shrink-0 rounded-md object-contain"
          style={{ height: logoSize, width: logoSize }}
        />
      ) : (
        <div
          className="flex shrink-0 items-center justify-center rounded-md border-[1.5px] border-dashed"
          style={{
            height: logoSize,
            width: logoSize,
            borderColor: `${config.primaryColor}80`,
            background: `${config.primaryColor}0d`,
          }}
        >
          <LayoutTemplate size={18} style={{ color: `${config.primaryColor}80` }} />
        </div>
      )}
      <div className="flex flex-1 flex-col items-center gap-0.5">
        <div
          className="font-extrabold"
          style={{ color: config.primaryColor, fontSize: config.typography.schoolName }}
        >
          {data.schoolName}
        </div>
        <div
          className="font-black tracking-widest text-[#1a1a2e] uppercase"
          style={{ fontSize: config.typography.title }}
        >
          {config.content.title}
        </div>
        <div className="text-[10px] text-muted-foreground">
          Année {data.academicYear} · {data.period}
        </div>
      </div>
    </>
  );
}
