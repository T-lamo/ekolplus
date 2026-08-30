'use client';

// /configuration/matieres/[id]?tab=info|programme|affectations — the
// "fiche matière": Banani « Add Matière » (edit variant), « Programme
// Annuel » and « Affectations Classes » behind one shared shell
// (add-matiere.md / programme-annuel.md / affectations-classes.md).
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ASIDE_GRID } from '@/lib/layout';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  AffectationsTab,
  type TeacherOptionRow,
} from '@/components/school/subjects/AffectationsTab';
import { ProgrammeTab } from '@/components/school/subjects/ProgrammeTab';
import { SubjectForm, type SubjectFormOptions } from '@/components/school/subjects/SubjectForm';
import {
  SubjectPageShell,
  SubjectStatusBadge,
} from '@/components/school/subjects/SubjectPageShell';
import type { SubjectTab } from '@/components/school/subjects/SubjectTabsBar';
import { useSubjectForm } from '@/components/school/subjects/useSubjectForm';
import type { SubjectData, SubjectDetail } from '../types';

const TABS: SubjectTab[] = ['info', 'programme', 'affectations'];

interface ClassRow {
  id: string;
  name: string;
  level: string;
  studentCount: number;
}

export default function SubjectDetailPage() {
  // useSearchParams needs a Suspense boundary for static prerender (same
  // pattern as settings/page.tsx).
  return (
    <Suspense fallback={null}>
      <SubjectDetailContent />
    </Suspense>
  );
}

function SubjectDetailContent() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations('Configuration.matieres.detail');
  const tCommon = useTranslations('Common');

  const tabParam = search.get('tab');
  const tab: SubjectTab = TABS.includes(tabParam as SubjectTab) ? (tabParam as SubjectTab) : 'info';
  const setTab = useCallback(
    (next: SubjectTab) => {
      router.replace(
        `/configuration/matieres/${params.id}${next === 'info' ? '' : `?tab=${next}`}`,
        {
          scroll: false,
        },
      );
    },
    [router, params.id],
  );

  const [chapterCount, setChapterCount] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const { data: subjectData, refresh: loadDetail } = useApi<{ subject: SubjectDetail }>(
    `/api/school/subjects/${params.id}`,
    {
      skip: !user,
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return true;
        }
        setDetailError(
          err instanceof ApiError && err.status === 404 ? t('notFound') : t('loadError'),
        );
        return true;
      },
    },
  );
  const subject = subjectData?.subject ?? null;

  useEffect(() => {
    if (subject) setChapterCount((prev) => prev ?? subject.chapterCount);
  }, [subject]);

  const onNoSchool = (err: unknown) => {
    if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
      router.replace('/');
      return true;
    }
  };
  const { data: subjectsListData, error: subjectsListErr } = useApi<{ subjects: SubjectData[] }>(
    '/api/school/subjects?includeDrafts=1',
    { skip: !user, onError: onNoSchool },
  );
  const { data: teachersListData, error: teachersErr } = useApi<{ teachers: TeacherOptionRow[] }>(
    '/api/school/teachers',
    { skip: !user, onError: onNoSchool },
  );
  const { data: classesListData, error: classesErr } = useApi<{
    classes: ClassRow[];
    activeYearLabel: string | null;
  }>('/api/school/classes', { skip: !user, onError: onNoSchool });
  const subjects = subjectsListData?.subjects ?? [];
  const teachers = teachersListData?.teachers ?? [];
  const classes = classesListData?.classes ?? [];
  const yearLabel = classesListData?.activeYearLabel ?? null;
  const error =
    detailError ?? (subjectsListErr || teachersErr || classesErr ? t('loadError') : null);

  // ── Informations générales (edit form) ─────────────────────────────
  const onSaved = useCallback(
    async (saved: { name: string }, intent: 'draft' | 'publish') => {
      toast(intent === 'draft' ? t('draftSaved', { name: saved.name }) : t('updated'), 'success');
      await loadDetail();
    },
    [loadDetail, toast, t],
  );
  const existingCodes = useMemo(
    () => subjects.filter((s) => s.id !== params.id).map((s) => s.code),
    [subjects, params.id],
  );
  const schoolDomains = useMemo(
    () => [...new Set(subjects.map((s) => s.domain).filter((d): d is string => !!d))],
    [subjects],
  );
  const form = useSubjectForm({ subject, existingCodes, schoolDomains, onSaved });

  const options: SubjectFormOptions = useMemo(
    () => ({
      teachers,
      subjects: subjects
        .filter((s) => s.id !== params.id)
        .map((s) => ({ id: s.id, name: s.name, code: s.code })),
      classes: classes.map((c) => ({ id: c.id, name: c.name, studentCount: c.studentCount })),
      levels: [...new Set(classes.map((c) => c.level))],
      yearLabel,
    }),
    [teachers, subjects, classes, yearLabel, params.id],
  );

  // "Classes concernées" in edit mode writes the pivot live.
  const onToggleClass = useCallback(
    async (classId: string, checked: boolean) => {
      if (!subject) return;
      try {
        if (checked) {
          await api('/api/school/class-subjects', {
            method: 'POST',
            body: {
              classId,
              subjectId: subject.id,
              coefficient: subject.defaultCoefficient ?? null,
            },
          });
        } else {
          const row = subject.classSubjects.find((cs) => cs.classId === classId);
          if (row) await api(`/api/school/class-subjects/${row.id}`, { method: 'DELETE' });
        }
        await loadDetail();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
        await loadDetail();
      }
    },
    [subject, loadDetail, toast, tCommon],
  );

  const busy = form.submitting !== null;
  const headerActions = subject && (
    <>
      <SubjectStatusBadge status={subject.status} />
      {tab === 'info' && (
        <Button className="w-fit" loading={busy} onClick={() => form.submit('publish')}>
          <Check size={14} />
          {t('save')}
        </Button>
      )}
    </>
  );

  const counts = {
    programme: chapterCount ?? subject?.chapterCount ?? 0,
    affectations: subject?.classSubjects.length ?? 0,
  };

  return (
    <SubjectPageShell
      mode="edit"
      subject={subject}
      yearLabel={subject?.activeYear?.label ?? yearLabel}
      activeTab={tab}
      onTabChange={setTab}
      counts={counts}
      actions={headerActions}
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : !subject ? (
        <div className={ASIDE_GRID}>
          <div className="flex flex-col gap-3.5">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-72 rounded-lg" />
          </div>
          <Skeleton className="h-96 rounded-lg" />
        </div>
      ) : tab === 'programme' ? (
        <ProgrammeTab subject={subject} onChapterCountChange={setChapterCount} />
      ) : tab === 'affectations' ? (
        <AffectationsTab
          subject={subject}
          teachers={teachers}
          onChanged={loadDetail}
          onNavigateTab={setTab}
        />
      ) : (
        <div className="pb-4">
          <SubjectForm
            form={form}
            mode="edit"
            options={options}
            onGoToProgramme={() => setTab('programme')}
            onToggleClass={onToggleClass}
          />
        </div>
      )}
    </SubjectPageShell>
  );
}
