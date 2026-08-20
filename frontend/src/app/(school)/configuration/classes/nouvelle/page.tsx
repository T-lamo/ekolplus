'use client';

// /configuration/classes/nouvelle — Banani « Add Class » (add-class.md).
// Full-page create form in the shared class shell; on success the user lands
// on the new class's page (edit mode, « Navigation rapide » active).
import { useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Save } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ASIDE_GRID } from '@/lib/layout';
import { cn } from '@/lib/utils';
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
import type { ClassData } from '../types';

export default function NouvelleClassePage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('Configuration.classes.create');
  const { options, error, noSchool } = useClassFormData(!!user);

  useEffect(() => {
    if (noSchool) router.replace('/');
  }, [noSchool, router]);

  const onSaved = useCallback(
    (cls: ClassData) => {
      toast(t('created'), 'success');
      router.push(`/configuration/classes/${cls.id}`);
    },
    [router, toast, t],
  );

  const roomIds = useMemo(() => (options?.rooms ?? []).map((r) => r.id), [options?.rooms]);
  const form = useClassForm({
    cls: null,
    levelCatalog: options?.levelCatalog ?? [],
    roomIds,
    subjects: options?.subjects ?? [],
    onSaved,
  });

  const done = classSectionsDone(form);
  const doneKeys = doneSectionKeys(done);

  return (
    <ClassPageShell
      mode="create"
      name={form.values.name}
      color={form.values.color}
      meta={options?.yearLabel ? t('metaWithYear', { year: options.yearLabel }) : t('meta')}
      done={doneKeys}
      ready={!!options}
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
          <Button className="w-fit" loading={form.submitting} onClick={() => void form.submit()}>
            <Save size={14} />
            {t('save')}
          </Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : !options ? (
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
        <div className={cn('pb-4')}>
          <ClassForm form={form} options={{ ...options, studentCount: 0 }} />
        </div>
      )}
    </ClassPageShell>
  );
}
