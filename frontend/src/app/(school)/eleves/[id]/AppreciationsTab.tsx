'use client';

import { useEffect, useRef, useState } from 'react';
import { Star, BookOpen, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { getCache, useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton';
import { LOCALE_BCP47 } from '@/lib/locales';
import { mentionLabel } from '../mention-label';
import type { Mention, StudentAppreciationData } from '../types';

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

function fmtDate(iso: string | undefined, locale: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function AppreciationsTab({ studentId }: { studentId: string }) {
  const t = useTranslations('Eleves.appreciations');
  const tFilterBy = useTranslations('Eleves');
  const tMention = useTranslations('Eleves.mention');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [termId, setTermId] = useState('');
  const qs = termId ? `?termId=${termId}` : '';
  const appreciationsPath = `/api/school/students/${studentId}/appreciations${qs}`;
  const { data, loading } = useApi<StudentAppreciationData>(appreciationsPath);

  // `termId` is local state, not a URL param, so this component never
  // remounts on term change — gate the auto-seed on `getCache(...) === data`
  // (only true once the cache entry actually written for THIS path matches
  // what we're holding) so a stale sibling term's data can't seed the wrong
  // resolvedTermId.
  const keyRef = useRef<string | null>(null);
  useEffect(() => {
    if (data && getCache(appreciationsPath) === data && keyRef.current !== appreciationsPath) {
      keyRef.current = appreciationsPath;
      setTermId(data.resolvedTermId ?? '');
    }
  }, [data, appreciationsPath]);

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
        <span className="text-xs font-semibold text-muted-foreground">{tFilterBy('filterBy')}</span>
        <FilterSelect value={termId} onValueChange={setTermId}>
          {data.terms.map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.label}
            </SelectItem>
          ))}
        </FilterSelect>
        <Link
          href={editHref}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-caption font-semibold text-primary-foreground"
        >
          <Pencil size={13} />
          {t('editLink')}
        </Link>
      </Card>

      {!hasContent ? (
        <Card className="items-center gap-2 p-10 text-center">
          <Star size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">{t('empty')}</p>
          <Link href={editHref} className="text-xs font-semibold text-primary">
            {t('writeLink')}
          </Link>
        </Card>
      ) : (
        <>
          <Card className="gap-3 p-4.5">
            <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
              <Star size={14} className="text-primary" />
              {t('general.title')}
            </div>
            {data.general ? (
              <>
                <div className="rounded-md bg-muted p-3.5 text-caption leading-relaxed text-foreground">
                  {data.general.text || <span className="text-muted-foreground italic">—</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {t('general.writtenBy')}{' '}
                    <strong className="text-foreground">{data.general.authorName ?? '—'}</strong>
                  </span>
                  <span className="text-border">·</span>
                  <span>
                    {t('general.enteredOn', { date: fmtDate(data.general.createdAt, bcp47) })}
                  </span>
                  <span className="text-border">·</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${data.general.status === 'PUBLISHED' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}
                  >
                    {data.general.status === 'PUBLISHED'
                      ? t('general.published')
                      : t('general.draft')}
                  </span>
                  {data.general.mention && (
                    <>
                      <span className="text-border">·</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${mentionClass(data.general.mention)}`}
                      >
                        {mentionLabel(data.general.mention, tMention)}
                      </span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">{t('general.empty')}</p>
            )}
          </Card>

          <Card className="gap-3 p-4.5">
            <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
              <BookOpen size={14} className="text-primary" />
              {t('bySubject.title')}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.subject')}
                    </th>
                    <th className="px-2 py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.coefficient')}
                    </th>
                    <th className="px-2 py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.average')}
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.mention')}
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.appreciation')}
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.teacher')}
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
                            {mentionLabel(s.mention, tMention)}
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
                {t('overallAverage')}
              </span>
              <span className="text-xl font-extrabold text-foreground">
                {fmt(data.overallAverage)} / 20
              </span>
              {data.general?.mention && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${mentionClass(data.general.mention)}`}
                >
                  {mentionLabel(data.general.mention, tMention)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {t('rank', { rank: data.rank ?? '—', rankedCount: data.rankedCount })}
              </span>
            </div>
          </Card>
        </>
      )}

      {loading && <Skeleton className="mx-auto h-3 w-24" />}
    </div>
  );
}
