'use client';

// Grille de critères (school app): notes.view to read, notes.edit to tick.
import { useParams } from 'next/navigation';
import { usePermissions } from '@/lib/usePermissions';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { CriteriaSheetEditor } from '@/components/gradebook/CriteriaSheetEditor';

export default function SchoolCriteriaSheetPage() {
  const { classSubjectId } = useParams<{ classSubjectId: string }>();
  const { can, canSee } = usePermissions();
  if (!canSee('notes')) return <AccessDenied />;
  return (
    <CriteriaSheetEditor
      apiBase="/api/school"
      classSubjectId={classSubjectId}
      backHref="/pedagogie/carnet-de-notes"
      canEdit={can('notes', 'edit')}
    />
  );
}
