// POST /api/school/bulletin-templates/[id]/preview-pdf — server-generated
// PDF export for the template editor's "Exporter PDF" button. Own templates
// only (same ownership check as PATCH/DELETE) — the id in the URL just
// gates who may render, the actual layout comes from the validated request
// body so the export reflects the editor's live (possibly unsaved) state,
// not whatever was last persisted. Renders against SAMPLE_BULLETIN_DATA,
// same fixture the editor's on-screen preview uses.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import { bulletinTemplateConfigSchema } from '@/lib/server/bulletin-templates';
import {
  generateBulletinTemplatePreviewPdf,
  PdfGenerationError,
} from '@/lib/server/bulletin-pdf/generate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ config: bulletinTemplateConfigSchema });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const tpl = await prisma.bulletinTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Template not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { config } = parsed.data;
    let pdf: Buffer;
    try {
      pdf = await generateBulletinTemplatePreviewPdf(mySchool.schoolId, config, {
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

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="apercu-modele-bulletin.pdf"',
        'x-request-id': ctx.requestId,
      },
    });
  });
}
