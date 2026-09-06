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

  const headerBlock = page.blocks.find((b) => b.type === 'header');
  const studentInfoBlock = page.blocks.find((b) => b.type === 'studentInfo');
  const restBlocks = page.blocks.filter((b) => b.type !== 'header' && b.type !== 'studentInfo');
  const showTopRow = (headerBlock?.visible ?? false) || (studentInfoBlock?.visible ?? false);

  const wrap = (block: (typeof restBlocks)[number], content: React.ReactNode) => {
    if (!block.visible) return null;
    const reorderable = draggingEnabled && DRAGGABLE_BLOCK_TYPES.includes(block.type);
    const isLastVisible = restBlocks.filter((b) => b.visible).slice(-1)[0]?.id === block.id;
    // A vertically aligned text block owns its whole column (halves) or the
    // remaining page height (full) so the text renderer can center inside it.
    const fillsSpace = block.type === 'text' && (block.verticalAlign ?? 'top') !== 'top';
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
          breakBefore: block.breakBefore === 'column' ? 'column' : undefined,
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
        halves
          ? { height: getPageHeightPx(config), breakInside: 'avoid' }
          : { minHeight: getPageHeightPx(config) }
      }
    >
      <div
        className="h-1.5 shrink-0"
        style={{
          background: `linear-gradient(90deg, ${config.primaryColor}, var(--color-bulletin-gradient-end))`,
        }}
      />

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
        className={halves ? 'flex-1' : 'flex flex-1 flex-col'}
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
            : {}),
        }}
      >
        {restBlocks.map((block) => wrap(block, renderBlock({ block, config, data })))}

        {config.content.footerMessage && (
          <div
            className="shrink-0 text-center text-muted-foreground italic"
            style={{ fontSize: config.typography.footer }}
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

      <div
        className="h-1.5 shrink-0"
        style={{
          background: `linear-gradient(90deg, ${config.primaryColor}, var(--color-bulletin-gradient-end))`,
        }}
      />
    </div>
  );
}
