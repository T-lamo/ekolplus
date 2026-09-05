import type {
  StatsBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { fmt, ordinal, StatBox } from '../render-data';

export function render({
  config,
  data,
}: {
  block: StatsBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  return (
    <div className="flex gap-2.5">
      <StatBox
        label="Moyenne générale"
        value={fmt(data.overallAverage)}
        color={config.primaryColor}
      />
      {config.columns.rank && (
        <StatBox label="Rang dans la classe" value={ordinal(data.rank)} color="#1a9e5c" />
      )}
      {config.columns.absences && (
        <>
          <StatBox
            label="Absences (j.)"
            value={data.absencesDays == null ? '—' : String(data.absencesDays)}
            color="#f59e0b"
            tint="#fff8e1"
          />
          <StatBox
            label="Retards"
            value={data.retards == null ? '—' : String(data.retards)}
            color="#f59e0b"
            tint="#fff8e1"
          />
        </>
      )}
      <StatBox label="Moy. classe" value={fmt(data.classAverage)} color="#d93025" tint="#fdecea" />
    </div>
  );
}
