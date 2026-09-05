// GET/PUT /api/school/class-subjects/[id]/criteria-assessment — school
// mirror of the teacher route (same contracts), gated notes.view / notes.edit.
// Spec 2026-09-05 §5.1.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  SaveSheetBody,
  loadSheet,
  loadSheetContext,
  saveSheet,
  saveSheetErrorResponse,
} from '@/lib/server/criteria-assessment';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

type Params = { params: Promise<{ id: string }> };

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'notes', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const { id } = await params;
    const sheetCtx = await loadSheetContext(id, perm.mySchool.schoolId);
    if (!sheetCtx) return notFound(ctx.requestId);

    const sheet = await loadSheet(sheetCtx, req.nextUrl.searchParams.get('termId'));
    if (!sheet) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'termId must belong to the class year' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json({ sheet }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'notes', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;
    const { id } = await params;
    const sheetCtx = await loadSheetContext(id, perm.mySchool.schoolId);
    if (!sheetCtx) return notFound(ctx.requestId);

    const parsed = SaveSheetBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const result = await saveSheet(sheetCtx, parsed.data);
    if (!result.ok) return saveSheetErrorResponse(result.error, ctx.requestId);
    return NextResponse.json(
      { sheet: result.sheet },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
