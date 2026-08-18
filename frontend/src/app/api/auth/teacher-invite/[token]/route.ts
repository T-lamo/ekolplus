// GET /api/auth/teacher-invite/[token] — resolves an invite token for the
// public /invitation-enseignant page (name/school for the confirmation
// copy). No CSRF: pre-session, safe GET.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { token } = await params;
    const invite = await prisma.teacherInvite.findUnique({
      where: { token },
      select: {
        expiresAt: true,
        usedAt: true,
        teacher: { select: { name: true, school: { select: { name: true } } } },
      },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'INVALID_OR_EXPIRED', message: 'Invite invalid or expired' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(
      { teacherName: invite.teacher.name, schoolName: invite.teacher.school.name },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
