import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';

/** Outcome of a student in the academic-year rollover — see
 * `deriveOutcome` in settings/nouvelle-annee/student-decisions.ts. */
export type StudentRolloverStatus = 'promu' | 'redoublant' | 'nonreinscrit';

const STATUS_TONE: Record<StudentRolloverStatus, BadgeTone> = {
  promu: 'success',
  redoublant: 'warning',
  nonreinscrit: 'muted',
};

export function StudentStatusBadge({ status }: { status: StudentRolloverStatus }) {
  const t = ACADEMIC_YEAR_ROLLOVER.studentStatus;
  const label =
    status === 'promu' ? t.promoted : status === 'redoublant' ? t.repeating : t.unenrolled;
  return <Badge tone={STATUS_TONE[status]}>{label}</Badge>;
}
