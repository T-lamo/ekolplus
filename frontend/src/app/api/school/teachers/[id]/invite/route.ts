// POST /api/school/teachers/[id]/invite — admin-triggered "Inviter à se
// connecter" action on the teacher profile page. Creates a one-time
// TeacherInvite token and e-mails a link to /invitation-enseignant?token=...
// via the existing EmailQueue/Resend pipeline. Does not create the User row
// — that happens when the teacher accepts the invite (see
// /api/auth/teacher-invite/[token]/accept).
export const runtime = 'nodejs';

import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const teacher = await prisma.teacher.findFirst({
      where: { id, schoolId: mySchool.schoolId },
      select: { name: true, email: true, userId: true },
    });
    if (!teacher) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (teacher.userId) {
      return NextResponse.json(
        { error: 'ALREADY_LINKED', message: 'Cet enseignant a déjà un compte.' },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!teacher.email) {
      return NextResponse.json(
        { error: 'NO_EMAIL', message: 'Aucune adresse e-mail renseignée pour cet enseignant.' },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const school = await prisma.school.findUnique({
      where: { id: mySchool.schoolId },
      select: { name: true },
    });

    const token = randomBytes(32).toString('base64url');
    await prisma.teacherInvite.create({
      data: {
        schoolId: mySchool.schoolId,
        teacherId: id,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    const queue = getEmailQueue();
    if (queue) {
      const base = process.env.APP_URL ?? 'http://localhost:3000';
      const url = `${base}/invitation-enseignant?token=${token}`;
      await queue.enqueue({
        to: teacher.email,
        subject: `Invitation à rejoindre ${school?.name ?? 'ton établissement'} sur Schoolgesti`,
        html: `<p>Bonjour ${teacher.name},</p><p>${school?.name ?? 'Ton établissement'} t'invite à créer ton compte enseignant sur Schoolgesti pour signer ta présence à chaque cours.</p><p><a href="${url}">Clique ici pour créer ton compte</a> — ce lien expire dans 7 jours.</p>`,
        text: `Bonjour ${teacher.name}, ${school?.name ?? 'ton établissement'} t'invite à créer ton compte enseignant sur Schoolgesti. Ouvre ce lien pour créer ton compte (expire dans 7 jours) : ${url}`,
      });
    } else {
      log.warn('teacher-invite: email queue not configured — invite created but not emailed');
    }

    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
