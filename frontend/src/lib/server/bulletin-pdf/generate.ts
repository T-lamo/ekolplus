// Server-side WYSIWYG PDF via headless Chromium: navigates to the
// standalone print page (app/print/bulletin/[studentId]/[termId]), which
// renders the exact same BulletinCanvas the Viewer shows on screen — see
// docs/superpowers/specs/2026-08-13-bulletin-pdf-and-editor-design.md for
// why this beats a parallel PDF-primitive renderer. @sparticuz/chromium
// bundles a Vercel/serverless-compatible Chromium binary; puppeteer-core
// (no bundled browser) drives it — this pairing works both locally and on
// Vercel with the same code path.
import 'server-only';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { signPrintToken, signTemplatePreviewToken } from './print-token';
import { resolvePrintBaseUrl } from './print-base-url';
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';

export class PdfGenerationError extends Error {}

export interface GeneratePdfOptions {
  pageFormat: 'LETTER' | 'A4';
  orientation: 'LANDSCAPE' | 'PORTRAIT';
}

// Shared by generateBulletinPdf and generateBulletinTemplatePreviewPdf —
// both just point headless Chromium at a different print page URL and print
// the same way. Keeping the puppeteer launch/print logic in one place means
// a future tuning change (timeout, launch args) can't drift between them.
async function renderPdfFromUrl(url: string, options: GeneratePdfOptions): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
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

  try {
    const page = await browser.newPage();
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
  } finally {
    await browser.close();
  }
}

export async function generateBulletinPdf(
  schoolId: string,
  studentId: string,
  termId: string,
  options: GeneratePdfOptions,
): Promise<Buffer> {
  const token = signPrintToken({ schoolId, studentId, termId });
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
