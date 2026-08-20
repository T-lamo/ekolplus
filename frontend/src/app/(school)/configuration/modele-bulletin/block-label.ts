import type { BlockId } from './types';

export type BlockLabelT = (
  key: 'header' | 'studentInfo' | 'stats' | 'notes' | 'absences' | 'appreciation' | 'signatures',
) => string;

export function blockLabel(id: BlockId, t: BlockLabelT): string {
  return t(id);
}
