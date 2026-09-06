import type {
  YearGridBlock,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';

// Matières × périodes grid of the annual carnet (spec 2026-09-06 §4.1).
// Completed in Task 3; without `data.year` the block prints nothing.
export function render({
  data,
}: {
  block: YearGridBlock;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  if (!('year' in data) || data.year == null) return null;
  return null;
}
