// Reminder eligibility + dispatch for the fee-reminders cron. The
// eligibility logic here is real (correctly finds who should be reminded,
// per school automation settings, with proper dedup). Email (via the
// existing EmailQueue/Resend pipeline) is the default channel — free, no
// per-message fee. WhatsApp (via Twilio, see lib/server/whatsapp/twilio.ts)
// is opt-in per school (FeeAutomationSettings.whatsappRemindersEnabled):
// Meta bills per message on top of Twilio's own fee, and it's the platform
// — not the school — that foots that bill, so it's priced in per school
// rather than turned on globally. Both channels fall back to stub behavior
// automatically when unconfigured, so this is safe to ship either way.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { getFeeLedgerRows, type FeeLedgerRow } from '@/lib/server/fees/rows';
import { sendWhatsAppMessage } from '@/lib/server/whatsapp/twilio';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';

const log = createLogger();

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

const CRITICAL_DAYS = 30;
const WEEKLY_OVERDUE_MIN_DAYS = 7;
const WEEKLY_REPEAT_DAYS = 7;

export type FeeReminderRule = 'BEFORE_5_DAYS' | 'DUE_DATE' | 'WEEKLY_OVERDUE' | 'CRITICAL_OVERDUE';

interface AutomationSettingsLike {
  autoRemindersEnabled: boolean;
  reminderBefore5Days: boolean;
  reminderOnDueDate: boolean;
  reminderWeeklyOverdue: boolean;
  reminderCriticalOverdue: boolean;
  currency: string;
  whatsappRemindersEnabled: boolean;
}

