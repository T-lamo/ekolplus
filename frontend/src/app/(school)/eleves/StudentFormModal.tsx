'use client';

// Wizard modal for creating/editing a student — extra-wide Modal, stepper
// fixed in the modal header, one step visible at a time, Précédent/Suivant
// navigation in the fixed footer. Strictly the same skeleton as the
// teacher wizard (TeacherFormModal) so the two forms stay coherent. The
// mockup's "Portail élève" / "Notifications parents" toggles stay deferred
// honestly; "Bénéficiaire d'une bourse" is a real column.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, Hash, School as SchoolIcon, SlidersHorizontal, User, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
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
import { studentStatusLabel } from './status-label';
import type { ClassOption, GuardianData, StudentDetail, StudentStatus } from './types';

const FORM_ID = 'student-wizard';

const STATUS_OPTIONS: { value: StudentStatus; dot: string }[] = [
  { value: 'ENROLLED', dot: 'bg-success-foreground' },
  { value: 'REPEATED_ABSENCES', dot: 'bg-warning-foreground' },
  { value: 'SUSPENDED', dot: 'bg-muted-foreground' },
];

// Free-text values stored and echoed back verbatim by the API (no enum in
// the schema) — kept French by design, same carve-out as Enseignants'
// Civilité/Genre/Type de contrat and Settings' SCHOOL_STATUTES.
const ENROLLMENT_TYPES = ['Nouvelle inscription', 'Réinscription', 'Transfert'];
const GENDERS = ['Féminin', 'Masculin'];
const RELATIONSHIPS = ['Père', 'Mère', 'Tuteur'];

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
  const t = useTranslations('Eleves.form');
  const tStatus = useTranslations('Eleves.status');
  const tCommon = useTranslations('Common');
  const isEdit = studentId !== null;

  const STEPS = [
    { id: 'identite', label: t('steps.identite') },
    { id: 'scolarite', label: t('steps.scolarite') },
    { id: 'tuteurs', label: t('steps.tuteurs') },
    { id: 'options', label: t('steps.options') },
  ];

  const STATUS_DESC: Record<StudentStatus, string> = {
    ENROLLED: t('statusOptions.ENROLLED.desc'),
    REPEATED_ABSENCES: t('statusOptions.REPEATED_ABSENCES.desc'),
    SUSPENDED: t('statusOptions.SUSPENDED.desc'),
  };

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

  function handleLoadError(err: unknown) {
    setLoadError(
      err instanceof ApiError ? t('loadErrorWithCode', { code: err.code }) : t('loadError'),
    );
    return true;
  }
  const { data: classesData } = useApi<{ classes: ClassOption[]; activeYearLabel: string | null }>(
    '/api/school/classes',
    { onError: handleLoadError },
  );
  const classes = classesData?.classes ?? [];
  const activeYearLabel = classesData?.activeYearLabel ?? null;

  const { data: studentData } = useApi<{ student: StudentDetail }>(
    `/api/school/students/${studentId}`,
    { skip: !studentId, onError: handleLoadError },
  );
  const student = studentData?.student ?? null;

  // This modal remounts fresh every time it's opened (the parent page only
  // renders it conditionally), so a plain "seed once per mount" ref is
  // enough — no risk of a background revalidation for a DIFFERENT student
  // clobbering the form the user is actively editing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!studentId) {
      if (classesData) {
        seededRef.current = true;
        setForm(emptyForm(classesData.classes[0]?.id ?? ''));
        setLoadError(null);
      }
    } else if (studentData) {
      seededRef.current = true;
      const s = studentData.student;
      setForm(toForm(s));
      if (s.guardians[0]) setGuardian1(s.guardians[0]);
      if (s.guardians[1]) {
        setGuardian2(s.guardians[1]);
        setShowGuardian2(true);
      }
      setLoadError(null);
    }
  }, [studentId, classesData, studentData]);

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
      toast(t('photoUpdated'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  function validateStep(index: number): string | null {
    if (!form) return null;
    if (
      index === 0 &&
      (form.firstName.trim() === '' || form.lastName.trim() === '' || form.dateOfBirth === '')
    ) {
      return t('nameAndDobRequired');
    }
    if (index === 1 && form.classId === '') return t('classRequired');
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
        toast(t('updated'), 'success');
      } else {
        await api('/api/school/students', { method: 'POST', body });
        toast(t('created'), 'success');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
      setSubmitting(false);
    }
  }

  const step = STEPS[stepIndex]!;

  return (
    <Modal
      title={isEdit ? t('editTitle') : t('addTitle')}
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
            submitLabel={isEdit ? t('submitEdit') : t('submitCreate')}
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
              title={t('identity.title')}
              subtitle={t('identity.subtitle')}
            >
              <div className="flex flex-col gap-3.5">
                <ImageUploader
                  label={t('identity.photoLabel')}
                  hint={t('identity.photoHint')}
                  value={form.photoUrl}
                  onChange={(url) => void handlePhotoChange(url)}
                />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label={t('identity.firstName')}
                    required
                    value={form.firstName}
                    onChange={(e) => patch({ firstName: e.target.value })}
                  />
                  <Field
                    label={t('identity.lastName')}
                    required
                    value={form.lastName}
                    onChange={(e) => patch({ lastName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <DateField
                    label={t('identity.dateOfBirth')}
                    required
                    value={form.dateOfBirth}
                    onChange={(v) => patch({ dateOfBirth: v })}
                  />
                  <Field
                    label={t('identity.placeOfBirth')}
                    value={form.placeOfBirth}
                    onChange={(e) => patch({ placeOfBirth: e.target.value })}
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold text-foreground">
                    {t('identity.gender')}
                  </div>
                  <div
                    className="flex flex-wrap gap-4"
                    role="radiogroup"
                    aria-label={t('identity.gender')}
                  >
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
                        {g || t('identity.genderUnspecified')}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label={t('identity.nationality')}
                    placeholder={t('identity.nationalityPlaceholder')}
                    value={form.nationality}
                    onChange={(e) => patch({ nationality: e.target.value })}
                  />
                  <Field
                    label={t('identity.motherTongue')}
                    placeholder={t('identity.motherTonguePlaceholder')}
                    value={form.motherTongue}
                    onChange={(e) => patch({ motherTongue: e.target.value })}
                  />
                </div>
                <Field
                  label={t('identity.address')}
                  placeholder={t('identity.addressPlaceholder')}
                  value={form.address}
                  onChange={(e) => patch({ address: e.target.value })}
                />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <PhoneInput
                    label={t('identity.phone')}
                    value={form.phone}
                    onChange={(v) => patch({ phone: v })}
                  />
                  <Field
                    label={t('identity.email')}
                    type="email"
                    placeholder={t('identity.emailPlaceholder')}
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
                title={t('schooling.title')}
                subtitle={t('schooling.subtitle')}
              >
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center justify-between rounded-md bg-secondary px-3 py-2">
                    <span className="flex items-center gap-1.5 text-2xs font-semibold text-primary">
                      <Hash size={12} />
                      {isEdit ? t('schooling.assignedNumber') : t('schooling.autoNumber')}
                    </span>
                    <span className="text-caption font-bold text-primary">
                      {student?.studentNumber ?? '#EL-…'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field
                      label={t('schooling.academicYear')}
                      value={activeYearLabel ?? t('schooling.academicYearFallback')}
                      readOnly
                      disabled
                    />
                    <Select
                      label={t('schooling.class')}
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
                      label={t('schooling.enrollmentType')}
                      value={form.enrollmentType}
                      onValueChange={(v) => patch({ enrollmentType: v })}
                    >
                      <SelectItem value="">—</SelectItem>
                      {ENROLLMENT_TYPES.map((et) => (
                        <SelectItem key={et} value={et}>
                          {et}
                        </SelectItem>
                      ))}
                    </Select>
                    <DateField
                      label={t('schooling.enrolledAt')}
                      value={form.enrolledAt}
                      onChange={(v) => patch({ enrolledAt: v })}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field
                      label={t('schooling.previousSchool')}
                      placeholder={t('schooling.previousSchoolPlaceholder')}
                      value={form.previousSchool}
                      onChange={(e) => patch({ previousSchool: e.target.value })}
                    />
                    <Field
                      label={t('schooling.transferNumber')}
                      placeholder={t('schooling.transferNumberPlaceholder')}
                      value={form.transferNumber}
                      onChange={(e) => patch({ transferNumber: e.target.value })}
                    />
                  </div>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-xs font-semibold text-foreground">
                      {t('schooling.notes')}
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
                title={t('statusSection.title')}
                subtitle={t('statusSection.subtitle')}
              >
                <div
                  className="grid grid-cols-1 gap-1.5 sm:grid-cols-3"
                  role="radiogroup"
                  aria-label={t('statusSection.title')}
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
                          {studentStatusLabel(opt.value, tStatus)}
                        </span>
                        <span className="block text-2xs text-muted-foreground">
                          {STATUS_DESC[opt.value]}
                        </span>
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
              title={t('guardians.title')}
              subtitle={t('guardians.subtitle')}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3.5">
                  <div className="text-xs font-bold text-muted-foreground uppercase">
                    {t('guardians.guardian1')}
                  </div>
                  <GuardianFields value={guardian1} onChange={setGuardian1} t={t} />
                </div>
                {showGuardian2 ? (
                  <div className="flex flex-col gap-3.5 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-muted-foreground uppercase">
                        {t('guardians.guardian2')}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowGuardian2(false)}
                        className="text-xs font-semibold text-destructive-foreground"
                      >
                        {t('guardians.remove')}
                      </button>
                    </div>
                    <GuardianFields value={guardian2} onChange={setGuardian2} t={t} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowGuardian2(true)}
                    className="w-fit text-xs font-semibold text-primary"
                  >
                    {t('guardians.addSecond')}
                  </button>
                )}
              </div>
            </FormSectionCard>
          )}

          {step.id === 'options' && (
            <FormSectionCard
              id="options"
              icon={<SlidersHorizontal size={15} />}
              title={t('options.title')}
              subtitle={t('options.subtitle')}
            >
              <div className="flex flex-col divide-y divide-border">
                <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                  <div>
                    <div className="text-caption font-medium text-foreground">
                      {t('options.scholarship')}
                    </div>
                    <div className="text-2xs text-muted-foreground">
                      {t('options.scholarshipDesc')}
                    </div>
                  </div>
                  <Switch
                    checked={form.scholarship}
                    onChange={(checked) => patch({ scholarship: checked })}
                    label={t('options.scholarship')}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
                  <div>
                    <div className="text-caption font-medium text-foreground">
                      {t('options.studentPortal')}
                    </div>
                    <div className="text-2xs text-muted-foreground">
                      {t('options.studentPortalDesc')}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-2xs font-semibold text-muted-foreground">
                    {t('options.comingSoon')}
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

type GuardianFieldsT = (
  key:
    | 'guardians.fullName'
    | 'guardians.relationship'
    | 'guardians.phone'
    | 'guardians.email'
    | 'guardians.profession',
) => string;

function GuardianFields({
  value,
  onChange,
  t,
}: {
  value: GuardianData;
  onChange: (g: GuardianData) => void;
  t: GuardianFieldsT;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field
          label={t('guardians.fullName')}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
        <Select
          label={t('guardians.relationship')}
          value={value.relationship}
          onValueChange={(v) => onChange({ ...value, relationship: v })}
        >
          {RELATIONSHIPS.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <PhoneInput
          label={t('guardians.phone')}
          value={value.phone ?? ''}
          onChange={(v) => onChange({ ...value, phone: v })}
        />
        <Field
          label={t('guardians.email')}
          type="email"
          value={value.email ?? ''}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
        />
      </div>
      <Field
        label={t('guardians.profession')}
        value={value.profession ?? ''}
        onChange={(e) => onChange({ ...value, profession: e.target.value })}
      />
    </>
  );
}
