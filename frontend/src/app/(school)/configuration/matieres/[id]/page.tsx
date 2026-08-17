'use client';

// /configuration/matieres/[id]?tab=info|programme|affectations — the
// "fiche matière": Banani « Add Matière » (edit variant), « Programme
// Annuel » and « Affectations Classes » behind one shared shell
// (add-matiere.md / programme-annuel.md / affectations-classes.md).
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
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

  const [subject, setSubject] = useState<SubjectDetail | null>(null);
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [teachers, setTeachers] = useState<TeacherOptionRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [yearLabel, setYearLabel] = useState<string | null>(null);
  const [chapterCount, setChapterCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const res = await api<{ subject: SubjectDetail }>(`/api/school/subjects/${params.id}`);
    setSubject(res.subject);
    setChapterCount((prev) => prev ?? res.subject.chapterCount);
  }, [params.id]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      loadDetail(),
      api<{ subjects: SubjectData[] }>('/api/school/subjects?includeDrafts=1'),
      api<{ teachers: TeacherOptionRow[] }>('/api/school/teachers'),
      api<{ classes: ClassRow[]; activeYearLabel: string | null }>('/api/school/classes'),
    ])
      .then(([, s, t, c]) => {
        setSubjects(s.subjects);
        setTeachers(t.teachers);
        setClasses(c.classes);
        setYearLabel(c.activeYearLabel);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Matière introuvable.'
            : 'Impossible de charger la matière.',
        );
      });
  }, [user, router, loadDetail]);

  // ── Informations générales (edit form) ─────────────────────────────
  const onSaved = useCallback(
    async (saved: { name: string }, intent: 'draft' | 'publish') => {
      toast(
        intent === 'draft' ? `Brouillon « ${saved.name} » enregistré.` : 'Matière mise à jour.',
        'success',
      );
      await loadDetail();
    },
    [loadDetail, toast],
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
        toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
        await loadDetail();
      }
    },
    [subject, loadDetail, toast],
  );

  const busy = form.submitting !== null;
  const headerActions = subject && (
    <>
      <SubjectStatusBadge status={subject.status} />
      {tab === 'info' && (
        <Button className="w-fit" loading={busy} onClick={() => form.submit('publish')}>
          <Check size={14} />
          Enregistrer
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
