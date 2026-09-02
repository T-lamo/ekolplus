'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Avatar } from '@/components/ui/Avatar';
import { Pager } from '@/components/ui/Pager';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { getSubjectVisual } from '@/lib/subject-visuals';

const PAGE_SIZE = 20;

interface RosterResponse {
  classSubject: {
    id: string;
    className: string;
    classLevel: string;
    subjectName: string;
    subjectIcon: string | null;
    subjectColor: string | null;
  };
  students: { id: string; firstName: string; lastName: string; studentNumber: string }[];
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}

export default function ClassSubjectRosterPage() {
  const { classSubjectId } = useParams<{ classSubjectId: string }>();
  const t = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi<RosterResponse>(`/api/teacher/classes/${classSubjectId}`);

  const students = data?.students ?? [];
  const paged = students.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={LIST_PAGE}>
      <Link
        href="/espace-enseignant/classes"
        className="mb-3 flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft size={16} />
        {t('roster.back')}
      </Link>

      {loading && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : error || !data ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <>
          {(() => {
            const visual = getSubjectVisual(data.classSubject.subjectName, {
              icon: data.classSubject.subjectIcon,
              color: data.classSubject.subjectColor,
            });
            return (
              <div className="mb-4 flex items-center gap-3">
                <div
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md"
                  style={{ background: visual.iconBg, color: visual.iconFg }}
                >
                  <visual.Icon size={18} />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-foreground">
                    {data.classSubject.subjectName}
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {data.classSubject.className} · {data.classSubject.classLevel} ·{' '}
                    {t(students.length === 1 ? 'plural.students.one' : 'plural.students.other', {
                      count: students.length,
                    })}
                  </p>
                </div>
              </div>
            );
          })()}

          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('roster.noStudents')}</p>
          ) : (
            <Card className="p-0">
              <div className={TABLE_SCROLL}>
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>{t('table.student')}</Th>
                      <Th className="w-[160px]">{t('table.studentNumber')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${s.firstName} ${s.lastName}`} size={32} />
                            <span className="font-semibold text-foreground">
                              {s.firstName} {s.lastName}
                            </span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">#{s.studentNumber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                centered
                page={page}
                pageSize={PAGE_SIZE}
                total={students.length}
                onChange={setPage}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
