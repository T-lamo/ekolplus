'use client';

// Wizard modal for creating/editing a student — extra-wide Modal, stepper
// fixed in the modal header, one step visible at a time, Précédent/Suivant
// navigation in the fixed footer. Strictly the same skeleton as the
// teacher wizard (TeacherFormModal) so the two forms stay coherent. The
// mockup's "Portail élève" / "Notifications parents" toggles stay deferred
// honestly; "Bénéficiaire d'une bourse" is a real column.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, Hash, School as SchoolIcon, SlidersHorizontal, User, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Select, SelectItem } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Skeleton } from '@/components/ui/Skeleton';
import { FormStepsBar } from '@/components/school/FormStepsBar';
import { FormSectionCard } from '@/components/school/FormSectionCard';
import { WizardNav } from '@/components/school/WizardNav';
import type { ClassOption, GuardianData, StudentDetail, StudentStatus } from './types';

const FORM_ID = 'student-wizard';

const STEPS = [
  { id: 'identite', label: 'Identité' },
  { id: 'scolarite', label: 'Scolarité' },
  { id: 'tuteurs', label: 'Parents & Tuteurs' },
  { id: 'options', label: 'Options' },
];

const STATUS_OPTIONS: { value: StudentStatus; label: string; desc: string; dot: string }[] = [
  {
    value: 'ENROLLED',
    label: 'Inscrit(e)',
    desc: 'Élève actif dans le système',
    dot: 'bg-success-foreground',
  },
  {
    value: 'REPEATED_ABSENCES',
    label: 'Absences répétées',
    desc: 'Assiduité à surveiller',
    dot: 'bg-warning-foreground',
  },
  {
    value: 'SUSPENDED',
    label: 'Suspendu(e)',
    desc: 'Accès temporairement restreint',
    dot: 'bg-muted-foreground',
  },
];

const ENROLLMENT_TYPES = ['Nouvelle inscription', 'Réinscription', 'Transfert'];
const GENDERS = ['Féminin', 'Masculin'];

const EMPTY_GUARDIAN: GuardianData = {
  name: '',
  relationship: 'Père',
  phone: '',
  email: '',
  profession: '',
  isPrimary: false,
};

interface FormState {
  photoUrl: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  gender: string;
  nationality: string;
  motherTongue: string;
  address: string;
  phone: string;
  email: string;
  classId: string;
  enrollmentType: string;
  enrolledAt: string;
  previousSchool: string;
  transferNumber: string;
  notes: string;
  scholarship: boolean;
  status: StudentStatus;
}

function emptyForm(defaultClassId: string): FormState {
  return {
    photoUrl: null,
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    placeOfBirth: '',
    gender: '',
    nationality: '',
    motherTongue: '',
    address: '',
    phone: '',
    email: '',
    classId: defaultClassId,
    enrollmentType: '',
    enrolledAt: new Date().toISOString().slice(0, 10),
    previousSchool: '',
    transferNumber: '',
    notes: '',
    scholarship: false,
    status: 'ENROLLED',
  };
}

function toForm(s: StudentDetail): FormState {
  return {
    photoUrl: s.photoUrl,
    firstName: s.firstName,
    lastName: s.lastName,
    dateOfBirth: s.dateOfBirth.slice(0, 10),
    placeOfBirth: s.placeOfBirth ?? '',
    gender: s.gender ?? '',
    nationality: s.nationality ?? '',
    motherTongue: s.motherTongue ?? '',
    address: s.address ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    classId: s.class?.id ?? '',
    enrollmentType: s.enrollmentType ?? '',
    enrolledAt: s.enrolledAt.slice(0, 10),
    previousSchool: s.previousSchool ?? '',
    transferNumber: s.transferNumber ?? '',
    notes: s.notes ?? '',
    scholarship: s.scholarship,
    status: s.status,
  };
}

