'use client';

// Wizard modal for creating/editing a teacher — extra-wide Modal, stepper
// fixed in the modal header, one step visible at a time, Précédent/Suivant
// navigation in the fixed footer. Strictly the same skeleton as the
// student wizard (StudentFormModal) so the two forms stay coherent.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Briefcase, Link as LinkIcon, Phone, Shield, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
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
import { teacherStatusLabel } from './status-label';
import type { TeacherDetail, TeacherStatus } from './types';

const FORM_ID = 'teacher-wizard';

const STATUS_OPTIONS: TeacherStatus[] = ['ACTIVE', 'ON_LEAVE', 'INACTIVE'];

// Civilité/Genre/Type de contrat are free-text values stored and echoed
// back verbatim by the API (no enum in the schema) — kept French by
// design, same carve-out as Settings' SCHOOL_STATUTES: translating the
// display label would desync it from what's actually stored and shown
// elsewhere (teacher profile, CSV export).
const CIVILITY_OPTIONS = ['M.', 'Mme'];
const GENDER_OPTIONS = ['Féminin', 'Masculin'];
const CONTRACT_TYPES = ['Temps plein', 'Temps partiel', 'Vacataire'];

interface FormState {
  photoUrl: string | null;
  civility: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  birthPlace: string;
  diploma: string;
  nif: string;
  niu: string;
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
  birthPlace: '',
  diploma: '',
  nif: '',
  niu: '',
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
    birthPlace: t.birthPlace ?? '',
    diploma: t.diploma ?? '',
    nif: t.nif ?? '',
    niu: t.niu ?? '',
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
  emptyLabel,
}: {
  items: { id: string; name: string }[];
  tone: 'primary' | 'info';
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
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
  const t = useTranslations('Enseignants.form');
  const tStatus = useTranslations('Enseignants.status');
  const tCommon = useTranslations('Common');
  const isEdit = teacherId !== null;

  const [form, setForm] = useState<FormState | null>(isEdit ? null : EMPTY_FORM);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  const STEPS = [
    { id: 'identite', label: t('steps.identite') },
    { id: 'coordonnees', label: t('steps.coordonnees') },
    { id: 'poste', label: t('steps.poste') },
  ];

  const { data: detailData } = useApi<{ teacher: TeacherDetail }>(
    `/api/school/teachers/${teacherId}`,
    {
      skip: !teacherId,
      onError: (err) => {
        setLoadError(
          err instanceof ApiError ? t('loadErrorWithCode', { code: err.code }) : t('loadError'),
        );
        return true;
      },
    },
  );
  const detail = detailData?.teacher ?? null;

  // This modal remounts fresh every time it's opened (the parent page only
  // renders it conditionally), so a plain "seed once per mount" ref is
  // enough — no risk of a background revalidation clobbering the form the
  // user is actively editing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !detail) return;
    seededRef.current = true;
    setForm(toForm(detail));
    setLoadError(null);
  }, [detail]);

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
      toast(t('photoUpdated'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  const fullName = form ? `${form.firstName.trim()} ${form.lastName.trim()}`.trim() : '';

  function validateStep(index: number): string | null {
    if (!form) return null;
    if (index === 0 && fullName.length < 2) return t('nameRequired');
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
      setError(t('invalidWeeklyHours'));
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
        birthPlace: form.birthPlace.trim() || null,
        diploma: form.diploma.trim() || null,
        nif: form.nif.trim() || null,
        niu: form.niu.trim() || null,
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
        toast(t('updated'), 'success');
      } else {
        await api('/api/school/teachers', { method: 'POST', body });
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
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[110px_1fr_1fr]">
                  <Select
                    label={t('identity.civility')}
                    value={form.civility}
                    onValueChange={(v) => patch({ civility: v })}
                  >
                    <SelectItem value="">—</SelectItem>
                    {CIVILITY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </Select>
                  <Field
                    label={t('identity.firstName')}
                    required
                    placeholder={t('identity.firstNamePlaceholder')}
                    value={form.firstName}
                    onChange={(e) => patch({ firstName: e.target.value })}
                  />
                  <Field
                    label={t('identity.lastName')}
                    required
                    placeholder={t('identity.lastNamePlaceholder')}
                    value={form.lastName}
                    onChange={(e) => patch({ lastName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <DateField
                    label={t('identity.dateOfBirth')}
                    value={form.dateOfBirth}
                    onChange={(v) => patch({ dateOfBirth: v })}
                  />
                  <Select
                    label={t('identity.gender')}
                    value={form.gender}
                    onValueChange={(v) => patch({ gender: v })}
                  >
                    <SelectItem value="">{t('identity.genderSelect')}</SelectItem>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label={t('identity.nationality')}
                    placeholder={t('identity.nationalityPlaceholder')}
                    value={form.nationality}
                    onChange={(e) => patch({ nationality: e.target.value })}
                  />
                  <Field
                    label={t('identity.birthPlace')}
                    placeholder={t('identity.birthPlacePlaceholder')}
                    value={form.birthPlace}
                    onChange={(e) => patch({ birthPlace: e.target.value })}
                  />
                </div>
                <Field
                  label={t('identity.diploma')}
                  placeholder={t('identity.diplomaPlaceholder')}
                  value={form.diploma}
                  onChange={(e) => patch({ diploma: e.target.value })}
                />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label={t('identity.nif')}
                    placeholder={t('identity.nifPlaceholder')}
                    value={form.nif}
                    onChange={(e) => patch({ nif: e.target.value })}
                  />
                  <Field
                    label={t('identity.niu')}
                    placeholder={t('identity.niuPlaceholder')}
                    value={form.niu}
                    onChange={(e) => patch({ niu: e.target.value })}
                  />
                </div>
              </div>
            </FormSectionCard>
          )}

          {step.id === 'coordonnees' && (
            <FormSectionCard
              id="coordonnees"
              icon={<Phone size={15} />}
              title={t('contact.title')}
              subtitle={t('contact.subtitle')}
            >
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label={t('contact.email')}
                    type="email"
                    placeholder={t('contact.emailPlaceholder')}
                    value={form.email}
                    onChange={(e) => patch({ email: e.target.value })}
                  />
                  <PhoneInput
                    label={t('contact.phone')}
                    value={form.phone}
                    onChange={(v) => patch({ phone: v })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <PhoneInput
                    label={t('contact.secondaryPhone')}
                    value={form.secondaryPhone}
                    onChange={(v) => patch({ secondaryPhone: v })}
                  />
                  <Field
                    label={t('contact.address')}
                    placeholder={t('contact.addressPlaceholder')}
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
                title={t('position.title')}
                subtitle={t('position.subtitle')}
              >
                <div className="flex flex-col gap-3.5">
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Select
                      label={t('position.status')}
                      value={form.status}
                      onValueChange={(v) => patch({ status: v as TeacherStatus })}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {teacherStatusLabel(s, tStatus)}
                        </SelectItem>
                      ))}
                    </Select>
                    <Select
                      label={t('position.contractType')}
                      value={form.contractType}
                      onValueChange={(v) => patch({ contractType: v })}
                    >
                      <SelectItem value="">—</SelectItem>
                      {CONTRACT_TYPES.map((ct) => (
                        <SelectItem key={ct} value={ct}>
                          {ct}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <DateField
                      label={t('position.hiredAt')}
                      value={form.hiredAt}
                      onChange={(v) => patch({ hiredAt: v })}
                    />
                    <Field
                      label={t('position.weeklyHoursTarget')}
                      inputMode="numeric"
                      placeholder={t('position.weeklyHoursPlaceholder')}
                      value={form.weeklyHoursTarget}
                      onChange={(e) => patch({ weeklyHoursTarget: e.target.value })}
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-foreground">
                      {t('position.subjectsTaught')}
                    </div>
                    <TagList
                      items={detail?.subjects ?? []}
                      tone="primary"
                      emptyLabel={t('noneYet')}
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-foreground">
                      {t('position.assignedClasses')}
                    </div>
                    <TagList items={detail?.classes ?? []} tone="info" emptyLabel={t('noneYet')} />
                    <p className="mt-1.5 flex items-center gap-1 text-2xs text-muted-foreground">
                      <LinkIcon size={11} />
                      {t.rich('position.configureHint', {
                        link: (chunks) => (
                          <Link
                            href="/configuration/matieres"
                            className="font-semibold text-primary"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
                    </p>
                  </div>
                </div>
              </FormSectionCard>

              {/* Accès plateforme — Espace Enseignant login shipped in Task 7;
                  the actual "Inviter à se connecter" action lives on the
                  teacher's fiche page (once the profile is saved), not in
                  this create/edit modal. */}
              <FormSectionCard
                id="acces"
                icon={<Shield size={15} />}
                title={t('access.title')}
                subtitle={t('access.subtitle')}
              >
                <div className="rounded-lg border border-border bg-background px-3.5 py-3">
                  <p className="text-caption text-muted-foreground">{t('access.body')}</p>
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
