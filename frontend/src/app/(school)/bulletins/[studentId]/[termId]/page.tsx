'use client';

// School-side Bulletin Viewer page — a thin wrapper around the shared
// BulletinViewer (components/bulletin/BulletinViewer.tsx), which the
// Espace Élève renders too on /eleve/bulletins/[termId] in read-only mode.
import { useParams } from 'next/navigation';
import { BulletinViewer } from '@/components/bulletin/BulletinViewer';

export default function BulletinViewerPage() {
  const params = useParams<{ studentId: string; termId: string }>();
  const qs = params.termId ? `?termId=${params.termId}` : '';
  return (
    <BulletinViewer
      bulletinPath={`/api/school/students/${params.studentId}/bulletin${qs}`}
      pdfBase={`/api/school/students/${params.studentId}/bulletin/pdf`}
      backHref="/bulletins"
    />
  );
}
