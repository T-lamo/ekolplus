'use client';

// Add/Edit Student — Banani OJ7XJIOjHxiM, plan .planning/banani/add-student.md.
// Full-page form replacing the old StudentFormModal (user decision: the
// Banani design is the complete one). Left sticky column = photo, matricule
// (auto-generated server-side), real status radio-cards; right = Identité /
// Scolarité / Parents & Tuteurs / Options. The mockup's "Portail élève" and
// "Notifications parents" toggles are deferred honestly (no portal yet);
// "Bénéficiaire d'une bourse" is a real column.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Check,
  Hash,
  School as SchoolIcon,
  SlidersHorizontal,
  User,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Select, SelectItem } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Skeleton } from '@/components/ui/Skeleton';
import { FormStepsBar } from '@/components/school/FormStepsBar';
import { FormSectionCard } from '@/components/school/FormSectionCard';
import type { ClassOption, GuardianData, StudentDetail, StudentStatus } from './types';

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

export function StudentFormPage({ studentId }: { studentId: string | null }) {
  const router = useRouter();
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
  const [activeStep, setActiveStep] = useState('identite');

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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveStep(visible[0]!.target.id);
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    for (const step of STEPS) {
      const el = document.getElementById(step.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [form === null]);

  function patch(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  // For an existing student, persist the photo the moment it's uploaded —
  // don't make it depend on the user remembering to click "Enregistrer"
  // (that's what caused photos to silently vanish before this fix). A new
  // student has no id yet — the photo goes with the create submit.
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

  const canSubmit = useMemo(
    () =>
      form !== null &&
      form.firstName.trim() !== '' &&
      form.lastName.trim() !== '' &&
      form.dateOfBirth !== '' &&
      form.classId !== '',
    [form],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!canSubmit) {
      setError('Prénom, nom, date de naissance et classe sont requis.');
      return;
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
        router.push(`/eleves/${studentId}`);
      } else {
        await api('/api/school/students', { method: 'POST', body });
        toast('Élève ajouté.', 'success');
        router.push('/eleves');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Link href="/eleves" className="text-sm font-medium text-primary">
          Retour aux élèves
        </Link>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const actions = (
    <>
      <Button type="button" variant="outline" className="w-fit" onClick={() => router.back()}>
        Annuler
      </Button>
      <Button type="submit" loading={submitting} className="w-fit">
        <Check size={14} />
        {submitting ? 'Enregistrement…' : "Enregistrer l'élève"}
      </Button>
    </>
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/eleves"
            aria-label="Retour aux élèves"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={15} />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              {isEdit ? 'Modifier le profil' : 'Ajouter un élève'}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isEdit
                ? "Mettez à jour les informations de l'élève"
                : "Renseignez les informations du nouvel élève pour l'inscrire dans le système."}
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">{actions}</div>
      </div>

      <FormStepsBar steps={STEPS} activeId={activeStep} />

      <div className="grid items-start gap-4 lg:grid-cols-[260px_1fr]">
        {/* LEFT — sticky photo / matricule / status */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-20">
          <Card className="p-4">
            <ImageUploader
              label="Photo de l'élève"
              hint="JPG, PNG ou WebP — max 10 Mo"
              value={form.photoUrl}
              onChange={(url) => void handlePhotoChange(url)}
            />
          </Card>

          <Card className="p-4">
            <div className="mb-2.5 flex items-center gap-2 text-[13px] font-bold text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-primary">
                <Hash size={12} />
              </span>
              Matricule
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary px-3 py-2">
              <span className="text-[11px] font-semibold text-primary">
                {isEdit ? 'Numéro attribué' : 'Numéro auto-généré'}
              </span>
              <span className="text-[13px] font-bold text-primary">
                {student?.studentNumber ?? '#EL-…'}
              </span>
            </div>
            {!isEdit && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Le matricule est attribué automatiquement à l'enregistrement.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-2.5 flex items-center gap-2 text-[13px] font-bold text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-primary">
                <Activity size={12} />
              </span>
              Statut d'inscription
            </div>
            <div
              className="flex flex-col gap-1.5"
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
                    <span className="block text-xs font-semibold text-foreground">{opt.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{opt.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT — form sections */}
        <div className="flex min-w-0 flex-col gap-4">
          <FormSectionCard
            id="identite"
            icon={<User size={15} />}
            title="Informations personnelles"
            subtitle="Identité et coordonnées de l'élève"
          >
            <div className="flex flex-col gap-3.5">
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
                      className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground"
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

          <FormSectionCard
            id="scolarite"
            icon={<SchoolIcon size={15} />}
            title="Informations scolaires"
            subtitle="Classe, inscription et parcours"
          >
            <div className="flex flex-col gap-3.5">
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
                  className="rounded-md border border-border bg-input px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/10"
                />
              </label>
            </div>
          </FormSectionCard>

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

          <FormSectionCard
            id="options"
            icon={<SlidersHorizontal size={15} />}
            title="Options & Accès"
            subtitle="Bourse et accès en ligne"
          >
            <div className="flex flex-col divide-y divide-border">
              <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                <div>
                  <div className="text-[13px] font-medium text-foreground">
                    Bénéficiaire d'une bourse
                  </div>
                  <div className="text-[11px] text-muted-foreground">
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
                  <div className="text-[13px] font-medium text-foreground">
                    Portail élève & notifications aux parents
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Consultation des notes en ligne et alertes aux contacts renseignés
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                  Bientôt disponible
                </span>
              </div>
            </div>
          </FormSectionCard>

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pb-6">{actions}</div>
        </div>
      </div>
    </form>
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
