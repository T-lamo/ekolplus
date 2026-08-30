'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, AlertTriangle, Save, Check, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EvaluationConfigForm } from '../../EvaluationConfigForm';
import type { ClassSubjectOption, EvaluationConfig, TermOption } from '../../types';

export default function EditEvaluationPage() {
  const t = useTranslations('Gradebook.editEvaluation');
  const tCommon = useTranslations('Common');
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const params = useParams<{ evaluationId: string }>();
  const [value, setValue] = useState<EvaluationConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: evaluationData } = useApi<{
    evaluation: {
      id: string;
      classSubjectId: string;
      termId: string;
      label: string;
      type: EvaluationConfig['type'];
      maxScore: number;
      coefficient: number;
      countsTowardAverage: boolean;
      notes: string | null;
      date: string | null;
    };
  }>(`/api/school/evaluations/${params.evaluationId}`, {
    skip: !user,
    onError: (err) => {
      setLoadError(err instanceof ApiError && err.status === 404 ? t('notFound') : t('loadError'));
      return true;
    },
  });
  const { data: classSubjectsData, error: classSubjectsErr } = useApi<{
    classSubjects: ClassSubjectOption[];
  }>('/api/school/class-subjects', { skip: !user });
  const { data: schoolData, error: schoolErr } = useApi<{
    academicYear: { terms: TermOption[] } | null;
  }>('/api/school', { skip: !user });
  const classSubjects = classSubjectsData?.classSubjects ?? [];
  const terms = schoolData?.academicYear?.terms ?? [];
  const error = loadError ?? (classSubjectsErr || schoolErr ? t('loadError') : null);

  const seededForId = useRef<string | null>(null);
  useEffect(() => {
    if (evaluationData && seededForId.current !== params.evaluationId) {
      seededForId.current = params.evaluationId;
      const ev = evaluationData.evaluation;
      setValue({
        id: ev.id,
        classSubjectId: ev.classSubjectId,
        termId: ev.termId,
        label: ev.label,
        type: ev.type,
        maxScore: ev.maxScore,
        coefficient: ev.coefficient,
        countsTowardAverage: ev.countsTowardAverage,
        notes: ev.notes,
        date: ev.date ? ev.date.slice(0, 10) : null,
      });
    }
  }, [evaluationData, params.evaluationId]);

  async function onSave() {
    if (!value) return;
    setSaving(true);
    setLoadError(null);
    try {
      await api(`/api/school/evaluations/${value.id}`, {
        method: 'PATCH',
        body: {
          classSubjectId: value.classSubjectId,
          termId: value.termId,
          label: value.label,
          type: value.type,
          maxScore: value.maxScore,
          coefficient: value.coefficient,
          countsTowardAverage: value.countsTowardAverage,
          notes: value.notes,
          date: value.date,
        },
      });
      toast(t('updatedToast'), 'success');
      router.push(`/pedagogie/carnet-de-notes/${value.id}/saisie`);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!value) return;
    if (
      !(await confirm({
        message: t('deleteConfirmMessage'),
        danger: true,
      }))
    )
      return;
    setDeleting(true);
    try {
      await api(`/api/school/evaluations/${value.id}`, { method: 'DELETE' });
      toast(t('deletedToast'), 'success');
      router.push('/pedagogie/carnet-de-notes');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : tCommon('errors.network'));
      setDeleting(false);
    }
  }

  if (!user || (!value && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (error && !value) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/pedagogie/carnet-de-notes"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('back')}
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/pedagogie/carnet-de-notes/${value!.id}/saisie`}
            className="mb-1 flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft size={14} />
            {t('backToEntry')}
          </Link>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="flex w-fit items-center gap-1.5 rounded-md bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
        >
          <Trash2 size={14} />
          {t('deleteButton')}
        </button>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border-l-[3px] border-warning-foreground bg-warning px-4 py-3">
        <AlertTriangle size={16} className="shrink-0 text-warning-foreground" />
        <div>
          <div className="text-caption font-semibold text-warning-foreground">
            {t('warningTitle')}
          </div>
          <div className="text-xs text-warning-foreground/90">{t('warningBody')}</div>
        </div>
      </div>

      <Card className="p-5">
        <EvaluationConfigForm
          value={value!}
          onChange={setValue}
          classSubjects={classSubjects}
          terms={terms}
        />
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      <Card className="flex-row flex-wrap items-center justify-between gap-2 p-3.5">
        <span className="text-caption text-muted-foreground">{t('unsavedNotice')}</span>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button variant="ghost" className="w-fit" onClick={() => router.back()}>
            {t('cancel')}
          </Button>
          <Button className="w-fit" onClick={onSave} loading={saving}>
            {saving ? (
              <>
                <Save size={14} />
                {t('saving')}
              </>
            ) : (
              <>
                <Check size={14} />
                {t('confirmChanges')}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