function daysUntilDue(row: FeeLedgerRow, now: Date): number {
  return Math.floor((row.trancheDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const currencyFormatter = new Intl.NumberFormat('fr-FR');
const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function buildReminderMessage(
  row: FeeLedgerRow,
  rule: FeeReminderRule,
  schoolName: string,
  currency: string,
): string {
  const student = `${row.studentFirstName} ${row.studentLastName}`;
  const amount = `${currencyFormatter.format(row.trancheAmount - row.paidAmount)} ${currency}`;
  const dueDate = dateFormatter.format(row.trancheDueDate);

  switch (rule) {
    case 'BEFORE_5_DAYS':
      return `Bonjour, message de ${schoolName} : la tranche de ${amount} pour ${student} arrive à échéance le ${dueDate}. Merci de régulariser.`;
    case 'DUE_DATE':
      return `Bonjour, message de ${schoolName} : la tranche de ${amount} pour ${student} est due aujourd'hui.`;
    case 'WEEKLY_OVERDUE':
      return `Bonjour, message de ${schoolName} : la tranche de ${amount} pour ${student} est en retard de ${row.daysOverdue} jours. Merci de régulariser rapidement.`;
    case 'CRITICAL_OVERDUE':
      return `Bonjour, message de ${schoolName} : le retard de paiement pour ${student} dépasse 30 jours (${amount}). Merci de nous contacter.`;
  }
}

interface ReminderOutcome {
  // Whether to write a FeeReminderLog row (and thus mark this rule as
  // "handled" for dedup purposes). A transient send failure returns false
  // so the cron retries on its next tick instead of silently giving up on a
  // one-shot rule (BEFORE_5_DAYS / DUE_DATE / CRITICAL_OVERDUE never fire
  // again otherwise).
  shouldLog: boolean;
  channel: string;
}

async function sendFeeReminder(
  row: FeeLedgerRow,
  rule: FeeReminderRule,
  schoolName: string,
  currency: string,
  whatsappEnabled: boolean,
): Promise<ReminderOutcome> {
  const message = buildReminderMessage(row, rule, schoolName, currency);

  if (whatsappEnabled) {
    const guardian = await prisma.guardian.findFirst({
      where: { studentId: row.studentId, isPrimary: true, phone: { not: null } },
      select: { phone: true },
    });

    if (!guardian?.phone) {
      log.warn('fee reminder skipped — no primary guardian phone on file', {
        studentId: row.studentId,
        feeTrancheId: row.trancheId,
        rule,
      });
      return { shouldLog: true, channel: 'skipped_no_contact' };
    }

    const result = await sendWhatsAppMessage(guardian.phone, message);

    if (result.ok) return { shouldLog: true, channel: 'whatsapp' };
    if (result.error === 'NOT_CONFIGURED') return { shouldLog: true, channel: 'stub' };

    log.warn('fee reminder WhatsApp send failed — will retry next cron tick', {
      studentId: row.studentId,
      feeTrancheId: row.trancheId,
      rule,
      error: result.error,
    });
    return { shouldLog: false, channel: 'send_failed' };
  }

  const guardian = await prisma.guardian.findFirst({
    where: { studentId: row.studentId, isPrimary: true, email: { not: null } },
    select: { email: true },
  });

  if (!guardian?.email) {
    log.warn('fee reminder skipped — no primary guardian email on file', {
      studentId: row.studentId,
      feeTrancheId: row.trancheId,
      rule,
    });
    return { shouldLog: true, channel: 'skipped_no_contact' };
  }

  const queue = getEmailQueue();
  if (!queue) {
    log.warn('fee reminder: email queue not configured — message not sent', {
      studentId: row.studentId,
      feeTrancheId: row.trancheId,
      rule,
    });
    return { shouldLog: true, channel: 'stub' };
  }

  await queue.enqueue({
    to: guardian.email,
    subject: `Rappel de paiement — ${schoolName}`,
    html: `<p>${escapeHtml(message)}</p>`,
    text: message,
  });
  return { shouldLog: true, channel: 'email' };
}

export async function runFeeReminderCron(): Promise<{
  schoolsProcessed: number;
  remindersLogged: number;
}> {
  const schools = await prisma.feeAutomationSettings.findMany({
    where: { autoRemindersEnabled: true },
    select: {
      schoolId: true,
      reminderBefore5Days: true,
      reminderOnDueDate: true,
      reminderWeeklyOverdue: true,
      reminderCriticalOverdue: true,
      autoRemindersEnabled: true,
      currency: true,
      whatsappRemindersEnabled: true,
    },
  });

  const now = new Date();
  let remindersLogged = 0;

  for (const settings of schools) {
    remindersLogged += await processSchool(settings.schoolId, settings, now);
  }

  return { schoolsProcessed: schools.length, remindersLogged };
}

async function processSchool(
  schoolId: string,
  settings: AutomationSettingsLike,
  now: Date,
): Promise<number> {
  const rows = await getFeeLedgerRows(schoolId);
  if (rows.length === 0) return 0;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { name: true },
  });
  const schoolName = school?.name ?? 'ton établissement';

  const trancheIds = Array.from(new Set(rows.map((r) => r.trancheId)));
  const recentLogs = await prisma.feeReminderLog.findMany({
    where: { feeTrancheId: { in: trancheIds } },
    orderBy: { sentAt: 'desc' },
  });
  const latestByKey = new Map<string, Date>();
  for (const l of recentLogs) {
    const key = `${l.studentId}:${l.feeTrancheId}:${l.rule}`;
    if (!latestByKey.has(key)) latestByKey.set(key, l.sentAt); // already sorted desc — first hit is latest
  }

  let count = 0;

  for (const row of rows) {
    if (row.status === 'PAID') continue;
    const remaining = row.trancheAmount - row.paidAmount;
    if (remaining <= 0) continue;

    const untilDue = daysUntilDue(row, now);
    const candidates: FeeReminderRule[] = [];

    if (settings.reminderBefore5Days && untilDue === 5) candidates.push('BEFORE_5_DAYS');
    if (settings.reminderOnDueDate && untilDue === 0) candidates.push('DUE_DATE');
    if (
      settings.reminderCriticalOverdue &&
      row.status === 'OVERDUE' &&
      row.daysOverdue > CRITICAL_DAYS
    ) {
      candidates.push('CRITICAL_OVERDUE');
    }
    if (
      settings.reminderWeeklyOverdue &&
      row.status === 'OVERDUE' &&
      row.daysOverdue > WEEKLY_OVERDUE_MIN_DAYS
    ) {
      candidates.push('WEEKLY_OVERDUE');
    }

    for (const rule of candidates) {
      const key = `${row.studentId}:${row.trancheId}:${rule}`;
      const lastSent = latestByKey.get(key);
      const isRepeatable = rule === 'WEEKLY_OVERDUE';
      const dueForRepeat =
        isRepeatable &&
        lastSent != null &&
        now.getTime() - lastSent.getTime() >= WEEKLY_REPEAT_DAYS * 24 * 60 * 60 * 1000;
      if (lastSent != null && !dueForRepeat) continue; // already sent, one-shot rule (or not yet due to repeat)

      const outcome = await sendFeeReminder(
        row,
        rule,
        schoolName,
        settings.currency,
        settings.whatsappRemindersEnabled,
      );
      if (!outcome.shouldLog) continue;

      await prisma.feeReminderLog.create({
        data: {
          studentId: row.studentId,
          feeTrancheId: row.trancheId,
          rule,
          channel: outcome.channel,
        },
      });
      latestByKey.set(key, now);
      count++;
    }
  }

  return count;
}