export function StudentFormModal({
  studentId,
  onClose,
  onSaved,
}: {
  studentId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = studentId !== null;

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [activeYearLabel, setActiveYearLabel] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [guardian1, setGuardian1] = useState<GuardianData>({ ...EMPTY_GUARDIAN, isPrimary: true });
  const [showGuardian2, setShowGuardian2] = useState(false);
  const [guardian2, setGuardian2] = useState<GuardianData>({
    ...EMPTY_GUARDIAN,
    relationship: 'Mère',
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const loads: Promise<void>[] = [
      api<{ classes: ClassOption[]; activeYearLabel: string | null }>('/api/school/classes').then(
        (c) => {
          if (cancelled) return;
          setClasses(c.classes);
          setActiveYearLabel(c.activeYearLabel);
          if (!studentId) setForm((f) => f ?? emptyForm(c.classes[0]?.id ?? ''));
        },
      ),
    ];
    if (studentId) {
      loads.push(
        api<{ student: StudentDetail }>(`/api/school/students/${studentId}`).then(
          ({ student: s }) => {
            if (cancelled) return;
            setStudent(s);
            setForm(toForm(s));
            if (s.guardians[0]) setGuardian1(s.guardians[0]);
            if (s.guardians[1]) {
              setGuardian2(s.guardians[1]);
              setShowGuardian2(true);
            }
          },
        ),
      );
    }
    Promise.all(loads).catch((err) => {
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
  }, [studentId]);

  function patch(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  // For an existing student, persist the photo the moment it's uploaded —
  // don't make it depend on the user remembering to click "Enregistrer". A
  // new student has no id yet — the photo goes with the create submit.
  async function handlePhotoChange(url: string | null) {
    patch({ photoUrl: url });
    if (!studentId) return;
    try {
      await api(`/api/school/students/${studentId}`, { method: 'PATCH', body: { photoUrl: url } });
      toast('Photo mise à jour.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  function validateStep(index: number): string | null {
    if (!form) return null;
    if (
      index === 0 &&
      (form.firstName.trim() === '' || form.lastName.trim() === '' || form.dateOfBirth === '')
    ) {
      return 'Prénom, nom et date de naissance sont requis.';
    }
    if (index === 1 && form.classId === '') return 'La classe est requise.';
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
        firstName: form.firstName,
        lastName: form.lastName,
        photoUrl: form.photoUrl,
        dateOfBirth: form.dateOfBirth,
        placeOfBirth: form.placeOfBirth.trim() || null,
        gender: form.gender || null,
        nationality: form.nationality.trim() || null,
        motherTongue: form.motherTongue.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        classId: form.classId,
        enrollmentType: form.enrollmentType || null,
        enrolledAt: form.enrolledAt,
        previousSchool: form.previousSchool.trim() || null,
        transferNumber: form.transferNumber.trim() || null,
        notes: form.notes.trim() || null,
        scholarship: form.scholarship,
        status: form.status,
        guardians,
      };

      if (studentId) {
        await api(`/api/school/students/${studentId}`, { method: 'PATCH', body });
        toast('Élève mis à jour.', 'success');
      } else {
        await api('/api/school/students', { method: 'POST', body });
        toast('Élève ajouté.', 'success');
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
      title={isEdit ? 'Modifier le profil' : 'Ajouter un élève'}
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
            submitLabel={isEdit ? 'Enregistrer' : "Créer l'élève"}
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
              title="Informations personnelles"
              subtitle="Identité et coordonnées de l'élève"
            >
              <div className="flex flex-col gap-3.5">
                <ImageUploader
                  label="Photo de l'élève"
                  hint="JPG, PNG ou WebP — max 10 Mo"
                  value={form.photoUrl}
                  onChange={(url) => void handlePhotoChange(url)}
                />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label="Prénom"
                    required
                    value={form.firstName}
                    onChange={(e) => patch({ firstName: e.target.value })}
                  />
                  <Field
                    label="Nom de famille"
                    required
                    value={form.lastName}
                    onChange={(e) => patch({ lastName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <DateField
                    label="Date de naissance"
                    required
                    value={form.dateOfBirth}
                    onChange={(v) => patch({ dateOfBirth: v })}
                  />
                  <Field
                    label="Lieu de naissance"
                    value={form.placeOfBirth}
                    onChange={(e) => patch({ placeOfBirth: e.target.value })}
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold text-foreground">Genre</div>
                  <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="Genre">
                    {[...GENDERS, ''].map((g) => (
                      <label
                        key={g || 'none'}
                        className="flex cursor-pointer items-center gap-2 text-caption text-foreground"
                      >
                        <input
                          type="radio"
                          name="gender"
                          checked={form.gender === g}
                          onChange={() => patch({ gender: g })}
                          className="h-4 w-4 accent-primary"
                        />
                        {g || 'Non précisé'}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label="Nationalité"
                    placeholder="ex: Haïtienne"
                    value={form.nationality}
                    onChange={(e) => patch({ nationality: e.target.value })}
                  />
                  <Field
                    label="Langue maternelle"
                    placeholder="ex: Créole haïtien"
                    value={form.motherTongue}
                    onChange={(e) => patch({ motherTongue: e.target.value })}
                  />
                </div>
                <Field
                  label="Adresse"
                  placeholder="Rue, quartier, ville..."
                  value={form.address}
                  onChange={(e) => patch({ address: e.target.value })}
                />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <PhoneInput
                    label="Téléphone (élève)"
                    value={form.phone}
                    onChange={(v) => patch({ phone: v })}
                  />
                  <Field
                    label="Adresse e-mail"
                    type="email"
                    placeholder="exemple@email.com"
                    value={form.email}
                    onChange={(e) => patch({ email: e.target.value })}
                  />
                </div>
              </div>
            </FormSectionCard>
          )}

          {step.id === 'scolarite' && (
            <>
              <FormSectionCard
                id="scolarite"
                icon={<SchoolIcon size={15} />}
                title="Informations scolaires"
                subtitle="Classe, inscription et parcours"
              >
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center justify-between rounded-md bg-secondary px-3 py-2">
                    <span className="flex items-center gap-1.5 text-2xs font-semibold text-primary">
                      <Hash size={12} />
                      {isEdit ? 'Matricule attribué' : 'Matricule auto-généré'}
                    </span>
                    <span className="text-caption font-bold text-primary">
                      {student?.studentNumber ?? '#EL-…'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field
                      label="Année scolaire"
                      value={activeYearLabel ?? 'Année active'}
                      readOnly
                      disabled
                    />
                    <Select
                      label="Classe"
                      required
                      value={form.classId}
                      onValueChange={(v) => patch({ classId: v })}
                    >
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Select
                      label="Type d'inscription"
                      value={form.enrollmentType}
                      onValueChange={(v) => patch({ enrollmentType: v })}
                    >
                      <SelectItem value="">—</SelectItem>
                      {ENROLLMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </Select>
                    <DateField
                      label="Date d'inscription"
                      value={form.enrolledAt}
                      onChange={(v) => patch({ enrolledAt: v })}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field
                      label="École précédente"
                      placeholder="Nom de l'école précédente..."
                      value={form.previousSchool}
                      onChange={(e) => patch({ previousSchool: e.target.value })}
                    />
                    <Field
                      label="Numéro de transfert"
                      placeholder="Optionnel"
                      value={form.transferNumber}
                      onChange={(e) => patch({ transferNumber: e.target.value })}
                    />
                  </div>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-xs font-semibold text-foreground">
                      Observations / Notes internes
                    </span>
                    <textarea
                      value={form.notes}
                      onChange={(e) => patch({ notes: e.target.value })}
                      rows={3}
                      maxLength={1000}
                      className="rounded-md border border-border bg-input px-3 py-2 text-caption text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/10"
                    />
                  </label>
                </div>
              </FormSectionCard>

              <FormSectionCard
                id="statut"
                icon={<Activity size={15} />}
                title="Statut d'inscription"
                subtitle="État actuel de l'élève dans le système"
              >
                <div
                  className="grid grid-cols-1 gap-1.5 sm:grid-cols-3"
                  role="radiogroup"
                  aria-label="Statut d'inscription"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={form.status === opt.value}
                      onClick={() => patch({ status: opt.value })}
                      className={`flex items-center gap-2.5 rounded-md border-[1.5px] px-2.5 py-2 text-left ${
                        form.status === opt.value
                          ? 'border-primary bg-secondary'
                          : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${opt.dot}`} />
                      <span>
                        <span className="block text-xs font-semibold text-foreground">
                          {opt.label}
                        </span>
                        <span className="block text-2xs text-muted-foreground">{opt.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </FormSectionCard>
            </>
          )}

          {step.id === 'tuteurs' && (
            <FormSectionCard
              id="tuteurs"
              icon={<Users size={15} />}
              title="Parents & Tuteurs"
              subtitle="Contacts responsables de l'élève"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3.5">
                  <div className="text-xs font-bold text-muted-foreground uppercase">
                    Tuteur légal 1
                  </div>
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
              </div>
            </FormSectionCard>
          )}

          {step.id === 'options' && (
            <FormSectionCard
              id="options"
              icon={<SlidersHorizontal size={15} />}
              title="Options & Accès"
              subtitle="Bourse et accès en ligne"
            >
              <div className="flex flex-col divide-y divide-border">
                <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                  <div>
                    <div className="text-caption font-medium text-foreground">
                      Bénéficiaire d'une bourse
                    </div>
                    <div className="text-2xs text-muted-foreground">
                      Marquer cet élève comme boursier
                    </div>
                  </div>
                  <Switch
                    checked={form.scholarship}
                    onChange={(checked) => patch({ scholarship: checked })}
                    label="Bénéficiaire d'une bourse"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
                  <div>
                    <div className="text-caption font-medium text-foreground">
                      Portail élève & notifications aux parents
                    </div>
                    <div className="text-2xs text-muted-foreground">
                      Consultation des notes en ligne et alertes aux contacts renseignés
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-2xs font-semibold text-muted-foreground">
                    Bientôt disponible
                  </span>
                </div>
              </div>
            </FormSectionCard>
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

function GuardianFields({
  value,
  onChange,
}: {
  value: GuardianData;
  onChange: (g: GuardianData) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
