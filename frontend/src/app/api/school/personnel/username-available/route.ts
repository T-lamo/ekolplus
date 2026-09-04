// GET /api/school/personnel/username-available?u= — live availability check
// for the Personnel creation wizard's username field (spec
// 2026-09-04-personnel-module-design.md §6.4/§7). Never reveals *whose*
// username it is — `{ available: boolean }` only. Readable by a caller who
// can either create or edit personnel (`enseignants.create` OR `.edit`);
// `requireSchoolPermission` only checks a single action, so the baseline
// call below uses `.view` (weakest of the two, satisfies the RBAC-01
// tripwire and resolves `mySchool`/404) and the create-or-edit rule is then
// applied manually.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission, resolveGrantsFor } from '@/lib/server/school-permissions';
import { hasGrant } from '@/lib/permissions';
import { normalizeUsername, USERNAME_REGEX } from '@/lib/username';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'enseignants', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const grants = await resolveGrantsFor(mySchool, auth.user.sub);
    const canCheck =
      hasGrant(grants, 'enseignants', 'create') || hasGrant(grants, 'enseignants', 'edit');
    if (!canCheck) {
      return NextResponse.json(
        {
          error: 'PERMISSION_DENIED',
          message: 'You do not have permission to perform this action.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const raw = req.nextUrl.searchParams.get('u') ?? '';
    const normalized = normalizeUsername(raw);
    if (!USERNAME_REGEX.test(normalized)) {
      return NextResponse.json(
        { available: false },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username: normalized },
      select: { id: true },
    });

    return NextResponse.json(
      { available: existing === null },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
