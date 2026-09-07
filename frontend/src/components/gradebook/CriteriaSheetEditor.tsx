'use client';

// Per-student entry screen of a qualitative sheet, shared by the teacher
// portal (/api/teacher) and the school app (/api/school): term picker,
// completion list (student × "n/N"), the selected student's grid (criteria ×
// scale, one tick per row, click the active tick to clear), prev/next
// student, "Enregistrer brouillon" and "Valider" (publishes the whole
// sheet). Read-only when the term's grade entry is off or the caller lacks
// the edit right; the lock and the scale labels come from the data.
// Spec 2026-09-05 §5.2.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Lock, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton } from '@/components/ui/Skeleton';
import { LIST_PAGE } from '@/lib/layout';
import { cn } from '@/lib/utils';
import {
  type RatingOverrides,
  flattenOverrides,
  mergeSheetRatings,
  ratedCount,
} from './criteria-sheet-utils';

export interface CriteriaSheetDto {
  id: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  term: { id: string; label: string; gradeEntryEnabled: boolean };
  terms: { id: string; label: string }[];
  classSubject: { id: string; className: string };
  subject: {
    id: string;
    name: string;
    ratingScale: string[];
    criteria: { id: string; label: string }[];
  };
  students: {
    studentId: string;
    firstName: string;
    lastName: string;
    ratings: Record<string, number>;
  }[];
}

export function CriteriaSheetEditor({
  apiBase,
  classSubjectId,
  backHref,
  canEdit,
}: {
  apiBase: '/api/teacher' | '/api/school';
  classSubjectId: string;
  backHref: string;
  canEdit: boolean;
}) {
  const t = useTranslations('Gradebook.criteria');
  const { toast } = useToast();
  const [termId, setTermId] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [overrides, setOverrides] = useState<RatingOverrides>({});
  const [saving, setSaving] = useState<'DRAFT' | 'PUBLISHED' | null>(null);

  const endpoint = `${apiBase}/class-subjects/${classSubjectId}/criteria-assessment`;
  const { data, error, refresh } = useApi<{ sheet: CriteriaSheetDto }>(
    `${endpoint}${termId ? `?termId=${termId}` : ''}`,
  );
  const sheet = data?.sheet ?? null;

  // Unsaved ticks belong to the sheet they were made on: drop them on a term change.
  useEffect(() => {
    setOverrides({});
    setSelected(0);
  }, [termId]);

  const locked = !canEdit || !sheet || !sheet.term.gradeEntryEnabled;
  const merged = useMemo(
    () => mergeSheetRatings(sheet?.students ?? [], overrides),
    [sheet, overrides],
  );
  const student = sheet?.students[selected] ?? null;
  const criteriaCount = sheet?.subject.criteria.length ?? 0;
  const dirty = Object.keys(overrides).length > 0;

  const setLevel = (criterionId: string, level: number | null) => {
    if (locked || !student) return;
    const id = student.studentId;
    setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [criterionId]: level } }));
  };

  const save = async (status: 'DRAFT' | 'PUBLISHED') => {
    if (!sheet) return;
    setSaving(status);
    try {
      await api(endpoint, {
        method: 'PUT',
        body: { termId: sheet.term.id, status, ratings: flattenOverrides(overrides) },
      });
      await refresh();
      setOverrides({});
      toast(status === 'PUBLISHED' ? t('validatedToast') : t('draftSavedToast'), 'success');
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'GRADE_ENTRY_DISABLED'
          ? t('locked')
          : err instanceof ApiError
            ? err.message
            : t('saveError');
      toast(message, 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className={`${LIST_PAGE} gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            {t('back')}
          </Link>
          <h1 className="text-lg font-bold text-foreground">
            {sheet ? `${sheet.classSubject.className} · ${sheet.subject.name}` : t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {sheet && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-2xs font-bold',
                sheet.status === 'PUBLISHED'
                  ? 'bg-success text-success-foreground'
                  : 'bg-warning text-warning-foreground',
              )}
            >
              {sheet.status === 'PUBLISHED' ? t('statusPublished') : t('statusDraft')}
            </span>
          )}
          {!locked && (
            <>
              <Button
                variant="outline"
                className="w-fit"
                disabled={!dirty || saving !== null}
                loading={saving === 'DRAFT'}
                onClick={() => void save('DRAFT')}
              >
                <Save size={14} />
                {t('saveDraft')}
              </Button>
              <Button
                className="w-fit"
                disabled={saving !== null}
                loading={saving === 'PUBLISHED'}
                onClick={() => void save('PUBLISHED')}
              >
                <Check size={14} />
                {t('validate')}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {t('loadError')}
        </p>
      )}
      {sheet && !sheet.term.gradeEntryEnabled && (
        <p className="flex items-center gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm text-foreground">
          <Lock size={14} />
          {t('locked')}
        </p>
      )}

      <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
        <FilterSelect value={sheet?.term.id ?? ''} onValueChange={setTermId}>
          {(sheet?.terms ?? []).map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.label}
            </SelectItem>
          ))}
        </FilterSelect>
        {sheet && (
          <span className="text-xs text-muted-foreground">
            {t('scaleHint', { scale: sheet.subject.ratingScale.join(' · ') })}
          </span>
        )}
      </Card>

      {!sheet ? (
        <Skeleton className="h-72 w-full" />
      ) : sheet.students.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t('noStudents')}</p>
        </Card>
      ) : sheet.subject.criteria.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t('noCriteria')}</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="gap-0 p-0">
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {sheet.students.map((s, i) => {
                const n = ratedCount(merged.get(s.studentId));
                return (
                  <li key={s.studentId}>
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted',
                        i === selected && 'bg-primary/10 font-semibold',
                      )}
                    >
                      <span className="truncate">
                        {s.lastName} {s.firstName}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-xs',
                          n === criteriaCount ? 'text-success' : 'text-muted-foreground',
                        )}
                      >
                        {n}/{criteriaCount}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {student && (
            <Card className="gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={selected === 0}
                  onClick={() => setSelected(selected - 1)}
                >
                  <ChevronLeft size={14} />
                  {t('prevStudent')}
                </Button>
                <p className="text-sm font-semibold text-foreground">
                  {student.lastName} {student.firstName}{' '}
                  <span className="font-normal text-muted-foreground">
                    ({selected + 1}/{sheet.students.length})
                  </span>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={selected === sheet.students.length - 1}
                  onClick={() => setSelected(selected + 1)}
                >
                  {t('nextStudent')}
                  <ChevronRight size={14} />
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="py-2 pr-2 text-left text-xs font-semibold text-muted-foreground">
                        {t('criterionColumn')}
                      </th>
                      {sheet.subject.ratingScale.map((label, level) => (
                        <th
                          key={level}
                          className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.subject.criteria.map((c) => {
                      const current = merged.get(student.studentId)?.[c.id] ?? null;
                      return (
                        <tr key={c.id} className="border-t border-border">
                          <td className="py-2 pr-2 text-foreground">{c.label}</td>
                          {sheet.subject.ratingScale.map((label, level) => (
                            <td key={level} className="px-2 py-2 text-center">
                              <button
                                type="button"
                                role="radio"
                                aria-checked={current === level}
                                aria-label={`${c.label}: ${label}`}
                                disabled={locked}
                                onClick={() => setLevel(c.id, current === level ? null : level)}
                                className={cn(
                                  'h-6 w-6 rounded-full border-2 transition-colors',
                                  current === level
                                    ? 'border-primary bg-primary'
                                    : 'border-border bg-card hover:border-primary/60',
                                  locked && 'cursor-not-allowed opacity-60',
                                )}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
