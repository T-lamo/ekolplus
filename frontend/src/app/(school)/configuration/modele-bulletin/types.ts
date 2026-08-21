export type BlockId =
  | 'header'
  | 'studentInfo'
  | 'stats'
  | 'notes'
  | 'absences'
  | 'appreciation'
  | 'signatures';

// Only these 5 are draggable in the editor — header renders in a fixed top
// row and the footer stripe is a non-configurable decoration, matching what
// the Banani canvas actually renders as distinct, positionable elements.
export const REORDERABLE_BLOCK_IDS: BlockId[] = [
  'stats',
  'notes',
  'absences',
  'appreciation',
  'signatures',
];

export interface BulletinTemplateConfig {
  primaryColor: string;
  pageFormat: 'LETTER' | 'A4';
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  blocks: { id: BlockId; visible: boolean }[];
  columns: {
    coefficient: boolean;
    classAverage: boolean;
    minMax: boolean;
    appreciation: boolean;
    absences: boolean;
    rank: boolean;
  };
  signatures: { director: boolean; homeroom: boolean; guardian: boolean };
  typography: {
    schoolName: number;
    title: number;
    tableBody: number;
    tableHeader: number;
    noteValue: number;
    footer: number;
  };
  content: { title: string; footerMessage: string | null };
  layout: {
    pageMargin: number;
    blockSpacing: number;
    borderWidth: number;
    borderStyle: 'solid' | 'dashed' | 'dotted';
    borderColor: string;
    cellPaddingX: number;
    cellPaddingY: number;
    tableLineHeight: number;
    showTableBackgrounds: boolean;
    // Optional: absent on templates saved before this field existed. Typed
    // with an explicit `| undefined` (not just `?:`) to match the zod-schema
    // -inferred shape from bulletin-templates.ts under exactOptionalPropertyTypes.
    logoSize?: number | undefined;
    signatureSize?: number | undefined;
  };
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  forkedFromId: string | null;
  primaryColor: string;
  updatedAt: string;
}

export interface TemplateListData {
  personal: TemplateRow[];
  global: TemplateRow[];
}

export interface TemplateDetail {
  id: string;
  schoolId: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  forkedFromId: string | null;
  config: BulletinTemplateConfig;
  isOwn: boolean;
  createdAt: string;
  updatedAt: string;
}
