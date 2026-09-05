'use client';

// Grille de critères (teacher portal): the shared editor over
// /api/teacher, ownership enforced server-side (404 for a class-subject I
// do not teach). Static `criteres/` segment: the folder above already owns
// the `[evaluationId]` dynamic segment.
import { useParams } from 'next/navigation';
import { CriteriaSheetEditor } from '@/components/gradebook/CriteriaSheetEditor';

export default function TeacherCriteriaSheetPage() {
  const { classSubjectId } = useParams<{ classSubjectId: string }>();
  return (
    <CriteriaSheetEditor
      apiBase="/api/teacher"
      classSubjectId={classSubjectId}
      backHref="/espace-enseignant/carnet-de-notes"
      canEdit
    />
  );
}
