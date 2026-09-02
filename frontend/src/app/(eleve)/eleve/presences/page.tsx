'use client';

// Mes présences — the fiche élève's Présences tab on the student's own
// read-only route (/api/student/attendance).
import { useTranslations } from 'next-intl';
import { PresencesTab } from '@/app/(school)/eleves/[id]/PresencesTab';
import { ScolaritePage } from '../ScolaritePage';

export default function ElevePresencesPage() {
  const t = useTranslations('ElevePortal.pages.attendance');
  return (
    <ScolaritePage title={t('title')} subtitle={t('subtitle')}>
      {(me) => <PresencesTab studentId={me.student.id} apiBase="/api/student" />}
    </ScolaritePage>
  );
}
