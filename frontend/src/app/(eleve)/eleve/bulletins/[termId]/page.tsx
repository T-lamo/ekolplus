'use client';

// Student-side Bulletin Viewer — the shared BulletinViewer on the
// student's own read-only routes (/api/student/bulletin for the view,
// /api/student/bulletin/pdf for Imprimer / Télécharger). readOnly hides
// the appreciation edit link and the classmate navigation card.
import { useParams } from 'next/navigation';
import { BulletinViewer } from '@/components/bulletin/BulletinViewer';

export default function EleveBulletinViewerPage() {
  const params = useParams<{ termId: string }>();
  return (
    <BulletinViewer
      bulletinPath={`/api/student/bulletin?termId=${params.termId}`}
      pdfBase="/api/student/bulletin/pdf"
      backHref="/eleve/bulletins"
      readOnly
    />
  );
}
