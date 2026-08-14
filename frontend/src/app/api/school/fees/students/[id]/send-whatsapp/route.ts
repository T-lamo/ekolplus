// POST /api/school/fees/students/[id]/send-whatsapp — manual "Envoyer
// WhatsApp" row action on Suivi des paiements. Sends a generic reminder for
// the student's current total remaining balance (not tied to a specific
// tranche/rule, unlike the automated fee-reminders cron).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { sendWhatsAppMessage } from '@/lib/server/whatsapp/twilio';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const currencyFormatter = new Intl.NumberFormat('fr-FR');

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
    const student = await prisma.student.findFirst({
      where: { id, schoolId: mySchool.schoolId },
      select: {
        firstName: true,
        lastName: true,
        guardians: { where: { isPrimary: true, phone: { not: null } }, select: { phone: true } },
      },
    });
    if (!student) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const phone = student.guardians[0]?.phone;
    if (!phone) {
      return NextResponse.json(
        { error: 'NO_GUARDIAN_PHONE', message: 'Aucun numéro de tuteur principal renseigné.' },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const school = await prisma.school.findUnique({
      where: { id: mySchool.schoolId },
      select: { name: true, feeAutomationSettings: { select: { currency: true } } },
    });

    const balance = await computeRemainingBalance(id, mySchool.schoolId);
    if (balance <= 0) {
      return NextResponse.json(
        { error: 'NO_BALANCE_DUE', message: 'Aucun solde restant pour cet élève.' },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const currency = school?.feeAutomationSettings?.currency ?? 'HTG';
    const message = `Bonjour, message de ${school?.name ?? 'ton établissement'} : le solde restant pour ${student.firstName} ${student.lastName} est de ${currencyFormatter.format(balance)} ${currency}. Merci de régulariser.`;

    const result = await sendWhatsAppMessage(phone, message);
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

async function computeRemainingBalance(studentId: string, schoolId: string): Promise<number> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, class: { schoolId, academicYear: { isActive: true } } },
    include: { class: { select: { feeStructure: { include: { tranches: true } } } } },
  });
  const tranches = enrollment?.class.feeStructure?.tranches ?? [];
  const totalDue = tranches.reduce((sum, t) => sum + t.amount, 0);
  const payments = await prisma.feePayment.findMany({
    where: { studentId, feeTrancheId: { in: tranches.map((t) => t.id) } },
    select: { amount: true },
  });
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  return Math.max(totalDue - totalPaid, 0);
}
