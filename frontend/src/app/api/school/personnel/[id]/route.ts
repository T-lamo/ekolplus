// GET /api/school/personnel/[id] — merged fiche (spec
// 2026-09-04-personnel-module-design.md §6.3/§7). `id` is a Teacher.id if
// the person has a teaching profile, else a User.id (cuids are globally
// unique, see personnel/view.ts).
//
// Account block gating: `enseignants.view` is enough for the identity
// fields already exposed ungated in the list (profiles, staffRoleNames,
// accountStatus, loginMode, phone, the teacher sub-object) — hiding those
// here too would be inconsistent with the list screen. What §7 calls "les
// blocs staff/compte" and reserves to ADMIN+ is specifically the raw
// identifiers (email/username) and the `organizationMember` block (role +
// staffRoleIds) — those are the actual contents of the Compte / Accès &
// rôles tabs. The one exception (§6.3's Compte tab rule): a teacher with
// no genuine staff profile can be managed by a caller holding
// `enseignants.edit` alone, without ADMIN rank.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission, resolveGrantsFor } from '@/lib/server/school-permissions';
import { hasGrant } from '@/lib/permissions';
import { getPersonnelDetail } from '@/lib/server/personnel/view';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'enseignants', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const detail = await getPersonnelDetail(mySchool.schoolId, mySchool.organizationId, id);
    if (!detail) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let canSeeAccount = hasMinRole(mySchool.role, 'ADMIN');
    if (!canSeeAccount && detail.teacher != null && detail.organizationMember == null) {
      const grants = await resolveGrantsFor(mySchool, auth.user.sub);
      canSeeAccount = hasGrant(grants, 'enseignants', 'edit');
    }

    const personnel = canSeeAccount
      ? detail
      : { ...detail, email: null, username: null, organizationMember: null };

    return NextResponse.json({ personnel }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
