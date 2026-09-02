'use client';

// Appréciations enseignant, liste : one card per class I teach in or
// homeroom, with my per-subject saisie progress for the selected term.
// Clicking a card opens the per-student wizard on the class's first
// student. Mirrors the Mes élèves grid look (CardGrid/ListCard) rather
// than the school module's table, per the spec's « cartes standard ».
import { useState } from 'react';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import { useUser } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { CardGrid } from '@/components/school/CardGrid';
import { ListCard } from '@/components/school/ListCard';
import { Badge } from '@/components/ui/Badge';
import type { TeacherAppreciationsListData } from './types';

export default function TeacherAppreciationsPage() {
  const t = useTranslations('TeacherAppreciations');
  const user = useUser();
  const [termId, setTermId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useApi<TeacherAppreciationsListData>(
    `/api/teacher/appreciations${termId ? `?termId=${termId}` : ''}`,
    {
      skip: !user,
      onError: () => {
        setError(t('loadError'));
        return true;
      },
    },
  );

  if (!user || (!data && !error)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {data && data.terms.length > 0 && (
          <FilterSelect value={termId || (data.resolvedTermId ?? '')} onValueChange={setTermId}>
            {data.terms.map((term) => (
              <SelectItem key={term.id} value={term.id}>
                {term.label}
              </SelectItem>
            ))}
          </FilterSelect>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : data && data.classes.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        </Card>
      ) : (
        data && (
          <CardGrid>
            {data.classes.map((c) => {
              const resolved = termId || data.resolvedTermId;
              const href = c.firstStudentId
                ? `/espace-enseignant/appreciations/${c.firstStudentId}${resolved ? `?termId=${resolved}` : ''}`
                : undefined;
              const progressLines = [
                ...(c.generalSaisieCount != null
                  ? [t('generalProgress', { count: c.generalSaisieCount, total: c.studentCount })]
                  : []),
                ...c.subjects.map((s) =>
                  t('subjectProgress', {
                    subject: s.subjectName,
                    count: s.saisieCount,
                    total: c.studentCount,
                  }),
                ),
              ];
              return (
                <ListCard
                  key={c.classId}
                  tile={
                    <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-secondary text-primary">
                      <Star size={18} />
                    </div>
                  }
                  title={c.className}
                  {...(href ? { href } : {})}
                  subtitle={
                    c.studentCount > 0
                      ? t('studentCount', { count: c.studentCount })
                      : t('noStudents')
                  }
                  metaLeft={c.level ? <Badge>{c.level}</Badge> : undefined}
                  metaRight={
                    c.isMyHomeroom ? <Badge tone="success">{t('homeroomBadge')}</Badge> : undefined
                  }
                  footerLeft={
                    progressLines.length > 0 ? (
                      <span className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {progressLines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </CardGrid>
        )
      )}
    </div>
  );
}
