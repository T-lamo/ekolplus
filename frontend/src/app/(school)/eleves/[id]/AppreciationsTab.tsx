'use client';

import { useEffect, useState } from 'react';
import { Star, BookOpen, Pencil } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton';
import { MENTION_LABEL, type Mention, type StudentAppreciationData } from '../types';

function mentionClass(m: Mention | null): string {
  switch (m) {
    case 'TRES_BIEN':
      return 'bg-success text-success-foreground';
    case 'BIEN':
      return 'bg-info text-info-foreground';
    case 'ASSEZ_BIEN':
      return 'bg-warning text-warning-foreground';
    case 'PASSABLE':
      return 'bg-muted text-muted-foreground';
    case 'INSUFFISANT':
    case 'FAIBLE':
      return 'bg-destructive text-destructive-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1);
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function AppreciationsTab({ studentId }: { studentId: string }) {
  const [termId, setTermId] = useState('');
  const [data, setData] = useState<StudentAppreciationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = termId ? `?termId=${termId}` : '';
    api<StudentAppreciationData>(`/api/school/students/${studentId}/appreciations${qs}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setTermId(d.resolvedTermId ?? '');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId, termId]);

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="ml-auto h-8 w-48 rounded-md" />
        </Card>
        <Card className="gap-3 p-4.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-3 w-64" />
        </Card>
        <Card className="gap-3 p-4.5">
          <Skeleton className="h-4 w-56" />
          <SkeletonTable rows={5} cols={4} />
        </Card>
      </div>
    );
  }

  const hasContent =
    data.general != null || data.subjects.some((s) => s.text != null || s.mention != null);
  const editHref = `/pedagogie/appreciations/${studentId}/saisie?termId=${data.resolvedTermId ?? ''}`;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
        <span className="text-xs font-semibold text-muted-foreground">Filtrer par :</span>
        <FilterSelect value={termId} onValueChange={setTermId}>
          {data.terms.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.label}
            </SelectItem>
          ))}
        </FilterSelect>
        <Link
          href={editHref}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-caption font-semibold text-primary-foreground"
        >
          <Pencil size={13} />
          Modifier l&apos;appréciation
        </Link>
      </Card>

      {!hasContent ? (
        <Card className="items-center gap-2 p-10 text-center">
          <Star size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Aucune appréciation saisie pour cette période.
          </p>
          <Link href={editHref} className="text-xs font-semibold text-primary">
            Rédiger une appréciation →
          </Link>
        </Card>
      ) : (
        <>
          <Card className="gap-3 p-4.5">
            <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
              <Star size={14} className="text-primary" />
              Appréciation générale
            </div>
            {data.general ? (
              <>
                <div className="rounded-md bg-muted p-3.5 text-caption leading-relaxed text-foreground">
                  {data.general.text || <span className="text-muted-foreground italic">—</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Rédigé par :{' '}
                    <strong className="text-foreground">{data.general.authorName ?? '—'}</strong>
                  </span>
                  <span className="text-border">·</span>
                  <span>Saisie le {fmtDate(data.general.createdAt)}</span>
                  <span className="text-border">·</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${data.general.status === 'PUBLISHED' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}
                  >
                    {data.general.status === 'PUBLISHED' ? 'Saisie' : 'Brouillon'}
                  </span>
                  {data.general.mention && (
                    <>
                      <span className="text-border">·</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${mentionClass(data.general.mention)}`}
                      >
                        {MENTION_LABEL[data.general.mention]}
                      </span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Aucune appréciation générale saisie pour cet élève.
              </p>
            )}
          </Card>

          <Card className="gap-3 p-4.5">
            <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
              <BookOpen size={14} className="text-primary" />
              Appréciations par matière
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      Matière
                    </th>
                    <th className="px-2 py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">
                      Coeff.
                    </th>
                    <th className="px-2 py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">
                      Moy.
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      Mention
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      Appréciation
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      Enseignant
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.subjects.map((s) => (
                    <tr key={s.classSubjectId} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2 text-caption font-semibold text-foreground">
                        {s.subjectName}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-muted-foreground">
                        {s.coefficient ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className="text-sm font-bold text-foreground">{fmt(s.average)}</span>
                      </td>
                      <td className="px-2 py-2">
                        {s.mention ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-2xs font-bold ${mentionClass(s.mention)}`}
                          >
                            {MENTION_LABEL[s.mention]}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-[240px] px-2 py-2">
                        <span className="block truncate text-xs text-foreground">
                          {s.text ?? <span className="text-muted-foreground italic">—</span>}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs font-medium text-foreground">
                        {s.teacherName ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
              <span className="text-caption font-medium text-muted-foreground">
                Moyenne générale
              </span>
              <span className="text-xl font-extrabold text-foreground">
                {fmt(data.overallAverage)} / 20
              </span>
              {data.general?.mention && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${mentionClass(data.general.mention)}`}
                >
                  {MENTION_LABEL[data.general.mention]}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                — Rang : {data.rank ?? '—'} / {data.rankedCount}
              </span>
            </div>
          </Card>
        </>
      )}

      {loading && <Skeleton className="mx-auto h-3 w-24" />}
    </div>
  );
}
