'use client';

// /configuration/classes/[id] — fiche classe en édition (add-class.md) : même
// formulaire que la création ; les matières se basculent à la volée, le reste
// s'enregistre avec « Enregistrer ».
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Save } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePermissions } from '@/lib/usePermissions';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ASIDE_GRID } from '@/lib/layout';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ClassPageShell } from '@/components/school/classes/ClassPageShell';
import {
  ClassForm,
  classSectionsDone,
  doneSectionKeys,
} from '@/components/school/classes/ClassForm';
import { useClassForm } from '@/components/school/classes/useClassForm';
import { useClassFormData } from '@/components/school/classes/useClassFormData';
import type { ClassData, ClassDetail } from '../types';

export default function ClassDetailPage() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const { toast } = useToast();
  const t = useTranslations('Configuration.classes.detail');
  const tCommon = useTranslations('Common');
  const { options, error: optionsError, noSchool } = useClassFormData(!!user);
  const [loadError, setLoadError] = useState<string | null>(null);
  const {
    data: clsData,
    mutate,
    refresh: loadDetail,
  } = useApi<{ class: ClassDetail }>(`/api/school/classes/${classId}`, {
    skip: !user,
    onError: (err) => {
      setLoadError(
        err instanceof ApiError && err.status === 404
          ? t('notFound')
          : err instanceof ApiError
            ? err.message
            : tCommon('errors.network'),
      );
      return true;
    },
  });
  const cls = clsData?.class ?? null;
  const error = loadError;

  useEffect(() => {
    if (noSchool) router.replace('/');
  }, [noSchool, router]);

  const onSaved = useCallback(
    (saved: ClassData) => {
      toast(t('updated'), 'success');
      if (cls) {
        mutate({ class: { ...cls, ...saved, homeroomTeacher: cls.homeroomTeacher } });
      }
      void loadDetail();
    },
    [toast, loadDetail, t, cls, mutate],
  );

  const roomIds = useMemo(() => (options?.rooms ?? []).map((r) => r.id), [options?.rooms]);
  const form = useClassForm({
    cls,
    levelCatalog: options?.levelCatalog ?? [],
    roomIds,
    subjects: options?.subjects ?? [],
    onSaved,
  });

  const { canSee } = usePermissions();
  if (!canSee('configuration')) return <AccessDenied />;

  const done = classSectionsDone(form);
  const doneKeys = doneSectionKeys(done);
  const meta = [
    cls?.level,
    cls?.room,
    cls?.academicYear?.label ? t('yearPrefix', { year: cls.academicYear.label }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ClassPageShell
      mode="edit"
      name={cls?.name ?? ''}
      color={form.values.color}
      meta={meta}
      done={doneKeys}
      ready={!!options && !!cls}
      counts={
        form.values.subjectIds.length > 0 && !done.subjects
          ? { subjects: form.values.subjectIds.length }
          : {}
      }
      actions={
        <>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => router.push('/configuration/classes')}
          >
            {t('cancel')}
          </Button>
          <Button
            className="w-fit"
            loading={form.submitting}
            disabled={!cls}
            onClick={() => void form.submit()}
          >
            <Save size={14} />
            {t('save')}
          </Button>
        </>
      }
    >
      {error || optionsError ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error ?? optionsError}
        </p>
      ) : !options || !cls ? (
        <div className={ASIDE_GRID}>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-72 rounded-lg" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-56 rounded-lg" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
        </div>
      ) : (
        <div className="pb-4">
          <ClassForm form={form} options={{ ...options, studentCount: cls.studentCount }} />
        </div>
      )}
    </ClassPageShell>
  );
}
