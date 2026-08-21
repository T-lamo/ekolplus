// Pure page-geometry math shared by BulletinCanvas ('use client', so its
// exports can only be rendered as a Component or passed to a Client
// Component — the server-side PDF generator (lib/server/bulletin-pdf/
// generate.ts) needs to CALL these as plain functions to set Puppeteer's
// viewport, which Next.js refuses across the client boundary. Kept in its
// own plain module so both sides import the same source of truth without
// crossing it.
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';

// Real paper dimensions in CSS px at 96dpi (1in = 96px) — the same
// convention the browser/Puppeteer use for `@page size: a4 | letter` when
// generating the PDF.
export const PAGE_PX_PER_IN = 96;
export const PAGE_SIZES_IN: Record<'A4' | 'LETTER', { w: number; h: number }> = {
  A4: { w: 8.27, h: 11.69 },
  LETTER: { w: 8.5, h: 11 },
};
export function getPageWidthPx(
  config: Pick<BulletinTemplateConfig, 'pageFormat' | 'orientation'>,
): number {
  const dims = PAGE_SIZES_IN[config.pageFormat];
  const inW = config.orientation === 'LANDSCAPE' ? dims.h : dims.w;
  return Math.round(inW * PAGE_PX_PER_IN);
}
export function getPageHeightPx(
  config: Pick<BulletinTemplateConfig, 'pageFormat' | 'orientation'>,
): number {
  const dims = PAGE_SIZES_IN[config.pageFormat];
  const inH = config.orientation === 'LANDSCAPE' ? dims.w : dims.h;
  return Math.round(inH * PAGE_PX_PER_IN);
}
