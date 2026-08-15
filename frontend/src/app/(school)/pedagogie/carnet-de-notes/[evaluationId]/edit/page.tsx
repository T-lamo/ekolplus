'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, AlertTriangle, Save, Check, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EvaluationConfigForm } from '../../EvaluationConfigForm';
import type { ClassSubjectOption, EvaluationConfig, TermOption } from '../../types';

export default function EditEvaluationPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams<{ evaluationId: string }>();
  const [value, setValue] = useState<EvaluationConfig | null>(null);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{
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
      }>(`/api/school/evaluations/${params.evaluationId}`),
      api<{ classSubjects: ClassSubjectOption[] }>('/api/school/class-subjects'),
      api<{ academicYear: { terms: TermOption[] } | null }>('/api/school'),
    ])
      .then(([ev, cs, school]) => {
        setValue({
          id: ev.evaluation.id,
          classSubjectId: ev.evaluation.classSubjectId,
          termId: ev.evaluation.termId,
          label: ev.evaluation.label,
          type: ev.evaluation.type,
          maxScore: ev.evaluation.maxScore,
          coefficient: ev.evaluation.coefficient,
          countsTowardAverage: ev.evaluation.countsTowardAverage,
          notes: ev.evaluation.notes,
          date: ev.evaluation.date ? ev.evaluation.date.slice(0, 10) : null,
        });
        setClassSubjects(cs.classSubjects);
        setTerms(school.academicYear?.terms ?? []);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Évaluation introuvable.'
            : 'Impossible de charger.',
        );
      });
  }, [user, params.evaluationId]);

  async function onSave() {
    if (!value) return;
    setSaving(true);
    setError(null);
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
      toast('Évaluation mise à jour.', 'success');
      router.push(`/pedagogie/carnet-de-notes/${value.id}/saisie`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!value) return;
    if (
      !confirm(
        'Supprimer cette évaluation et toutes les notes associées ? Cette action est irréversible.',
      )
    )
      return;
    setDeleting(true);
    try {
      await api(`/api/school/evaluations/${value.id}`, { method: 'DELETE' });
      toast('Évaluation supprimée.', 'success');
      router.push('/pedagogie/carnet-de-notes');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
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
          Retour
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
            Retour à la saisie
          </Link>
          <h1 className="text-lg font-bold text-foreground">
            Modifier les paramètres de l&apos;évaluation
          </h1>
          <p className="text-sm text-muted-foreground">Les notes déjà saisies seront conservées.</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="flex w-fit items-center gap-1.5 rounded-md bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
        >
          <Trash2 size={14} />
          Supprimer l&apos;évaluation
        </button>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border-l-[3px] border-warning-foreground bg-warning px-4 py-3">
        <AlertTriangle size={16} className="shrink-0 text-warning-foreground" />
        <div>
          <div className="text-caption font-semibold text-warning-foreground">
            Modification d&apos;une évaluation existante
          </div>
          <div className="text-xs text-warning-foreground/90">
            Changer la classe, la matière ou le barème peut affecter les notes déjà saisies.
          </div>
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

      <Card className="flex-row items-center justify-between p-3.5">
        <span className="text-caption text-muted-foreground">
          Des modifications non enregistrées peuvent exister.
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="w-fit" onClick={() => router.back()}>
            Annuler
          </Button>
          <Button className="w-fit" onClick={onSave} loading={saving}>
            {saving ? (
              <>
                <Save size={14} />
                Enregistrement…
              </>
            ) : (
              <>
                <Check size={14} />
                Confirmer les modifications
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
