'use client';

// Appréciations — the fiche élève's Appréciations tab on the student's own
// read-only route (/api/student/appreciations, PUBLISHED rows only); no
// « Modifier » / « Rédiger » links (readOnly).
import { useTranslations } from 'next-intl';
import { AppreciationsTab } from '@/app/(school)/eleves/[id]/AppreciationsTab';
import { ScolaritePage } from '../ScolaritePage';

export default function EleveAppreciationsPage() {
  const t = useTranslations('ElevePortal.pages.appreciations');
  return (
    <ScolaritePage title={t('title')} subtitle={t('subtitle')}>
      {(me) => <AppreciationsTab studentId={me.student.id} apiBase="/api/student" readOnly />}
    </ScolaritePage>
  );
}
