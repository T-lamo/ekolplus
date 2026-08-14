'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Field } from '@/components/ui/Field';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Select, SelectItem } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ImageUploader } from '@/components/ui/ImageUploader';
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(teacher?.photoUrl ?? null);
  const [status, setStatus] = useState<TeacherStatus>(teacher?.status ?? 'ACTIVE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For an existing teacher, persist the photo the moment it's uploaded —
  // don't make it depend on the user remembering to click "Enregistrer" at
  // the bottom of an unrelated form (that's what caused photos to silently
  // vanish before this fix). A brand-new teacher has no id yet, so its
  // photo can only be saved as part of the initial create submit below.
  async function handlePhotoChange(url: string | null) {
    setPhotoUrl(url);
    if (!teacher) return;
    try {
      await api(`/api/school/teachers/${teacher.id}`, { method: 'PATCH', body: { photoUrl: url } });
      // Spread the server-confirmed `teacher` snapshot, not any in-progress
      // edits still sitting in this form's other fields — those aren't
      // saved yet and shouldn't leak into the list until the real submit.
      onSaved({ ...teacher, photoUrl: url });
      toast('Photo mise à jour.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = { name, email: email || null, phone: phone || null, photoUrl, status };
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
        <div className="w-32">
          <ImageUploader
            label="Photo"
            hint="PNG, JPG ou WebP"
            value={photoUrl}
            onChange={(url) => void handlePhotoChange(url)}
          />
        </div>
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
          <PhoneInput label="Téléphone" value={phone} onChange={setPhone} />
        </div>
        {teacher && (
          <Select
            label="Statut"
            value={status}
            onValueChange={(v) => setStatus(v as TeacherStatus)}
          >
            <SelectItem value="ACTIVE">Actif(ve)</SelectItem>
            <SelectItem value="ON_LEAVE">En congé</SelectItem>
            <SelectItem value="INACTIVE">Inactif(ve)</SelectItem>
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
