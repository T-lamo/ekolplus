// requireStudent — mirrors the shape of requireAuth/requireAdmin/
// requireOrgRole (each returns Context | NextResponse) but for a
// Student-linked account. Composes on top of the existing requireAuth
// export rather than duplicating cookie/JWT verification — this file is
// NOT one of CLAUDE.md's 3 protected middleware files, so it's free to
// add, but it never edits requireAuth itself.
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { resolveMyStudentProfile, type MyStudentProfile } from '@/lib/server/school';

export interface StudentContext {
  user: { sub: string; email: string | null };
  student: MyStudentProfile;
}

export async function requireStudent(req: NextRequest): Promise<StudentContext | NextResponse> {
  const auth = await requireAuth(req.headers.get('authorization'));
  if (auth instanceof NextResponse) return auth;

  const student = await resolveMyStudentProfile(auth.user.sub);
  if (!student) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  return { user: auth.user, student };
}
