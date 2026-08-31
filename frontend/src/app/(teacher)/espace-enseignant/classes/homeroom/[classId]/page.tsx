'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

interface HomeroomRosterResponse {
  class: { id: string; name: string; level: string };
  students: { id: string; firstName: string; lastName: string; studentNumber: string }[];
}

export default function HomeroomRosterPage() {
  const { classId } = useParams<{ classId: string }>();
  const t = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const { data, loading, error } = useApi<HomeroomRosterResponse>(
    `/api/teacher/classes/homeroom/${classId}`,
  );

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/espace-enseignant/classes"
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft size={16} />
        {t('roster.back')}
      </Link>

      {loading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-bold text-foreground">{data!.class.name}</h1>
            <p className="text-sm text-muted-foreground">{data!.class.level}</p>
            <p className="text-xs text-muted-foreground">
              {t(data!.students.length === 1 ? 'plural.students.one' : 'plural.students.other', {
                count: data!.students.length,
              })}
            </p>
          </div>

          {data!.students.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('roster.noStudents')}</p>
          ) : (
            <Card className="divide-y divide-border p-0">
              {data!.students.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3.5 py-3">
                  <span className="text-sm font-medium text-foreground">
                    {s.firstName} {s.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('roster.studentNumber', { number: s.studentNumber })}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
