import { CalendarX } from 'lucide-react';
import type {
  AbsencesBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

export function render({
  data,
}: {
  block: AbsencesBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  return (
    <div>
      <div className="mb-1.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
        Absences &amp; Retards
      </div>
      <div className="flex gap-1.5">
        <div className="flex flex-1 items-center gap-1.5 rounded-md bg-[#fff8e1] px-2.5 py-1.5">
          <CalendarX size={14} className="shrink-0 text-[#f59e0b]" />
          <div>
            <div className="text-caption font-extrabold text-[#f59e0b]">
              {data.absencesDays == null ? '—' : `${data.absencesDays} jours`}
            </div>
            <div className="text-[9px] text-muted-foreground">Absences totales</div>
          </div>
        </div>
        <div className="flex flex-1 items-center gap-1.5 rounded-md bg-[#fdecea] px-2.5 py-1.5">
          <CalendarX size={14} className="shrink-0 text-[#d93025]" />
          <div>
            <div className="text-caption font-extrabold text-[#d93025]">
              {data.retards == null ? '—' : data.retards}
            </div>
            <div className="text-[9px] text-muted-foreground">Retards</div>
          </div>
        </div>
      </div>
    </div>
  );
}
