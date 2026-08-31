'use client';

// Fiche élève allégée — identity + class header, then only what this
// teacher owns pedagogically for the selected term: their subjects'
// evaluations with this student's scores and averages, and the
// appreciations (their subjects + the general one when they homeroom the
// class). Deliberately no contacts, guardians or finances: that data
// stays on the school back-office profile. Term switching refetches with
// ?termId=; the default term is resolved server-side.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';

type StudentStatus = 'ENROLLED' | 'REPEATED_ABSENCES' | 'SUSPENDED';
type EvaluationType = 'DS' | 'INTERROGATION' | 'EXAMEN' | 'AUTRE';
type EvaluationStatus = 'DRAFT' | 'PUBLISHED';
type Mention = 'TRES_BIEN' | 'BIEN' | 'ASSEZ_BIEN' | 'PASSABLE' | 'INSUFFISANT' | 'FAIBLE';

const STATUS_TONE: Record<StudentStatus, 'success' | 'warning' | 'secondary'> = {
  ENROLLED: 'success',
  REPEATED_ABSENCES: 'warning',
  SUSPENDED: 'secondary',
};

interface ProfileResponse {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    studentNumber: string;
    photoUrl: string | null;
    status: StudentStatus;
  };
  class: { id: string; name: string; level: string };
  isMyHomeroom: boolean;
  term: { id: string; label: string } | null;
  terms: { id: string; label: string }[];
  subjects: {
    classSubjectId: string;
    subjectId: string;
    subjectName: string;
    evaluations: {
      id: string;
      label: string;
      type: EvaluationType;
      date: string | null;
      maxScore: number;
      coefficient: number;
      status: EvaluationStatus;
      score: number | null;
      absent: boolean;
      comment: string | null;
    }[];
    average: number | null;
  }[];
  appreciations: {
    subjectId: string | null;
    mention: Mention | null;
    text: string | null;
    comportement: string | null;
    investissement: string | null;
    assiduite: string | null;
    status: EvaluationStatus;
  }[];
}

