'use client';

// Teacher twin of the school NewEvaluationModal: same reused
// EvaluationConfigForm, same Gradebook.newEvaluationModal strings, but the
// create goes to POST /api/teacher/evaluations (teacher-scoped).
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EvaluationConfigForm } from '@/app/(school)/pedagogie/carnet-de-notes/EvaluationConfigForm';
import type {
  ClassSubjectOption,
  EvaluationConfig,
  TermOption,
} from '@/app/(school)/pedagogie/carnet-de-notes/types';

export function TeacherNewEvaluationModal({
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
  const t = useTranslations('Gradebook.newEvaluationModal');
  const tCommon = useTranslations('Common');
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
      setError(t('validationError'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ evaluation: { id: string } }>('/api/teacher/evaluations', {
        method: 'POST',
        body: value,
      });
      toast(t('createdToast'), 'success');
      onCreated(res.evaluation.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
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
          {submitting ? t('submitting') : t('submitLabel')}
        </Button>
      </div>
    </Modal>
  );
}
