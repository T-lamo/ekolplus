// POST /api/school/teachers/[id]/send-whatsapp — "Envoyer un message" row
// action on the Teachers list. Sends a short contact message to the
// teacher's own phone (unlike the fee-reminders flow, there's no guardian
// indirection here). Mirrors /api/school/fees/students/[id]/send-whatsapp.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { sendWhatsAppMessage } from '@/lib/server/whatsapp/twilio';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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
      select: { name: true, phone: true },
    });
    if (!teacher) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!teacher.phone) {
      return NextResponse.json(
        { error: 'NO_TEACHER_PHONE', message: 'Aucun numéro de téléphone renseigné.' },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const school = await prisma.school.findUnique({
      where: { id: mySchool.schoolId },
      select: { name: true },
    });

    const message = `Bonjour ${teacher.name}, message de ${school?.name ?? 'ton établissement'} via Schoolgesti.`;

    const result = await sendWhatsAppMessage(teacher.phone, message);
    if (!result.ok) {
      const status = result.error === 'NOT_CONFIGURED' ? 503 : 502;
      return NextResponse.json(
        { error: result.error, message: 'Envoi WhatsApp impossible.' },
        { status, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
