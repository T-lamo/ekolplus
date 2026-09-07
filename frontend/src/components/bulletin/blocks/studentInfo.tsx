import type {
  StudentInfoBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// Renders the RIGHT half of BulletinPage.tsx's fixed top row. See
// blocks/header.tsx and Ruling R4.
export function render({
  config,
  data,
}: {
  block: StudentInfoBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  return (
    <div
      className="min-w-[150px] rounded-md border p-2.5 text-right"
      style={{
        background: `${config.primaryColor}0d`,
        borderColor: `${config.primaryColor}30`,
      }}
    >
      <div className="text-xs font-extrabold text-[#1a1a2e] uppercase">{data.studentName}</div>
      <div className="mt-0.5 text-[10px] text-[#6b6b8d]">
        {data.className} · Effectif : {data.classSize}
      </div>
      <div className="text-[9px] text-muted-foreground">{data.studentNumber}</div>
    </div>
  );
}
