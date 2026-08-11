'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { GoalRow } from '../types';

const OVERALL_VALUE = '__overall__';

export function GoalModal({
  studentId,
  termId,
  subjects,
  goals,
  onClose,
  onSaved,
}: {
  studentId: string;
  termId: string;
  subjects: { subjectId: string; subjectName: string }[];
  goals: GoalRow[];
  onClose: () => void;
  onSaved: (goal: GoalRow) => void;
}) {
  const { toast } = useToast();
  const [subjectId, setSubjectId] = useState(OVERALL_VALUE);
  const [targetScore, setTargetScore] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubjectChange(value: string) {
    setSubjectId(value);
    const existing = goals.find((g) => (g.subjectId ?? OVERALL_VALUE) === value);
    setTargetScore(existing ? String(existing.targetScore) : '');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const score = Number(targetScore);
    if (!targetScore || Number.isNaN(score) || score < 0 || score > 20) {
      setError('Entre un objectif entre 0 et 20.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ goal: GoalRow }>(`/api/school/students/${studentId}/goals`, {
        method: 'PUT',
        body: {
          termId,
          subjectId: subjectId === OVERALL_VALUE ? null : subjectId,
          targetScore: score,
        },
      });
      onSaved(res.goal);
      toast('Objectif enregistré.', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Définir un objectif" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Select label="Matière" value={subjectId} onChange={(e) => onSubjectChange(e.target.value)}>
          <option value={OVERALL_VALUE}>Moyenne générale</option>
          {subjects.map((s) => (
            <option key={s.subjectId} value={s.subjectId}>
              {s.subjectName}
            </option>
          ))}
        </Select>
        <Field
          label="Objectif (/ 20)"
          type="number"
          min={0}
          max={20}
          step={0.1}
          value={targetScore}
          onChange={(e) => setTargetScore(e.target.value)}
          required
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting}>
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </Modal>
  );
}
