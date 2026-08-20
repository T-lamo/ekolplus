'use client';

// Shared status pills for Frais & Scolarité — one place so the same status
// always renders with the same color across Fee Management, Relances
// Impayés, and the Payment Registration modal's tranche selector.
import { useTranslations } from 'next-intl';

export type StudentFeeStatus = 'UP_TO_DATE' | 'PARTIAL' | 'OVERDUE' | 'UNPAID';
export type TrancheStatus = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UPCOMING';

type Tone = 'success' | 'warning' | 'destructive' | 'muted';

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  muted: 'bg-secondary text-secondary-foreground',
};

function Pill({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

const STUDENT_TONE: Record<StudentFeeStatus, Tone> = {
  UP_TO_DATE: 'success',
  PARTIAL: 'warning',
  OVERDUE: 'destructive',
  UNPAID: 'muted',
};

export function StudentStatusBadge({ status }: { status: StudentFeeStatus }) {
  const t = useTranslations('Fees.studentStatus');
  return <Pill tone={STUDENT_TONE[status]}>{t(status)}</Pill>;
}

const TRANCHE_TONE: Record<TrancheStatus, Tone> = {
  PAID: 'success',
  PARTIAL: 'warning',
  OVERDUE: 'destructive',
  UPCOMING: 'muted',
};

export function TrancheStatusBadge({ status }: { status: TrancheStatus }) {
  const t = useTranslations('Fees.trancheStatus');
  return <Pill tone={TRANCHE_TONE[status]}>{t(status)}</Pill>;
}

export type OverdueSeverity = 'CRITICAL' | 'OVERDUE' | 'RECENT';

const SEVERITY_TONE: Record<OverdueSeverity, Tone> = {
  CRITICAL: 'destructive',
  OVERDUE: 'warning',
  RECENT: 'muted',
};

export function SeverityBadge({ severity }: { severity: OverdueSeverity }) {
  const t = useTranslations('Fees.overdueSeverity');
  return <Pill tone={SEVERITY_TONE[severity]}>{t(severity)}</Pill>;
}
