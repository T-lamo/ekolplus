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
import { signPrintToken } from './print-token';

export class PdfGenerationError extends Error {}

export interface GeneratePdfOptions {
  pageFormat: 'LETTER' | 'A4';
  orientation: 'LANDSCAPE' | 'PORTRAIT';
}

export async function generateBulletinPdf(
  schoolId: string,
  studentId: string,
  termId: string,
  options: GeneratePdfOptions,
): Promise<Buffer> {
  const token = signPrintToken({ schoolId, studentId, termId });
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const url = `${base}/print/bulletin/${studentId}/${termId}?token=${encodeURIComponent(token)}`;

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
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
