'use client';

import { GripVertical } from 'lucide-react';
import {
  DRAGGABLE_BLOCK_TYPES,
  type Page,
  type BulletinTemplateConfig,
} from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from './render-data';
import { renderBlock } from './blocks';
import { render as renderHeader } from './blocks/header';
import { render as renderStudentInfo } from './blocks/studentInfo';
import { getPageHeightPx } from './page-size';

export function BulletinPage({
  page,
  pageIndex,
  totalPages,
  config,
  data,
  chrome = true,
  selected,
  onSelect,
  dragBlockId,
  onDragStart,
  onDrop,
  onDragEnd,
}: {
  page: Page;
  pageIndex: number;
  totalPages: number;
  config: BulletinTemplateConfig;
  data: BulletinRenderData;
  chrome?: boolean;
  selected?: { pageId: string; blockId: string } | undefined;
  onSelect?: (pageId: string, blockId: string) => void;
  dragBlockId?: string | null;
  onDragStart?: (blockId: string) => void;
  onDrop?: (blockId: string) => void;
  onDragEnd?: () => void;
}) {
  const interactive = onSelect != null;
  const draggingEnabled = onDragStart != null && onDrop != null;
  const halves = page.layout === 'halves';
  const sidebar = page.layout === 'sidebar';
  // Fixed-height sheets: halves (CSS columns) and sidebar (two grid tracks)
  // both need a definite height so a column can stretch to the page.
  const fixedHeight = halves || sidebar;
  const asideWidth = page.asideWidth ?? 25;
  // The gradient stripes at the top and bottom of every sheet are on by
  // default; a template reproducing a plain paper form (the livret) turns
  // them off with `layout.showDecoration: false`.
  const showDecoration = config.layout.showDecoration ?? true;

  const headerBlock = page.blocks.find((b) => b.type === 'header');
  const studentInfoBlock = page.blocks.find((b) => b.type === 'studentInfo');
  const restBlocks = page.blocks.filter((b) => b.type !== 'header' && b.type !== 'studentInfo');
  const showTopRow = (headerBlock?.visible ?? false) || (studentInfoBlock?.visible ?? false);

  // Sidebar layout (spec 2026-09-06 §4.3): everything before the first
  // `breakBefore: 'column'` goes to the main column, the rest to the aside.
  const splitAt = sidebar ? restBlocks.findIndex((b) => b.breakBefore === 'column') : -1;
  const mainBlocks = splitAt >= 0 ? restBlocks.slice(0, splitAt) : restBlocks;
  const asideBlocks = splitAt >= 0 ? restBlocks.slice(splitAt) : [];

  const wrap = (block: (typeof restBlocks)[number], content: React.ReactNode) => {
    if (!block.visible) return null;
    const reorderable = draggingEnabled && DRAGGABLE_BLOCK_TYPES.includes(block.type);
    const isLastVisible = restBlocks.filter((b) => b.visible).slice(-1)[0]?.id === block.id;
    // A vertically aligned text block owns its whole column (halves/sidebar)
    // or the remaining page height (full) so the text renderer can center
    // inside it; `yearSignatures` always stretches to the column height.
    const fillsSpace =
      (block.type === 'text' && (block.verticalAlign ?? 'top') !== 'top') ||
      block.type === 'yearSignatures';
    return (
      <div
        key={block.id}
        data-block-id={block.id}
        onClick={() => onSelect?.(page.id, block.id)}
        draggable={reorderable}
        onDragStart={reorderable ? () => onDragStart?.(block.id) : undefined}
        onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
        onDrop={reorderable ? () => onDrop?.(block.id) : undefined}
        onDragEnd={reorderable ? onDragEnd : undefined}
        style={{
          marginBottom: fillsSpace ? 0 : config.layout.blockSpacing,
          marginTop: !halves && block.type === 'signatures' && isLastVisible ? 'auto' : undefined,
          height: fillsSpace && halves ? '100%' : undefined,
          flexGrow: fillsSpace && !halves ? 1 : undefined,
          opacity: dragBlockId === block.id ? 0.4 : 1,
          breakInside: block.breakBefore ? undefined : 'avoid',
          breakBefore: halves && block.breakBefore === 'column' ? 'column' : undefined,
          flexShrink: halves ? undefined : 0,
        }}
        className={`relative rounded ${interactive ? 'cursor-pointer' : ''} ${reorderable ? 'cursor-grab' : ''} ${
          selected?.pageId === page.id && selected.blockId === block.id
            ? 'outline outline-2 outline-primary'
            : ''
        }`}
      >
        {reorderable && (
          <span className="absolute top-1/2 -left-5 -translate-y-1/2 text-muted-foreground">
            <GripVertical size={14} />
          </span>
        )}
        {content}
      </div>
    );
  };

  const pageNumberText = config.content.pageNumberFormat
    .replace('{n}', String(pageIndex + 1))
    .replace('{total}', String(totalPages));

  return (
    <div
      className={`print-bulletin-canvas bulletin-print-root relative flex flex-col bg-white ${chrome ? 'overflow-hidden rounded-[2px] shadow-2xl' : ''}`}
      style={
        fixedHeight
          ? { height: getPageHeightPx(config), breakInside: 'avoid' }
          : { minHeight: getPageHeightPx(config) }
      }
    >
      {showDecoration && (
        <div
          className="h-1.5 shrink-0"
          style={{
            background: `linear-gradient(90deg, ${config.primaryColor}, var(--color-bulletin-gradient-end))`,
          }}
        />
      )}

      {showTopRow && (
        <div
          onClick={() => onSelect?.(page.id, (headerBlock ?? studentInfoBlock)!.id)}
          className={`flex shrink-0 items-center gap-0 border-b-[1.5px] px-5 py-3.5 ${interactive ? 'cursor-pointer' : ''}`}
          style={{ borderColor: `${config.primaryColor}30`, background: '#fdfcff' }}
        >
          {headerBlock?.visible && renderHeader({ block: headerBlock, config, data })}
          {studentInfoBlock?.visible &&
            renderStudentInfo({ block: studentInfoBlock, config, data })}
        </div>
      )}

      <div
        data-testid="bulletin-page-blocks"
        className={halves ? 'flex-1' : sidebar ? 'grid min-h-0 flex-1' : 'flex flex-1 flex-col'}
        style={{
          padding: config.layout.pageMargin,
          ...(halves
            ? {
                minHeight: 0,
                flex: '1 1 auto',
                columnCount: 2,
                columnFill: 'auto',
                columnGap: config.layout.blockSpacing * 2,
              }
            : sidebar
              ? {
                  flex: '1 1 auto',
                  gridTemplateColumns: `minmax(0, 1fr) ${asideWidth}%`,
                  gridTemplateRows: 'minmax(0, 1fr) auto',
                  columnGap: config.layout.blockSpacing * 2,
                  alignItems: 'stretch',
                }
              : {}),
        }}
      >
        {sidebar ? (
          <>
            <div data-testid="bulletin-page-main" className="flex min-h-0 min-w-0 flex-col">
              {mainBlocks.map((block) => wrap(block, renderBlock({ block, config, data })))}
            </div>
            <div data-testid="bulletin-page-aside" className="flex min-h-0 min-w-0 flex-col">
              {asideBlocks.map((block) => wrap(block, renderBlock({ block, config, data })))}
            </div>
          </>
        ) : (
          restBlocks.map((block) => wrap(block, renderBlock({ block, config, data })))
        )}

        {config.content.footerMessage && (
          <div
            className="shrink-0 text-center text-muted-foreground italic"
            style={{
              fontSize: config.typography.footer,
              ...(sidebar ? { gridColumn: '1 / -1' } : {}),
            }}
          >
            {config.content.footerMessage}
          </div>
        )}
      </div>

      {page.showPageNumber && (
        <div
          className="shrink-0 pb-2 text-center text-muted-foreground"
          style={{ fontSize: config.typography.footer }}
        >
          {pageNumberText}
        </div>
      )}

      {showDecoration && (
        <div
          className="h-1.5 shrink-0"
          style={{
            background: `linear-gradient(90deg, ${config.primaryColor}, var(--color-bulletin-gradient-end))`,
          }}
        />
      )}
    </div>
  );
}
