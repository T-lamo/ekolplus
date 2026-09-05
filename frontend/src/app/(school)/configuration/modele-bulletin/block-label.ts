import type { BlockType } from './types';

export type BlockLabelT = (
  key:
    | 'header'
    | 'studentInfo'
    | 'stats'
    | 'notes'
    | 'absences'
    | 'appreciation'
    | 'signatures'
    | 'text'
    | 'cover'
    | 'criteriaGrids',
) => string;

export function blockLabel(type: BlockType, t: BlockLabelT): string {
  return t(type);
}
