'use client';

// Wizard modal for creating/editing a teacher — extra-wide Modal, stepper
// fixed in the modal header, one step visible at a time, Précédent/Suivant
// navigation in the fixed footer. Strictly the same skeleton as the
// student wizard (StudentFormModal) so the two forms stay coherent.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Briefcase, Link as LinkIcon, Phone, Shield, User } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Select, SelectItem } from '@/components/ui/Select';
import { DateField } from '@/components/ui/DateField';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Skeleton } from '@/components/ui/Skeleton';
import { FormStepsBar } from '@/components/school/FormStepsBar';
import { FormSectionCard } from '@/components/school/FormSectionCard';
import { WizardNav } from '@/components/school/WizardNav';
import type { TeacherDetail, TeacherStatus } from './types';

const FORM_ID = 'teacher-wizard';

const STEPS = [
  { id: 'identite', label: 'Identité & Photo' },
  { id: 'coordonnees', label: 'Coordonnées' },
  { id: 'poste', label: 'Poste & Matières' },
];

const STATUS_LABEL: Record<TeacherStatus, string> = {
  ACTIVE: 'Actif(ve)',
  ON_LEAVE: 'En congé',
  INACTIVE: 'Inactif(ve)',
};

const CONTRACT_TYPES = ['Temps plein', 'Temps partiel', 'Vacataire'];

interface FormState {
  photoUrl: string | null;
  civility: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  idNumber: string;
  email: string;
  phone: string;
  secondaryPhone: string;
  address: string;
  status: TeacherStatus;
  contractType: string;
  hiredAt: string;
  weeklyHoursTarget: string;
}

const EMPTY_FORM: FormState = {
  photoUrl: null,
  civility: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  nationality: '',
  idNumber: '',
  email: '',
  phone: '',
  secondaryPhone: '',
  address: '',
  status: 'ACTIVE',
  contractType: '',
  hiredAt: '',
  weeklyHoursTarget: '',
};

function toForm(t: TeacherDetail): FormState {
  // Legacy rows only have `name` — best-effort split at the first space.
  const spaceAt = t.name.indexOf(' ');
  return {
    photoUrl: t.photoUrl,
    civility: t.civility ?? '',
    firstName: t.firstName ?? (spaceAt > 0 ? t.name.slice(0, spaceAt) : t.name),
    lastName: t.lastName ?? (spaceAt > 0 ? t.name.slice(spaceAt + 1) : ''),
    dateOfBirth: t.dateOfBirth?.slice(0, 10) ?? '',
    gender: t.gender ?? '',
    nationality: t.nationality ?? '',
    idNumber: t.idNumber ?? '',
    email: t.email ?? '',
    phone: t.phone ?? '',
    secondaryPhone: t.secondaryPhone ?? '',
    address: t.address ?? '',
    status: t.status,
    contractType: t.contractType ?? '',
    hiredAt: t.hiredAt?.slice(0, 10) ?? '',
    weeklyHoursTarget: t.weeklyHoursTarget !== null ? String(t.weeklyHoursTarget) : '',
  };
}