export default function TeacherStudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('TeacherStudents.profile');
  const tStatus = useTranslations('Eleves.list.status');
  const tMention = useTranslations('Eleves.mention');
  const tType = useTranslations('Gradebook.evaluationType');
  const tEvalStatus = useTranslations('Gradebook.evaluationStatus');
  const tPortal = useTranslations('TeacherPortal');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [termId, setTermId] = useState('');
  const [notFound, setNotFound] = useState(false);

  const { data, error } = useApi<ProfileResponse>(
    `/api/teacher/students/${id}${termId ? `?termId=${termId}` : ''}`,
    {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return true;
        }
      },
    },
  );

  const fmtScore = (n: number) => n.toLocaleString(bcp47);
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(bcp47, { day: 'numeric', month: 'short', year: 'numeric' });

  const subjectNameById = new Map((data?.subjects ?? []).map((s) => [s.subjectId, s.subjectName]));
  const sortedAppreciations = [...(data?.appreciations ?? [])].sort((a, b) =>
    a.subjectId === null ? -1 : b.subjectId === null ? 1 : 0,
  );

  return (
    <div className={LIST_PAGE}>
      <Link
        href="/espace-enseignant/eleves"
        className="mb-3 flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft size={16} />
        {t('back')}
      </Link>

      {notFound ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {t('notFound')}
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {tPortal('loadError')}
        </p>
      ) : !data ? (
        <div className="flex flex-col gap-3.5">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="flex-row items-center gap-4 p-4">
            <Avatar
              name={`${data.student.firstName} ${data.student.lastName}`}
              size={56}
              src={data.student.photoUrl}
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-extrabold tracking-tight text-foreground">
                {data.student.firstName} {data.student.lastName}
              </h1>
              <p className="text-xs text-muted-foreground">
                #{data.student.studentNumber} · {data.class.name} · {data.class.level}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone={STATUS_TONE[data.student.status]}>
                  {tStatus(data.student.status)}
                </Badge>
                {data.isMyHomeroom && <Badge>{t('homeroom')}</Badge>}
              </div>
            </div>
            {data.terms.length > 0 && (
              <FilterSelect value={termId || (data.term?.id ?? '')} onValueChange={setTermId}>
                {data.terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.label}
                  </SelectItem>
                ))}
              </FilterSelect>
            )}
          </Card>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('notesTitle')}</h2>
            {data.subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noEvaluations')}</p>
            ) : (
              data.subjects.map((subject) => (
                <Card key={subject.classSubjectId} className="gap-0 p-0">
                  <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                    <h3 className="text-sm font-bold text-foreground">{subject.subjectName}</h3>
                    <span className="text-xs font-semibold text-foreground">
                      {t('average')}{' '}
                      {subject.average === null ? (
                        <span className="text-muted-foreground">·</span>
                      ) : (
                        <span className="text-primary">{fmtScore(subject.average)}/20</span>
                      )}
                    </span>
                  </div>
                  {subject.evaluations.length === 0 ? (
                    <p className="px-3.5 py-3 text-sm text-muted-foreground">
                      {t('noEvaluations')}
                    </p>
                  ) : (
                    <div className={TABLE_SCROLL}>
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <thead className={STICKY_THEAD}>
                          <tr className="border-b border-border">
                            <Th>{t('table.evaluation')}</Th>
                            <Th>{t('table.type')}</Th>
                            <Th>{t('table.date')}</Th>
                            <Th>{t('table.score')}</Th>
                            <Th>{t('table.coefficient')}</Th>
                            <Th>{t('table.status')}</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {subject.evaluations.map((e) => (
                            <tr key={e.id} className="border-b border-border last:border-none">
                              <td className="px-3.5 py-2.5">
                                <Link
                                  href={`/espace-enseignant/carnet-de-notes/${e.id}/saisie`}
                                  className="font-semibold text-foreground hover:text-primary hover:underline"
                                >
                                  {e.label}
                                </Link>
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {tType(e.type)}
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {e.date ? fmtDate(e.date) : '·'}
                              </td>
                              <td className="px-3.5 py-2.5">
                                {e.absent ? (
                                  <span className="text-muted-foreground">{t('absent')}</span>
                                ) : e.score === null ? (
                                  <span className="text-muted-foreground">{t('notGraded')}</span>
                                ) : (
                                  <span className="font-semibold text-foreground">
                                    {fmtScore(e.score)}/{e.maxScore}
                                  </span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {e.coefficient}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <Badge tone={e.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                                  {tEvalStatus(e.status)}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              ))
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('appreciationsTitle')}</h2>
            {sortedAppreciations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noAppreciations')}</p>
            ) : (
              <Card className="divide-y divide-border p-0">
                {sortedAppreciations.map((a) => (
                  <div key={a.subjectId ?? 'general'} className="flex flex-col gap-1 px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">
                        {a.subjectId === null
                          ? t('general')
                          : (subjectNameById.get(a.subjectId) ?? '')}
                      </span>
                      {a.mention && <Badge>{tMention(a.mention)}</Badge>}
                      <Badge tone={a.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                        {tEvalStatus(a.status)}
                      </Badge>
                    </div>
                    {a.text && <p className="text-sm text-muted-foreground">{a.text}</p>}
                    {a.subjectId === null && (
                      <p className="text-xs text-muted-foreground">
                        {[
                          a.comportement ? `${t('comportement')} : ${a.comportement}` : null,
                          a.investissement ? `${t('investissement')} : ${a.investissement}` : null,
                          a.assiduite ? `${t('assiduite')} : ${a.assiduite}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
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

function Badge({
  children,
  tone = 'secondary',
}: {
  children: ReactNode;
  tone?: 'secondary' | 'success' | 'warning';
}) {
  const toneClasses = {
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
