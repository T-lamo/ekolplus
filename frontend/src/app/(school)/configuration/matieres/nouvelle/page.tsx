'use client';

// /configuration/matieres/nouvelle — Banani « Add Matière » (add-matiere.md).
// Full-page create form inside the shared subject shell; on success the user
// lands on the new subject's detail page (Informations tab, banner active).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ASIDE_GRID } from '@/lib/layout';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { SubjectPageShell } from '@/components/school/subjects/SubjectPageShell';
import { SubjectForm, type SubjectFormOptions } from '@/components/school/subjects/SubjectForm';
import { useSubjectForm } from '@/components/school/subjects/useSubjectForm';
import type { SubjectData } from '../types';

interface TeacherRow {
  id: string;
  name: string;
  photoUrl: string | null;
}
interface ClassRow {
  id: string;
  name: string;
  level: string;
  studentCount: number;
}

export default function NouvelleMatierePage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [subjects, setSubjects] = useState<SubjectData[] | null>(null);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [yearLabel, setYearLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ subjects: SubjectData[] }>('/api/school/subjects?includeDrafts=1'),
      api<{ teachers: TeacherRow[] }>('/api/school/teachers'),
      api<{ classes: ClassRow[]; activeYearLabel: string | null }>('/api/school/classes'),
    ])
      .then(([s, t, c]) => {
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
        setError('Impossible de charger les données du formulaire.');
      });
  }, [user, router]);

  const onSaved = useCallback(
    (subject: { id: string; name: string }, intent: 'draft' | 'publish') => {
      toast(
        intent === 'draft'
          ? `Brouillon « ${subject.name} » enregistré.`
          : `Matière « ${subject.name} » créée.`,
        'success',
      );
      router.push(`/configuration/matieres/${subject.id}`);
    },
    [router, toast],
  );

  const existingCodes = useMemo(() => (subjects ?? []).map((s) => s.code), [subjects]);
  const schoolDomains = useMemo(
    () => [...new Set((subjects ?? []).map((s) => s.domain).filter((d): d is string => !!d))],
    [subjects],
  );
  const form = useSubjectForm({ subject: null, existingCodes, schoolDomains, onSaved });

  const options: SubjectFormOptions = useMemo(
    () => ({
      teachers,
      subjects: (subjects ?? []).map((s) => ({ id: s.id, name: s.name, code: s.code })),
      classes: classes.map((c) => ({ id: c.id, name: c.name, studentCount: c.studentCount })),
      levels: [...new Set(classes.map((c) => c.level))],
      yearLabel,
    }),
    [teachers, subjects, classes, yearLabel],
  );

  const busy = form.submitting !== null;
  // Single set of actions, in the header — same default-size Buttons as the
  // rest of the app's page headers (no duplicated footer bar).
  const actions = (
    <>
      <Button
        variant="outline"
        className="w-fit"
        disabled={busy}
        onClick={() => form.submit('draft')}
      >
        Enregistrer comme brouillon
      </Button>
      <Button
        className="w-fit"
        loading={form.submitting === 'publish'}
        disabled={busy}
        onClick={() => form.submit('publish')}
      >
        <Plus size={14} />
        Créer la matière
      </Button>
    </>
  );

  return (
    <SubjectPageShell
      mode="create"
      yearLabel={yearLabel}
      activeTab="info"
      onTabChange={() => undefined}
      counts={{ programme: 0 }}
      actions={actions}
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : subjects === null ? (
        <div className={ASIDE_GRID}>
          <div className="flex flex-col gap-3.5">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-72 rounded-lg" />
          </div>
          <Skeleton className="h-96 rounded-lg" />
        </div>
      ) : (
        <div className="pb-4">
          <SubjectForm form={form} mode="create" options={options} />
        </div>
      )}
    </SubjectPageShell>
  );
}
