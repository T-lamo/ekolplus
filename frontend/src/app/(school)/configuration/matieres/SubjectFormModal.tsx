'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { SubjectData } from './types';

export function SubjectFormModal({
  subject,
  onClose,
  onSaved,
}: {
  subject: SubjectData | null;
  onClose: () => void;
  onSaved: (subject: SubjectData) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(subject?.name ?? '');
  const [code, setCode] = useState(subject?.code ?? '');
  const [domain, setDomain] = useState(subject?.domain ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = { name, code: code || null, domain: domain || null };
      const res = subject
        ? await api<{ subject: SubjectData }>(`/api/school/subjects/${subject.id}`, {
            method: 'PATCH',
            body,
          })
        : await api<{ subject: SubjectData }>('/api/school/subjects', { method: 'POST', body });
      onSaved({
        ...res.subject,
        classes: subject?.classes ?? [],
        teacherNames: subject?.teacherNames ?? [],
      });
      toast(subject ? 'Matière mise à jour.' : 'Matière ajoutée.', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={subject ? 'Modifier la matière' : 'Ajouter une matière'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field
          label="Nom de la matière"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3.5">
          <Field
            label="Code"
            placeholder="MAT-001"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Field
            label="Domaine"
            placeholder="Sciences"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
        </div>
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
