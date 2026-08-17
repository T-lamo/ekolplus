'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { Select, SelectItem } from '@/components/ui/Select';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export interface TeacherOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

// Inline teacher picker (pick-or-quick-create) for a foreign-key field —
// Epic 5's teachers-list screen owns full Teacher profile/CRUD, this only
// needs enough to populate a select without leaving the current form.
// See .planning/banani/epic-4-data-model.md.
export function TeacherPicker({
  label,
  teachers,
  value,
  onChange,
  onTeacherCreated,
  allowCreate = true,
}: {
  label: string;
  teachers: TeacherOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  onTeacherCreated?: (teacher: TeacherOption) => void;
  /** Set false to hide the inline "+ Nouvel enseignant" shortcut — teacher
   * creation then only happens through the dedicated Teachers screen. */
  allowCreate?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ teacher: TeacherOption }>('/api/school/teachers', {
        method: 'POST',
        body: { name },
      });
      onTeacherCreated?.(res.teacher);
      onChange(res.teacher.id);
      setCreating(false);
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  if (allowCreate && creating) {
    return (
      <form onSubmit={onCreate} className="flex flex-col gap-2 rounded-md border border-border p-3">
        <Field
          label="Nom du nouvel enseignant"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-xs text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" loading={submitting} size="sm">
            Ajouter
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Select label={label} value={value ?? ''} onValueChange={(v) => onChange(v || null)}>
        <SelectItem value="">— Aucun —</SelectItem>
        {teachers.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </Select>
      {allowCreate && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-fit text-xs font-semibold text-primary"
        >
          + Nouvel enseignant
        </button>
      )}
    </div>
  );
}
