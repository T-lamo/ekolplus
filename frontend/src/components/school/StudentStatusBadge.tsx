import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';

type StudentRolloverStatus = 'promu' | 'exception' | 'nonreinscrit';

const STATUS_TONE: Record<StudentRolloverStatus, BadgeTone> = {
  promu: 'success',
  exception: 'warning',
  nonreinscrit: 'muted',
};

export function StudentStatusBadge({ status }: { status: StudentRolloverStatus }) {
  const t = ACADEMIC_YEAR_ROLLOVER.studentStatus;
  const label =
    status === 'promu' ? t.promoted : status === 'exception' ? t.exception : t.unenrolled;
  return <Badge tone={STATUS_TONE[status]}>{label}</Badge>;
}
