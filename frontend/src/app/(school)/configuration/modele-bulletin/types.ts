// Hand-mirrored client-side type duplicate of frontend/src/lib/server/
// bulletin-templates.ts (which has `import 'server-only'`, so client
// components cannot import from it — not even a type-only import, per
// this codebase's established convention, see page-size.ts's identical
// note). Keep this file's shapes structurally identical to the server
// Zod schema's inferred types whenever either changes.
import type { RichBlock } from '@/components/bulletin/rich-text';

export type LegacyBlockType =
  | 'header'
  | 'studentInfo'
  | 'stats'
  | 'notes'
  | 'absences'
  | 'appreciation'
  | 'signatures';

export type BlockType =
  | LegacyBlockType
  | 'text'
  | 'cover'
  | 'criteriaGrids'
  | 'yearGrid'
  | 'yearDecisions'
  | 'yearSignatures';

export const LEGACY_BLOCK_TYPES: LegacyBlockType[] = [
  'header',
  'studentInfo',
  'stats',
  'notes',
  'absences',
  'appreciation',
  'signatures',
];

export const YEAR_BLOCK_TYPES = ['yearGrid', 'yearDecisions', 'yearSignatures'] as const;

export const BLOCK_TYPES: BlockType[] = [
  ...LEGACY_BLOCK_TYPES,
  'text',
  'cover',
  'criteriaGrids',
  ...YEAR_BLOCK_TYPES,
];

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
  /** Printed heading; defaults to « Appréciation générale du conseil de classe ». */
  title?: string | undefined;
}
export interface SignaturesLabels {
  director?: string | undefined;
  homeroom?: string | undefined;
  guardian?: string | undefined;
}
export interface SignaturesBlock extends BlockBase {
  type: 'signatures';
  labels?: SignaturesLabels | undefined;
  /** 'lines' = a signature line with the label beneath, no heading (Word style). */
  style?: 'boxes' | 'lines' | undefined;
  homeroomFirst?: boolean | undefined;
}
export type TextVerticalAlign = 'top' | 'middle' | 'bottom';
export interface TextBlock extends BlockBase {
  type: 'text';
  /** Plain fallback of `rich` (paragraphs separated by a blank line); the
   * printed text when `rich` is absent. */
  text: string;
  /** Structured rich text (bold, italic, underline, lists, alignment);
   * never HTML. Takes precedence over `text` when present. */
  rich?: RichBlock[] | undefined;
  align: 'left' | 'center' | 'right' | 'justify';
  /** Vertical placement inside the column (halves) or the remaining page (full). */
  verticalAlign?: TextVerticalAlign | undefined;
  fontSize: number;
  bold: boolean;
  italic: boolean;
}
export type CoverField =
  | 'lastName'
  | 'firstName'
  | 'fullName'
  | 'className'
  | 'studentNumber'
  | 'nisu'
  | 'academicYear';
export interface CoverFieldLabels {
  lastName?: string | undefined;
  firstName?: string | undefined;
  fullName?: string | undefined;
  className?: string | undefined;
  studentNumber?: string | undefined;
  nisu?: string | undefined;
  academicYear?: string | undefined;
}
export interface CoverBlock extends BlockBase {
  type: 'cover';
  sectionLabel: string;
  titlePattern: string;
  showLogo: boolean;
  framed: boolean;
  frameStyle?: 'dashed' | 'solid' | 'rounded' | undefined;
  /** Absent = true: school name, section label and title in capitals. */
  uppercase?: boolean | undefined;
  /** Absent = 'top'. 'belowTitle' puts the logo between the title and the identity lines. */
  logoPosition?: 'top' | 'belowTitle' | undefined;
  fields: CoverField[];
  /** Per-field label override; absent fields keep the default French label. */
  fieldLabels?: CoverFieldLabels | undefined;
}
export interface CriteriaGridsBlock extends BlockBase {
  type: 'criteriaGrids';
  showScaleHeader: boolean;
  /** 'grid' = Word-style gridded table (border on every cell, plain header). */
  style?: 'modern' | 'grid' | undefined;
  /** Subject names to print, in this order (case/accent-insensitive); absent = all. */
  subjects?: string[] | undefined;
}
/** Matières × périodes grid of the annual carnet (spec 2026-09-06 §4.1). */
export interface YearGridBlock extends BlockBase {
  type: 'yearGrid';
  /** Print a bold heading row each time the subject domain changes. */
  showDomains?: boolean | undefined;
  notesLabel?: string | undefined;
  maxLabel?: string | undefined;
}
export interface YearDecisionsBlock extends BlockBase {
  type: 'yearDecisions';
  title?: string | undefined;
}
export interface YearSignaturesLabels {
  director?: string | undefined;
  guardian?: string | undefined;
}
export interface YearSignaturesBlock extends BlockBase {
  type: 'yearSignatures';
  title?: string | undefined;
  labels?: YearSignaturesLabels | undefined;
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
  | CriteriaGridsBlock
  | YearGridBlock
  | YearDecisionsBlock
  | YearSignaturesBlock;

export interface Page {
  id: string;
  layout: 'full' | 'halves' | 'sidebar';
  /** Percent width of the aside column of a sidebar page; absent = 25. */
  asideWidth?: number | undefined;
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
    /** Gradient stripes at the top and bottom of each sheet; absent = shown. */
    showDecoration?: boolean | undefined;
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
