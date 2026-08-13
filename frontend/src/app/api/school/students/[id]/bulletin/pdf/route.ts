// GET /api/school/students/[id]/bulletin/pdf?termId= — server-generated PDF
// of the Bulletin Viewer's exact rendering. Mints a short-lived print token
// (lib/server/bulletin-pdf/print-token.ts) and drives headless Chromium
// against the standalone print page (app/print/bulletin/...), streaming
// the resulting PDF bytes back.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { generateBulletinPdf, PdfGenerationError } from '@/lib/server/bulletin-pdf/generate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id: studentId } = await params;
    const termId = req.nextUrl.searchParams.get('termId');
    if (!termId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'termId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const view = await getStudentBulletinView(mySchool.schoolId, studentId, termId);
    if (!view || !view.template) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Bulletin not available' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const config = view.template.config as BulletinTemplateConfig;
    let pdf: Buffer;
    try {
      pdf = await generateBulletinPdf(mySchool.schoolId, studentId, termId, {
        pageFormat: config.pageFormat,
        orientation: config.orientation,
      });
    } catch (err) {
      if (err instanceof PdfGenerationError) {
        return NextResponse.json(
          { error: 'PDF_GENERATION_FAILED', message: err.message },
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    const safeName =
      `${view.firstName}-${view.lastName}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\w-]+/g, '-') || studentId;

    // disposition=inline lets the Viewer's "Imprimer" button open the real
    // PDF in a new tab (browser-native PDF viewer, printable from there)
    // instead of forcing a download — "Télécharger PDF" keeps the default
    // attachment behavior.
    const disposition =
      req.nextUrl.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment';

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="bulletin-${safeName}.pdf"`,
        'x-request-id': ctx.requestId,
      },
    });
  });
}
