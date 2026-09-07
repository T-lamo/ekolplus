// GET /api/teacher/class-subjects/[id]/criteria-assessment?termId= — the
// qualitative sheet of one of MY class-subjects for a term (virtual empty
// sheet when never saved; a GET writes nothing).
// PUT … { termId, status, ratings } — upserts the sheet, replaces the sent
// ticks (null erases), 403 GRADE_ENTRY_DISABLED like the grades route.
// Ownership = ClassSubject.teacherId through myTeacher.classSubjectIds,
// checked before any lookup (404 anti-leak). Spec 2026-09-05 §5.1.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import {
  SaveSheetBody,
  loadSheet,
  loadSheetContext,
  saveSheet,
  saveSheetErrorResponse,
  type SheetContext,
} from '@/lib/server/criteria-assessment';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

type Params = { params: Promise<{ id: string }> };

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

async function resolveOwnedContext(
  userSub: string,
  classSubjectId: string,
  requestId: string,
): Promise<SheetContext | NextResponse> {
  const mySchool = await resolveMySchoolIncludingTeacher(userSub);
  if (!mySchool) return notFound(requestId);
  const myTeacher = await resolveMyTeacherProfile(userSub, mySchool.schoolId);
  if (!myTeacher) return notFound(requestId);
  if (!myTeacher.classSubjectIds.includes(classSubjectId)) return notFound(requestId);
  const sheetCtx = await loadSheetContext(classSubjectId, mySchool.schoolId);
  return sheetCtx ?? notFound(requestId);
}

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const sheetCtx = await resolveOwnedContext(auth.user.sub, id, ctx.requestId);
    if (sheetCtx instanceof NextResponse) return sheetCtx;

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

    const { id } = await params;
    const sheetCtx = await resolveOwnedContext(auth.user.sub, id, ctx.requestId);
    if (sheetCtx instanceof NextResponse) return sheetCtx;

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
