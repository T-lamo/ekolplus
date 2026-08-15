'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TeacherPicker, type TeacherOption } from '@/components/school/TeacherPicker';
import type { ClassData } from './types';

export function ClassFormModal({
  cls,
  teachers,
  onClose,
  onSaved,
}: {
  cls: ClassData | null;
  teachers: TeacherOption[];
  onClose: () => void;
  onSaved: (cls: ClassData) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(cls?.name ?? '');
  const [level, setLevel] = useState(cls?.level ?? '');
  const [room, setRoom] = useState(cls?.room ?? '');
  const [capacity, setCapacity] = useState(cls?.capacity?.toString() ?? '');
  const [homeroomTeacherId, setHomeroomTeacherId] = useState<string | null>(
    cls?.homeroomTeacher?.id ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        name,
        level,
        room: room || null,
        capacity: capacity ? Number(capacity) : null,
        homeroomTeacherId,
      };
      const res = cls
        ? await api<{ class: ClassData }>(`/api/school/classes/${cls.id}`, {
            method: 'PATCH',
            body,
          })
        : await api<{ class: ClassData }>('/api/school/classes', { method: 'POST', body });
      onSaved({ ...res.class, subjectCount: cls?.subjectCount ?? 0 });
      toast(cls ? 'Classe mise à jour.' : 'Classe ajoutée.', 'success');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_ACADEMIC_YEAR') {
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={cls ? 'Modifier la classe' : 'Ajouter une classe'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <Field
            label="Nom de la classe"
            placeholder="3ème A"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            label="Niveau"
            placeholder="3ème"
            required
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <Field
            label="Salle"
            placeholder="Salle 12"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />
          <Field
            label="Capacité"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
        <TeacherPicker
          label="Professeur principal"
          teachers={teachers}
          value={homeroomTeacherId}
          onChange={setHomeroomTeacherId}
          allowCreate={false}
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
