import type {
  Block,
  BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from '../render-data';
import { render as renderHeader } from './header';
import { render as renderStudentInfo } from './studentInfo';
import { render as renderStats } from './stats';
import { render as renderNotes } from './notes';
import { render as renderAbsences } from './absences';
import { render as renderAppreciation } from './appreciation';
import { render as renderSignatures } from './signatures';
import { render as renderText } from './text';
import { render as renderCover } from './cover';
import { render as renderCriteriaGrids } from './criteriaGrids';

export function renderBlock({
  block,
  config,
  data,
}: {
  block: Block;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
}): React.ReactNode {
  switch (block.type) {
    case 'header':
      return renderHeader({ block, config, data });
    case 'studentInfo':
      return renderStudentInfo({ block, config, data });
    case 'stats':
      return renderStats({ block, config, data });
    case 'notes':
      return renderNotes({ block, config, data });
    case 'absences':
      return renderAbsences({ block, config, data });
    case 'appreciation':
      return renderAppreciation({ block, config, data });
    case 'signatures':
      return renderSignatures({ block, config, data });
    case 'text':
      return renderText({ block, config, data });
    case 'cover':
      return renderCover({ block, config, data });
    case 'criteriaGrids':
      return renderCriteriaGrids({ block, config, data });
    default: {
      // Exhaustive check — TS will yell if we add a new block type and
      // forget it here, instead of this compiling silently and rendering
      // nothing for it (the return type, React.ReactNode, includes
      // `undefined`, so a missing case was never caught before).
      const _exhaustive: never = block;
      void _exhaustive;
      throw new Error('renderBlock: unknown block type');
    }
  }
}
