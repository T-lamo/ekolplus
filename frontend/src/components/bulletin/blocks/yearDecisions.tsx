import type {
  YearDecisionsBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// « Décisions » table of the annual carnet (spec 2026-09-06 §4.1).
// Completed in Task 4; without `data.year` the block prints nothing.
export function render({
  data,
}: {
  block: YearDecisionsBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  if (!('year' in data) || data.year == null) return null;
  return null;
}
