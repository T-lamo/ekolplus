'use client';

import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { BulletinRenderData } from './render-data';
import { BulletinPage } from './BulletinPage';

// Natural (unscaled) px gap between stacked sheets — exported so callers
// that scale the whole document (BulletinViewer, the editor) can compute
// the total document height without duplicating this constant.
export const PAGE_GAP_PX = 24;

export function BulletinDocument({
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
  return (
    <div className="flex flex-col" style={{ gap: PAGE_GAP_PX }}>
      {config.pages.map((page, index) => {
        const pageProps: Parameters<typeof BulletinPage>[0] = {
          page,
          pageIndex: index,
          totalPages: config.pages.length,
          config,
          data,
          chrome,
        };
        if (selected !== undefined) pageProps.selected = selected;
        if (onSelect !== undefined) pageProps.onSelect = onSelect;
        if (dragBlockId !== undefined) pageProps.dragBlockId = dragBlockId;
        if (onDragStart !== undefined) pageProps.onDragStart = onDragStart;
        if (onDrop !== undefined) pageProps.onDrop = onDrop;
        if (onDragEnd !== undefined) pageProps.onDragEnd = onDragEnd;

        return (
          <div
            key={page.id}
            style={index < config.pages.length - 1 ? { breakAfter: 'page' } : undefined}
          >
            <BulletinPage {...pageProps} />
          </div>
        );
      })}
    </div>
  );
}
