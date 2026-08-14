// Shared status pills for Frais & Scolarité — one place so the same status
// always renders with the same color across Fee Management, Relances
// Impayés, and the Payment Registration modal's tranche selector.
import { FEES } from '@/lib/constants';

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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
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
  return <Pill tone={STUDENT_TONE[status]}>{FEES.studentStatusLabel[status]}</Pill>;
}

const TRANCHE_TONE: Record<TrancheStatus, Tone> = {
  PAID: 'success',
  PARTIAL: 'warning',
  OVERDUE: 'destructive',
  UPCOMING: 'muted',
};

export function TrancheStatusBadge({ status }: { status: TrancheStatus }) {
  return <Pill tone={TRANCHE_TONE[status]}>{FEES.trancheStatusLabel[status]}</Pill>;
}

export type OverdueSeverity = 'CRITICAL' | 'OVERDUE' | 'RECENT';

const SEVERITY_TONE: Record<OverdueSeverity, Tone> = {
  CRITICAL: 'destructive',
  OVERDUE: 'warning',
  RECENT: 'muted',
};

const SEVERITY_LABEL: Record<OverdueSeverity, string> = {
  CRITICAL: FEES.overdue.statusCritical,
  OVERDUE: FEES.overdue.statusOverdue,
  RECENT: FEES.overdue.statusRecent,
};

export function SeverityBadge({ severity }: { severity: OverdueSeverity }) {
  return <Pill tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Pill>;
}
