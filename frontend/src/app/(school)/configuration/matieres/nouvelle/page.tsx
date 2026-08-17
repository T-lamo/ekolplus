'use client';

// /configuration/matieres/nouvelle — Banani « Add Matière » (add-matiere.md).
// Full-page create form inside the shared subject shell; on success the user
// lands on the new subject's detail page (Informations tab, banner active).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Info, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { SubjectPageFooter, SubjectPageShell } from '@/components/school/subjects/SubjectPageShell';
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
  const actions = (
    <>
      <Badge tone="muted">Brouillon</Badge>
      <Button
        variant="outline"
        size="sm"
        className="w-auto text-caption"
        disabled={busy}
        onClick={() => form.submit('draft')}
      >
        Enregistrer comme brouillon
      </Button>
      <Button
        size="sm"
        className="w-auto text-caption"
        loading={form.submitting === 'publish'}
        disabled={busy}
        onClick={() => form.submit('publish')}
      >
        <Check size={14} />
        Créer la matière
      </Button>
    </>
  );

  const footer = (
    <SubjectPageFooter
      left={
        <>
          <Info size={14} />
          <span>
            Les champs marqués <span className="text-destructive-foreground">*</span> sont
            obligatoires
          </span>
        </>
      }
      right={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="w-auto text-caption"
            onClick={() => router.push('/configuration/matieres')}
          >
            Annuler
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-auto text-caption"
            disabled={busy}
            onClick={() => form.submit('draft')}
          >
            Enregistrer comme brouillon
          </Button>
          <Button
            size="sm"
            className="w-auto text-caption"
            loading={form.submitting === 'publish'}
            disabled={busy}
            onClick={() => form.submit('publish')}
          >
            <Plus size={14} />
            Créer la matière
          </Button>
        </>
      }
    />
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-3.5">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-72 rounded-lg" />
          </div>
          <Skeleton className="h-96 rounded-lg" />
        </div>
      ) : (
        <div className="pb-5">
          <SubjectForm form={form} mode="create" options={options} />
        </div>
      )}
      {footer}
    </SubjectPageShell>
  );
}
