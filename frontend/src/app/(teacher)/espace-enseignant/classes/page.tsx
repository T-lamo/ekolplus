'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { CARD_GRID, CARD_GRID_CONTAINER } from '@/lib/layout';
import { getSubjectVisual } from '@/lib/subject-visuals';

interface TeacherClassesResponse {
  homeroomClasses: { id: string; name: string; level: string; studentCount: number }[];
  classSubjects: {
    id: string;
    className: string;
    classLevel: string;
    subjectName: string;
    subjectIcon: string | null;
    subjectColor: string | null;
    studentCount: number;
  }[];
}

export default function EspaceEnseignantClassesPage() {
  const t = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const { data, loading, error } = useApi<TeacherClassesResponse>('/api/teacher/me');

  function studentsLabel(count: number) {
    return t(count === 1 ? 'plural.students.one' : 'plural.students.other', { count });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error || !data ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('myHomerooms')}</h2>
            {data.homeroomClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noHomerooms')}</p>
            ) : (
              <div className={CARD_GRID_CONTAINER}>
                <div className={CARD_GRID}>
                  {data.homeroomClasses.map((c) => (
                    <Link key={c.id} href={`/espace-enseignant/classes/homeroom/${c.id}`}>
                      <Card className="gap-1 p-4">
                        <p className="text-sm font-bold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.level}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Users size={12} />
                          {studentsLabel(c.studentCount)}
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('mySubjects')}</h2>
            {data.classSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noSubjects')}</p>
            ) : (
              <div className={CARD_GRID_CONTAINER}>
                <div className={CARD_GRID}>
                  {data.classSubjects.map((cs) => {
                    const visual = getSubjectVisual(cs.subjectName, {
                      icon: cs.subjectIcon,
                      color: cs.subjectColor,
                    });
                    return (
                      <Link key={cs.id} href={`/espace-enseignant/classes/${cs.id}`}>
                        <Card className="flex-row items-center gap-3 p-4">
                          <div
                            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md"
                            style={{ background: visual.iconBg, color: visual.iconFg }}
                          >
                            <visual.Icon size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-foreground">
                              {cs.subjectName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {cs.className} · {cs.classLevel}
                            </p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Users size={12} />
                              {studentsLabel(cs.studentCount)}
                            </p>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
