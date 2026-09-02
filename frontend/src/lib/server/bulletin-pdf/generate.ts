// Server-side WYSIWYG PDF via headless Chromium: navigates to the
// standalone print page (app/print/bulletin/[studentId]/[termId]), which
// renders the exact same BulletinCanvas the Viewer shows on screen — see
// docs/superpowers/specs/2026-08-13-bulletin-pdf-and-editor-design.md for
// why this beats a parallel PDF-primitive renderer. @sparticuz/chromium
// bundles a Vercel/serverless-compatible Chromium binary; puppeteer-core
// (no bundled browser) drives it — this pairing works both locally and on
// Vercel with the same code path.
import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { createLogger } from '@/lib/server/logger';
import { signPrintToken, signTemplatePreviewToken } from './print-token';
import { resolvePrintBaseUrl } from './print-base-url';
import { getPageWidthPx, getPageHeightPx } from '@/components/bulletin/page-size';
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';
import type { ViewAudience } from '@/lib/server/student-views/audience';

const logger = createLogger();

export class PdfGenerationError extends Error {}

export interface GeneratePdfOptions {
  pageFormat: 'LETTER' | 'A4';
  orientation: 'LANDSCAPE' | 'PORTRAIT';
}

function errorDetails(err: unknown): { message: string; stack?: string | undefined } {
  return err instanceof Error
    ? { message: err.message, stack: err.stack }
    : { message: String(err) };
}

// chromium.executablePath() locates its own bin/*.br files via a path
// relative to its own __dirname. next.config.ts's outputFileTracingIncludes
// makes sure those files ARE part of the deployed bundle, but on at least
// one confirmed Vercel deployment the default lookup still failed to find
// them there (the trace guarantees the files ship, not exactly where they
// land relative to the package's own directory at runtime) — so retry once,
// pointing explicitly at the conventional node_modules path, before giving
// up. This mirrors the community-verified workaround for this exact
// failure mode.
async function resolveChromiumExecutablePath(): Promise<string> {
  try {
    return await chromium.executablePath();
  } catch (err) {
    const fallbackBinPath = join(process.cwd(), 'node_modules/@sparticuz/chromium/bin');
    if (existsSync(fallbackBinPath)) {
      logger.warn(
        'bulletin-pdf: default chromium.executablePath() failed, retrying with explicit bin path',
        {
          ...errorDetails(err),
          fallbackBinPath,
        },
      );
      return chromium.executablePath(fallbackBinPath);
    }
    throw err;
  }
}

// Shared by generateBulletinPdf and generateBulletinTemplatePreviewPdf —
// both just point headless Chromium at a different print page URL and print
// the same way. Keeping the puppeteer launch/print logic in one place means
// a future tuning change (timeout, launch args) can't drift between them.
async function renderPdfFromUrl(url: string, options: GeneratePdfOptions): Promise<Buffer> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>>;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await resolveChromiumExecutablePath(),
      // `headless: true` launches Chrome's "new headless" mode — a different
      // binary/protocol from what @sparticuz/chromium bundles. Its package
      // only ships chrome-headless-shell (chromium.args already carries
      // `--headless='shell'`) and its own FAQ says the new mode isn't
      // supported. Passing `true` here caused puppeteer to negotiate the
      // wrong protocol against that binary — the launch could hang or fail
      // silently, which is exactly what a bare `window.open()` to the PDF
      // route shows as: a blank tab with no error surfaced to the user.
      headless: 'shell',
    });
  } catch (err) {
    // Previously this threw uncaught — Next.js turned it into a bodyless
    // 500 with nothing for the caller (or Sentry) to go on. Wrapping it as
    // a PdfGenerationError lets the route handler's existing catch return a
    // real JSON error instead of a blank page, and the logger call gives
    // this an actual stack trace to debug from.
    logger.error('bulletin-pdf: failed to launch headless Chromium', errorDetails(err));
    throw new PdfGenerationError(
      `Failed to launch headless Chromium: ${errorDetails(err).message}`,
    );
  }

  try {
    const page = await browser.newPage();
    // Puppeteer's default viewport (800×600) has nothing to do with the
    // paper size `@page`/preferCSSPageSize renders onto — without this, the
    // bulletin's DOM is laid out squeezed into 800px wide, wrapping table
    // cell text and inflating row heights, which pushed the tail of an
    // otherwise one-page bulletin (signatures, closing bar) onto a genuine
    // second PDF page even though the on-screen Viewer (which sizes its
    // preview to the real page width) showed it fitting on one page.
    await page.setViewport({ width: getPageWidthPx(options), height: getPageHeightPx(options) });
    await page.emulateMediaType('print');
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });
    if (!response || !response.ok()) {
      throw new PdfGenerationError(
        `Print page returned ${response ? response.status() : 'no response'}`,
      );
    }
    const rendered = await page.evaluate(
      () => document.querySelector('.print-bulletin-canvas') != null,
    );
    if (!rendered) {
      throw new PdfGenerationError('Print page did not render a bulletin');
    }
    const bytes = await page.pdf({
      format: options.pageFormat === 'LETTER' ? 'letter' : 'a4',
      landscape: options.orientation === 'LANDSCAPE',
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(bytes);
  } catch (err) {
    if (err instanceof PdfGenerationError) throw err;
    logger.error('bulletin-pdf: failed while rendering the print page', {
      ...errorDetails(err),
      url,
    });
    throw new PdfGenerationError(`Failed to render print page: ${errorDetails(err).message}`);
  } finally {
    await browser.close();
  }
}

// `audience` is signed into the print token so the print page builds the
// same view the requesting screen showed (a student's PDF never carries a
// draft appreciation). Defaults to `staff`, the historical behaviour.
export async function generateBulletinPdf(
  schoolId: string,
  studentId: string,
  termId: string,
  options: GeneratePdfOptions,
  audience: ViewAudience = 'staff',
): Promise<Buffer> {
  const token = signPrintToken({ schoolId, studentId, termId, audience });
  const base = resolvePrintBaseUrl();
  const url = `${base}/print/bulletin/${studentId}/${termId}?token=${encodeURIComponent(token)}`;
  return renderPdfFromUrl(url, options);
}

// Powers the template editor's "Exporter PDF" button. The config is signed
// straight into the token (see print-token.ts) rather than looked up by
// templateId, so the export reflects whatever is currently on screen —
// including edits not yet saved.
export async function generateBulletinTemplatePreviewPdf(
  schoolId: string,
  config: BulletinTemplateConfig,
  options: GeneratePdfOptions,
): Promise<Buffer> {
  const token = signTemplatePreviewToken({ schoolId, config });
  const base = resolvePrintBaseUrl();
  const url = `${base}/print/bulletin-template-preview?token=${encodeURIComponent(token)}`;
  return renderPdfFromUrl(url, options);
}
