'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EvaluationConfigForm } from './EvaluationConfigForm';
import type { ClassSubjectOption, EvaluationConfig, TermOption } from './types';

export function NewEvaluationModal({
  classSubjects,
  terms,
  defaultClassSubjectId,
  defaultTermId,
  onClose,
  onCreated,
}: {
  classSubjects: ClassSubjectOption[];
  terms: TermOption[];
  defaultClassSubjectId: string;
  defaultTermId: string;
  onClose: () => void;
  onCreated: (evaluationId: string) => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState<EvaluationConfig>({
    classSubjectId: defaultClassSubjectId,
    termId: defaultTermId,
    label: '',
    type: 'DS',
    maxScore: 20,
    coefficient: 1,
    countsTowardAverage: true,
    notes: null,
    date: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!value.label.trim() || !value.classSubjectId || !value.termId) {
      setError('Classe, matière, trimestre et intitulé sont requis.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ evaluation: { id: string } }>('/api/school/evaluations', {
        method: 'POST',
        body: value,
      });
      toast('Évaluation créée — saisis les notes.', 'success');
      onCreated(res.evaluation.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nouvelle évaluation" onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <EvaluationConfigForm
          value={value}
          onChange={setValue}
          classSubjects={classSubjects}
          terms={terms}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button onClick={onSubmit} loading={submitting}>
          {submitting ? 'Création…' : 'Créer et saisir les notes'}
        </Button>
      </div>
    </Modal>
  );
}
