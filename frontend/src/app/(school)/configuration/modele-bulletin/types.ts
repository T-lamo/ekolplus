// Hand-mirrored client-side type duplicate of frontend/src/lib/server/
// bulletin-templates.ts (which has `import 'server-only'`, so client
// components cannot import from it — not even a type-only import, per
// this codebase's established convention, see page-size.ts's identical
// note). Keep this file's shapes structurally identical to the server
// Zod schema's inferred types whenever either changes.
export type LegacyBlockType =
  | 'header'
  | 'studentInfo'
  | 'stats'
  | 'notes'
  | 'absences'
  | 'appreciation'
  | 'signatures';

export type BlockType = LegacyBlockType | 'text' | 'cover' | 'criteriaGrids';

export const LEGACY_BLOCK_TYPES: LegacyBlockType[] = [
  'header',
  'studentInfo',
  'stats',
  'notes',
  'absences',
  'appreciation',
  'signatures',
];

export const BLOCK_TYPES: BlockType[] = [...LEGACY_BLOCK_TYPES, 'text', 'cover', 'criteriaGrids'];

// Every type except header/studentInfo — those two always render in a
// fixed combined top row regardless of their position in `blocks` (see
// Ruling R4 in docs/superpowers/plans/2026-09-05-bulletin-pages-engine.md).
export const DRAGGABLE_BLOCK_TYPES: BlockType[] = BLOCK_TYPES.filter(
  (t) => t !== 'header' && t !== 'studentInfo',
);

interface BlockBase {
  id: string;
  visible: boolean;
  breakBefore?: 'column' | undefined;
}

export interface HeaderBlock extends BlockBase {
  type: 'header';
}
export interface StudentInfoBlock extends BlockBase {
  type: 'studentInfo';
}
export interface StatsBlock extends BlockBase {
  type: 'stats';
}
export interface NotesBlock extends BlockBase {
  type: 'notes';
}
export interface AbsencesBlock extends BlockBase {
  type: 'absences';
}
export interface AppreciationBlock extends BlockBase {
  type: 'appreciation';
  style?: 'box' | 'lines' | undefined;
  lines?: number | undefined;
}
export interface SignaturesLabels {
  director?: string | undefined;
  homeroom?: string | undefined;
  guardian?: string | undefined;
}
export interface SignaturesBlock extends BlockBase {
  type: 'signatures';
  labels?: SignaturesLabels | undefined;
}
export interface TextBlock extends BlockBase {
  type: 'text';
  text: string;
  align: 'left' | 'center' | 'justify';
  fontSize: number;
  bold: boolean;
  italic: boolean;
}
export type CoverField = 'lastName' | 'firstName' | 'className' | 'studentNumber' | 'academicYear';
export interface CoverBlock extends BlockBase {
  type: 'cover';
  sectionLabel: string;
  titlePattern: string;
  showLogo: boolean;
  framed: boolean;
  fields: CoverField[];
}
export interface CriteriaGridsBlock extends BlockBase {
  type: 'criteriaGrids';
  showScaleHeader: boolean;
}

export type Block =
  | HeaderBlock
  | StudentInfoBlock
  | StatsBlock
  | NotesBlock
  | AbsencesBlock
  | AppreciationBlock
  | SignaturesBlock
  | TextBlock
  | CoverBlock
  | CriteriaGridsBlock;

export interface Page {
  id: string;
  layout: 'full' | 'halves';
  showPageNumber: boolean;
  blocks: Block[];
}

export const DEFAULT_PAGE_NUMBER_FORMAT = '{n} / {total}';

export interface BulletinTemplateConfig {
  primaryColor: string;
  pageFormat: 'LETTER' | 'A4';
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  pages: Page[];
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
  content: { title: string; footerMessage: string | null; pageNumberFormat: string };
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
