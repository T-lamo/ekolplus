'use client';

// Read-only grids of the student's PUBLISHED qualitative sheets, under the
// grades table of Mes notes (spec 2026-09-05 §7). The term follows the
// API's current-term rule; the picker lets the student look back. The card
// is not rendered at all when the class has no qualitative subject.
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

interface QualitativeView {
  terms: { id: string; label: string }[];
  term: { id: string; label: string } | null;
  grids: {
    classSubjectId: string;
    subjectName: string;
    ratingScale: string[];
    criteria: { id: string; label: string; level: number | null }[];
  }[];
}

export function QualitativeGridsCard() {
  const t = useTranslations('ElevePortal.qualitative');
  const [termId, setTermId] = useState<string | null>(null);
  const { data, error } = useApi<QualitativeView>(
    `/api/student/criteria-assessments${termId ? `?termId=${termId}` : ''}`,
  );

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        {t('loadError')}
      </p>
    );
  }
  if (!data) return <Skeleton className="h-24 w-full" />;
  if (data.grids.length === 0 && termId === null) return null;

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-foreground">{t('title')}</h2>
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <FilterSelect value={data.term?.id ?? ''} onValueChange={setTermId}>
          {data.terms.map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.label}
            </SelectItem>
          ))}
        </FilterSelect>
      </div>
      {data.grids.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        data.grids.map((g) => (
          <div key={g.classSubjectId} className="overflow-x-auto">
            <h3 className="mb-1 text-sm font-semibold text-foreground">{g.subjectName}</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="py-1.5 pr-2 text-left text-xs font-semibold text-muted-foreground">
                    {t('criterionColumn')}
                  </th>
                  {g.ratingScale.map((label, i) => (
                    <th
                      key={i}
                      className="px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.criteria.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-1.5 pr-2 text-foreground">{c.label}</td>
                    {g.ratingScale.map((label, level) => (
                      <td key={level} className="px-2 py-1.5 text-center">
                        <span
                          role="img"
                          aria-label={c.level === level ? `${c.label}: ${label}` : ''}
                          className={cn(
                            'inline-block h-4 w-4 rounded-full border-2',
                            c.level === level ? 'border-primary bg-primary' : 'border-border',
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </Card>
  );
}
