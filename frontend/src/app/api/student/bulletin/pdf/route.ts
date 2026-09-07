// GET /api/student/bulletin/pdf?termId=&disposition= — the Espace Élève's
// server-generated bulletin PDF: the same pipeline as the school route
// (generateBulletinPdf drives headless Chromium against the print page
// with a short-lived token), for the session's own student only, with the
// `student` audience signed into the token so the printed bulletin never
// carries a draft appreciation.
export const runtime = 'nodejs';
// Cold-starting headless Chromium + rendering the print page routinely
// exceeds Vercel's default function timeout — allow the full minute.
export const maxDuration = 60;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { generateBulletinPdf, PdfGenerationError } from '@/lib/server/bulletin-pdf/generate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;
    const { schoolId, studentId } = auth.student;

    const termId = req.nextUrl.searchParams.get('termId');
    if (!termId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'termId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const view = await getStudentBulletinView(schoolId, studentId, termId, 'student');
    if (!view || !view.template) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Bulletin not available' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const config = view.template.config as BulletinTemplateConfig;
    let pdf: Buffer;
    try {
      pdf = await generateBulletinPdf(
        schoolId,
        studentId,
        termId,
        { pageFormat: config.pageFormat, orientation: config.orientation },
        'student',
      );
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

    // disposition=inline lets « Imprimer » open the real PDF in a new tab
    // (browser-native PDF viewer, printable from there); the default
    // attachment behaviour serves « Télécharger PDF ».
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
