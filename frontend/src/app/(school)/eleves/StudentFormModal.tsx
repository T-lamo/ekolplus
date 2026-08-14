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
import type { ClassOption, GuardianData, StudentDetail } from './types';

const EMPTY_GUARDIAN: GuardianData = {
  name: '',
  relationship: 'Père',
  phone: '',
  email: '',
  profession: '',
  isPrimary: false,
};

export function StudentFormModal({
  student,
  classes,
  onClose,
  onSaved,
}: {
  student: StudentDetail | null;
  classes: ClassOption[];
  onClose: () => void;
  onSaved: (student: StudentDetail) => void;
}) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState(student?.firstName ?? '');
  const [lastName, setLastName] = useState(student?.lastName ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(student?.photoUrl ?? null);
  const [dateOfBirth, setDateOfBirth] = useState(student?.dateOfBirth?.slice(0, 10) ?? '');
  const [placeOfBirth, setPlaceOfBirth] = useState(student?.placeOfBirth ?? '');
  const [gender, setGender] = useState(student?.gender ?? '');
  const [nationality, setNationality] = useState(student?.nationality ?? '');
  const [address, setAddress] = useState(student?.address ?? '');
  const [classId, setClassId] = useState(student?.class?.id ?? classes[0]?.id ?? '');
  const [guardian1, setGuardian1] = useState<GuardianData>(
    student?.guardians[0] ?? { ...EMPTY_GUARDIAN, isPrimary: true },
  );
  const [showGuardian2, setShowGuardian2] = useState(!!student?.guardians[1]);
  const [guardian2, setGuardian2] = useState<GuardianData>(
    student?.guardians[1] ?? { ...EMPTY_GUARDIAN, relationship: 'Mère' },
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For an existing student, persist the photo the moment it's uploaded —
  // don't make it depend on the user remembering to click "Enregistrer" at
  // the bottom of an unrelated form (that's what caused photos to silently
  // vanish before this fix). A brand-new student has no id yet, so its
  // photo can only be saved as part of the initial create submit below.
  async function handlePhotoChange(url: string | null) {
    setPhotoUrl(url);
    if (!student) return;
    try {
      await api(`/api/school/students/${student.id}`, { method: 'PATCH', body: { photoUrl: url } });
      // Spread the server-confirmed `student` snapshot, not any in-progress
      // edits still sitting in this form's other fields — those aren't
      // saved yet and shouldn't leak into the list until the real submit.
      onSaved({ ...student, photoUrl: url });
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
      const guardians = [guardian1, ...(showGuardian2 ? [guardian2] : [])]
        .filter((g) => g.name.trim())
        .map((g) => ({
          name: g.name,
          relationship: g.relationship,
          phone: g.phone || null,
          email: g.email || null,
          profession: g.profession || null,
          isPrimary: g.isPrimary,
        }));

      const body = {
        firstName,
        lastName,
        photoUrl,
        dateOfBirth,
        placeOfBirth: placeOfBirth || null,
        gender: gender || null,
        nationality: nationality || null,
        address: address || null,
        classId,
        guardians,
      };

      const res = student
        ? await api<{ student: StudentDetail }>(`/api/school/students/${student.id}`, {
            method: 'PATCH',
            body,
          })
        : await api<{ student: StudentDetail }>('/api/school/students', { method: 'POST', body });

      onSaved({
        ...res.student,
        class: classes.find((c) => c.id === classId) ?? student?.class ?? null,
        homeroomTeacher: student?.homeroomTeacher ?? null,
      });
      toast(student ? 'Élève mis à jour.' : 'Élève ajouté.', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={student ? 'Modifier le profil' : 'Ajouter un élève'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3.5">
          <div className="text-xs font-bold text-muted-foreground uppercase">Identité</div>
          <div className="w-32">
            <ImageUploader
              label="Photo"
              hint="PNG, JPG ou WebP"
              value={photoUrl}
              onChange={(url) => void handlePhotoChange(url)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <Field
              label="Prénom"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Field
              label="Nom"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <Field
              label="Date de naissance"
              type="date"
              required
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
            <Field
              label="Lieu de naissance"
              value={placeOfBirth}
              onChange={(e) => setPlaceOfBirth(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <Select label="Genre" value={gender} onValueChange={setGender}>
              <SelectItem value="">—</SelectItem>
              <SelectItem value="Masculin">Masculin</SelectItem>
              <SelectItem value="Féminin">Féminin</SelectItem>
            </Select>
            <Field
              label="Nationalité"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
            />
          </div>
          <Field label="Adresse" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Select label="Classe" required value={classId} onValueChange={setClassId}>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-3.5 border-t border-border pt-4">
          <div className="text-xs font-bold text-muted-foreground uppercase">Tuteur légal 1</div>
          <GuardianFields value={guardian1} onChange={setGuardian1} />
        </div>

        {showGuardian2 ? (
          <div className="flex flex-col gap-3.5 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-muted-foreground uppercase">
                Tuteur légal 2
              </div>
              <button
                type="button"
                onClick={() => setShowGuardian2(false)}
                className="text-xs font-semibold text-destructive-foreground"
              >
                Retirer
              </button>
            </div>
            <GuardianFields value={guardian2} onChange={setGuardian2} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowGuardian2(true)}
            className="w-fit text-xs font-semibold text-primary"
          >
            + Ajouter un second tuteur
          </button>
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

function GuardianFields({
  value,
  onChange,
}: {
  value: GuardianData;
  onChange: (g: GuardianData) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3.5">
        <Field
          label="Nom complet"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
        <Select
          label="Lien de parenté"
          value={value.relationship}
          onValueChange={(v) => onChange({ ...value, relationship: v })}
        >
          <SelectItem value="Père">Père</SelectItem>
          <SelectItem value="Mère">Mère</SelectItem>
          <SelectItem value="Tuteur">Tuteur</SelectItem>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <PhoneInput
          label="Téléphone"
          value={value.phone ?? ''}
          onChange={(v) => onChange({ ...value, phone: v })}
        />
        <Field
          label="Email"
          type="email"
          value={value.email ?? ''}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
        />
      </div>
      <Field
        label="Profession"
        value={value.profession ?? ''}
        onChange={(e) => onChange({ ...value, profession: e.target.value })}
      />
    </>
  );
}
