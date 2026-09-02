'use client';

// Mes bulletins — the fiche élève's Bulletins tab on the student's own
// routes: list from /api/student/bulletins, viewer on
// /eleve/bulletins/[termId], PDF from /api/student/bulletin/pdf.
import { useTranslations } from 'next-intl';
import { BulletinsTab } from '@/app/(school)/eleves/[id]/BulletinsTab';
import { ScolaritePage } from '../ScolaritePage';

export default function EleveBulletinsPage() {
  const t = useTranslations('ElevePortal.pages.bulletins');
  return (
    <ScolaritePage title={t('title')} subtitle={t('subtitle')}>
      {(me) => (
        <BulletinsTab
          studentId={me.student.id}
          apiBase="/api/student"
          viewerHrefBase="/eleve/bulletins"
        />
      )}
    </ScolaritePage>
  );
}
