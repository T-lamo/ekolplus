'use client';

// Mes notes — the fiche élève's Notes & Résultats tab, rendered for the
// student on their own read-only route (/api/student/results): same
// filters, per-subject table, trends, alerts and displayed goals; no
// goal-setting and no nominative ranking (readOnly).
import { useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import { Skeleton } from '@/components/ui/Skeleton';
import { NotesResultatsTab } from '@/app/(school)/eleves/[id]/NotesResultatsTab';
import type { StudentResults } from '@/app/(school)/eleves/types';
import { ScolaritePage } from '../ScolaritePage';

export default function EleveNotesPage() {
  const t = useTranslations('ElevePortal');
  const { data: results, error } = useApi<StudentResults>('/api/student/results');

  return (
    <ScolaritePage title={t('pages.grades.title')} subtitle={t('pages.grades.subtitle')}>
      {(me) =>
        results ? (
          <NotesResultatsTab
            studentId={me.student.id}
            studentName={`${me.student.firstName} ${me.student.lastName}`}
            initial={results}
            apiBase="/api/student"
            readOnly
          />
        ) : error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {t('loadError')}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-14 w-full" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        )
      }
    </ScolaritePage>
  );
}