function TagList({
  items,
  tone,
}: {
  items: { id: string; name: string }[];
  tone: 'primary' | 'info';
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucune pour l'instant.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span
          key={it.id}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            tone === 'primary' ? 'bg-secondary text-primary' : 'bg-info text-info-foreground'
          }`}
        >
          {it.name}
        </span>
      ))}
    </div>
  );
}

export function TeacherFormModal({
  teacherId,
  onClose,
  onSaved,
}: {
  teacherId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = teacherId !== null;

  const [detail, setDetail] = useState<TeacherDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(isEdit ? null : EMPTY_FORM);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!teacherId) return;
    let cancelled = false;
    api<{ teacher: TeacherDetail }>(`/api/school/teachers/${teacherId}`)
      .then(({ teacher }) => {
        if (cancelled) return;
        setDetail(teacher);
        setForm(toForm(teacher));
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError
              ? `Impossible de charger la fiche (${err.code}).`
              : 'Impossible de charger la fiche.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  function patch(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  // For an existing teacher, persist the photo the moment it's uploaded —
  // don't make it depend on the user remembering to click "Enregistrer". A
  // new teacher has no id yet — the photo goes with the create submit.
  async function handlePhotoChange(url: string | null) {
    patch({ photoUrl: url });
    if (!teacherId) return;
    try {
      await api(`/api/school/teachers/${teacherId}`, { method: 'PATCH', body: { photoUrl: url } });
      toast('Photo mise à jour.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  const fullName = form ? `${form.firstName.trim()} ${form.lastName.trim()}`.trim() : '';

  function validateStep(index: number): string | null {
    if (!form) return null;
    if (index === 0 && fullName.length < 2) return 'Le prénom et le nom sont requis.';
    return null;
  }

  function goTo(index: number) {
    setStepIndex(index);
    setMaxReached((m) => Math.max(m, index));
    setError(null);
    topRef.current?.scrollIntoView({ block: 'start' });
  }

  function goNext() {
    const problem = validateStep(stepIndex);
    if (problem) {
      setError(problem);
      return;
    }
    if (stepIndex < STEPS.length - 1) goTo(stepIndex + 1);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    // Enter in a field submits the form — advance instead on middle steps.
    if (stepIndex < STEPS.length - 1) {
      goNext();
      return;
    }
    for (let i = 0; i < STEPS.length; i++) {
      const problem = validateStep(i);
      if (problem) {
        setError(problem);
        goTo(i);
        return;
      }
    }
    const hours = form.weeklyHoursTarget.trim();
    const weeklyHoursTarget = hours === '' ? null : Number.parseInt(hours, 10);
    if (
      weeklyHoursTarget !== null &&
      (!Number.isInteger(weeklyHoursTarget) || weeklyHoursTarget < 0)
    ) {
      setError('Heures / semaine invalides.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        name: fullName,
        civility: form.civility || null,
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        nationality: form.nationality.trim() || null,
        idNumber: form.idNumber.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        secondaryPhone: form.secondaryPhone.trim() || null,
        address: form.address.trim() || null,
        status: form.status,
        contractType: form.contractType || null,
        hiredAt: form.hiredAt || null,
        weeklyHoursTarget,
        photoUrl: form.photoUrl,
      };
      if (teacherId) {
        await api(`/api/school/teachers/${teacherId}`, { method: 'PATCH', body });
        toast('Enseignant mis à jour.', 'success');
      } else {
        await api('/api/school/teachers', { method: 'POST', body });
        toast('Enseignant ajouté.', 'success');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
      setSubmitting(false);
    }
  }

  const step = STEPS[stepIndex]!;

  return (
    <Modal
      title={isEdit ? "Modifier l'enseignant" : 'Ajouter un enseignant'}
      onClose={onClose}
      xwide
      header={
        <FormStepsBar
          steps={STEPS}
          activeIndex={stepIndex}
          maxReachedIndex={maxReached}
          onStepSelect={goTo}
        />
      }
      footer={
        form ? (
          <WizardNav
            stepIndex={stepIndex}
            stepCount={STEPS.length}
            submitting={submitting}
            submitLabel={isEdit ? 'Enregistrer' : "Créer l'enseignant"}
            formId={FORM_ID}
            onCancel={onClose}
            onPrev={() => goTo(Math.max(0, stepIndex - 1))}
            onNext={goNext}
          />
        ) : undefined
      }
    >
      {loadError ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {loadError}
        </p>
      ) : !form ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
          <div ref={topRef} className="scroll-mt-6" />

          {step.id === 'identite' && (
            <FormSectionCard
              id="identite"
              icon={<User size={15} />}
              title="Identité & Photo"
              subtitle="Informations d'identification de l'enseignant"
            >
              <div className="flex flex-col gap-3.5">
                <ImageUploader
                  label="Photo de profil"
                  hint="PNG, JPG ou WebP — format carré recommandé"
                  value={form.photoUrl}
                  onChange={(url) => void handlePhotoChange(url)}
                />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[110px_1fr_1fr]">
                  <Select
                    label="Civilité"
                    value={form.civility}
                    onValueChange={(v) => patch({ civility: v })}
                  >
                    <SelectItem value="">—</SelectItem>
                    <SelectItem value="M.">M.</SelectItem>
                    <SelectItem value="Mme">Mme</SelectItem>
                  </Select>
                  <Field
                    label="Prénom"
                    required
                    placeholder="ex: Jean-Pierre"
                    value={form.firstName}
                    onChange={(e) => patch({ firstName: e.target.value })}
                  />
                  <Field
                    label="Nom de famille"
                    required
                    placeholder="ex: Dupont"
                    value={form.lastName}
                    onChange={(e) => patch({ lastName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <DateField
                    label="Date de naissance"
                    value={form.dateOfBirth}
                    onChange={(v) => patch({ dateOfBirth: v })}
                  />
                  <Select
                    label="Genre"
                    value={form.gender}
                    onValueChange={(v) => patch({ gender: v })}
                  >
                    <SelectItem value="">Sélectionner</SelectItem>
                    <SelectItem value="Féminin">Féminin</SelectItem>
                    <SelectItem value="Masculin">Masculin</SelectItem>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label="Nationalité"
                    placeholder="ex: Haïtienne"
                    value={form.nationality}
                    onChange={(e) => patch({ nationality: e.target.value })}
                  />
                  <Field
                    label="Numéro d'identification"
                    placeholder="ex: NIF-2024-0042"
                    value={form.idNumber}
                    onChange={(e) => patch({ idNumber: e.target.value })}
                  />
                </div>
              </div>
            </FormSectionCard>
          )}

          {step.id === 'coordonnees' && (
            <FormSectionCard
              id="coordonnees"
              icon={<Phone size={15} />}
              title="Coordonnées"
              subtitle="Informations de contact de l'enseignant"
            >
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label="Adresse e-mail"
                    type="email"
                    placeholder="prenom.nom@exemple.ht"
                    value={form.email}
                    onChange={(e) => patch({ email: e.target.value })}
                  />
                  <PhoneInput
                    label="Téléphone principal"
                    value={form.phone}
                    onChange={(v) => patch({ phone: v })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <PhoneInput
                    label="Téléphone secondaire"
                    value={form.secondaryPhone}
                    onChange={(v) => patch({ secondaryPhone: v })}
                  />
                  <Field
                    label="Adresse"
                    placeholder="Rue, ville"
                    value={form.address}
                    onChange={(e) => patch({ address: e.target.value })}
                  />
                </div>
              </div>
            </FormSectionCard>
          )}

          {step.id === 'poste' && (
            <>
              <FormSectionCard
                id="poste"
                icon={<Briefcase size={15} />}
                title="Poste & Matières enseignées"
                subtitle="Rôle, spécialité et classes assignées"
              >
                <div className="flex flex-col gap-3.5">
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Select
                      label="Statut"
                      value={form.status}
                      onValueChange={(v) => patch({ status: v as TeacherStatus })}
                    >
                      {(Object.keys(STATUS_LABEL) as TeacherStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </Select>
                    <Select
                      label="Type de contrat"
                      value={form.contractType}
                      onValueChange={(v) => patch({ contractType: v })}
                    >
                      <SelectItem value="">—</SelectItem>
                      {CONTRACT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <DateField
                      label="Date d'embauche"
                      value={form.hiredAt}
                      onChange={(v) => patch({ hiredAt: v })}
                    />
                    <Field
                      label="Heures / semaine (contrat)"
                      inputMode="numeric"
                      placeholder="ex: 18"
                      value={form.weeklyHoursTarget}
                      onChange={(e) => patch({ weeklyHoursTarget: e.target.value })}
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-foreground">
                      Matières enseignées
                    </div>
                    <TagList items={detail?.subjects ?? []} tone="primary" />
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-foreground">
                      Classes assignées
                    </div>
                    <TagList items={detail?.classes ?? []} tone="info" />
                    <p className="mt-1.5 flex items-center gap-1 text-2xs text-muted-foreground">
                      <LinkIcon size={11} />
                      Les matières et classes se configurent depuis la page{' '}
                      <Link
                        href="/configuration/affectations"
                        className="font-semibold text-primary"
                      >
                        Affectations
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </FormSectionCard>

              {/* Accès plateforme — deferred honestly (no teacher accounts yet). */}
              <FormSectionCard
                id="acces"
                icon={<Shield size={15} />}
                title="Accès à la plateforme"
                subtitle="Compte utilisateur et permissions"
              >
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3.5 py-3">
                  <p className="text-caption text-muted-foreground">
                    Les comptes de connexion pour les enseignants arrivent dans une prochaine
                    version.
                  </p>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-2xs font-semibold text-muted-foreground">
                    Bientôt disponible
                  </span>
                </div>
              </FormSectionCard>
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
