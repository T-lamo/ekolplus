'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { TeacherListItem, TeacherStatus } from './types';

export function TeacherFormModal({
  teacher,
  onClose,
  onSaved,
}: {
  teacher: TeacherListItem | null;
  onClose: () => void;
  onSaved: (teacher: TeacherListItem) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(teacher?.name ?? '');
  const [email, setEmail] = useState(teacher?.email ?? '');
  const [phone, setPhone] = useState(teacher?.phone ?? '');
  const [status, setStatus] = useState<TeacherStatus>(teacher?.status ?? 'ACTIVE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = { name, email: email || null, phone: phone || null, status };
      const res = teacher
        ? await api<{ teacher: TeacherListItem }>(`/api/school/teachers/${teacher.id}`, {
            method: 'PATCH',
            body,
          })
        : await api<{ teacher: TeacherListItem }>('/api/school/teachers', { method: 'POST', body });
      onSaved({
        ...res.teacher,
        subjects: teacher?.subjects ?? [],
        classes: teacher?.classes ?? [],
        weeklyHours: teacher?.weeklyHours ?? 0,
      });
      toast(teacher ? 'Enseignant mis à jour.' : 'Enseignant ajouté.', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={teacher ? "Modifier l'enseignant" : 'Ajouter un enseignant'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field
          label="Nom complet"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3.5">
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field label="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {teacher && (
          <Select
            label="Statut"
            value={status}
            onChange={(e) => setStatus(e.target.value as TeacherStatus)}
          >
            <option value="ACTIVE">Actif(ve)</option>
            <option value="ON_LEAVE">En congé</option>
            <option value="INACTIVE">Inactif(ve)</option>
          </Select>
        )}
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
