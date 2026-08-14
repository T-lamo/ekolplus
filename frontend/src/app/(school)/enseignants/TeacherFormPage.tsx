'use client';

// Add/Edit Teacher — Banani HmgFVw_38Y6C, plan .planning/banani/add-teacher.md.
// Full-page form replacing the old TeacherFormModal (user decision: the
// Banani design is the complete one). `name` stays the canonical DB column;
// the form composes it from civilité/prénom/nom. Matières & classes are
// read-only tags derived from real ClassSubject assignments (editable in
// Affectations only — the mockup's hint kept). The mockup's "Accès à la
// plateforme" section (login account + permissions) is deferred honestly.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Briefcase,
  Check,
  CheckCircle2,
  Circle,
  Link as LinkIcon,
  Phone,
  Shield,
  User,
  UserPlus,
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
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Skeleton } from '@/components/ui/Skeleton';
import { FormStepsBar } from '@/components/school/FormStepsBar';
import { FormSectionCard } from '@/components/school/FormSectionCard';
import type { TeacherDetail, TeacherStatus } from './types';

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

const STATUS_BADGE: Record<TeacherStatus, string> = {
  ACTIVE: 'bg-success text-success-foreground',
  ON_LEAVE: 'bg-warning text-warning-foreground',
  INACTIVE: 'bg-muted text-muted-foreground',
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

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 size={15} className="shrink-0 text-success-foreground" />
      ) : (
        <Circle size={15} className="shrink-0 text-border" />
      )}
      <span className={`text-[13px] ${done ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  );
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
            tone === 'primary' ? 'bg-secondary text-primary' : 'bg-[#e0f0ff] text-[#2563eb]'
          }`}
        >
          {it.name}
        </span>
      ))}
    </div>
  );
}

export function TeacherFormPage({ teacherId }: { teacherId: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = teacherId !== null;

  const [detail, setDetail] = useState<TeacherDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(isEdit ? null : EMPTY_FORM);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState('identite');

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

  // Highlight the section currently in view in the steps bar.
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

  // For an existing teacher, persist the photo the moment it's uploaded —
  // don't make it depend on the user remembering to click "Enregistrer"
  // (that's what caused photos to silently vanish before this fix). A new
  // teacher has no id yet — the photo goes with the create submit.
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

  const checklist = useMemo(
    () =>
      form
        ? [
            { label: 'Civilité et nom', done: fullName.length >= 2 },
            { label: 'Adresse e-mail', done: form.email.trim() !== '' },
            { label: 'Téléphone principal', done: form.phone.trim() !== '' },
            { label: 'Statut', done: true },
          ]
        : [],
    [form, fullName],
  );
  const missingCount = checklist.filter((c) => !c.done).length;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (fullName.length < 2) {
      setError('Le prénom et le nom sont requis.');
      return;
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
      router.push('/enseignants');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Link href="/enseignants" className="text-sm font-medium text-primary">
          Retour aux enseignants
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
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => router.push('/enseignants')}
      >
        Annuler
      </Button>
      <Button type="submit" loading={submitting} className="w-fit">
        <UserPlus size={14} />
        {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : "Créer l'enseignant"}
      </Button>
    </>
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/enseignants"
            aria-label="Retour aux enseignants"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={15} />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              {isEdit ? "Modifier l'enseignant" : 'Ajouter un enseignant'}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isEdit
                ? 'Mettez à jour les informations de l’enseignant'
                : 'Renseignez les informations du nouvel enseignant'}
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">{actions}</div>
      </div>

      <FormStepsBar steps={STEPS} activeId={activeStep} />

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
        {/* LEFT — form sections */}
        <div className="flex min-w-0 flex-col gap-4">
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
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <LinkIcon size={11} />
                  Les matières et classes se configurent depuis la page{' '}
                  <Link href="/configuration/affectations" className="font-semibold text-primary">
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
              <p className="text-[13px] text-muted-foreground">
                Les comptes de connexion pour les enseignants arrivent dans une prochaine version.
              </p>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                Bientôt disponible
              </span>
            </div>
          </FormSectionCard>

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pb-6">{actions}</div>
        </div>

        {/* RIGHT — sticky live summary */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-20">
          <Card className="p-4">
            <div className="mb-3 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              Aperçu de la fiche
            </div>
            <div className="flex flex-col items-center gap-2.5 py-3">
              <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-muted">
                {form.photoUrl ? (
                  <img src={form.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User size={26} className="text-muted-foreground" />
                )}
              </span>
              <div className="text-center">
                <div className="text-[15px] font-bold text-foreground">
                  {[form.civility, fullName].filter(Boolean).join(' ') || 'Nouvel enseignant'}
                </div>
                <span
                  className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[form.status]}`}
                >
                  <span className="h-1 w-1 rounded-full bg-current" />
                  {STATUS_LABEL[form.status]}
                </span>
              </div>
            </div>
            <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Matières</span>
                <span className="font-semibold text-foreground">
                  {detail ? detail.subjects.length : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Classes</span>
                <span className="font-semibold text-foreground">
                  {detail ? detail.classes.length : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Heures/sem. (réel)</span>
                <span className="font-semibold text-foreground">
                  {detail ? `${detail.weeklyHours} h` : '— h'}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              Champs requis
            </div>
            <div className="flex flex-col gap-2">
              {checklist.map((c) => (
                <ChecklistRow key={c.label} done={c.done} label={c.label} />
              ))}
            </div>
            {missingCount > 0 ? (
              <div className="mt-3.5 rounded-md bg-warning p-2.5 text-xs font-medium text-warning-foreground">
                {missingCount} champ{missingCount > 1 ? 's' : ''} recommandé
                {missingCount > 1 ? 's' : ''} manquant{missingCount > 1 ? 's' : ''}.
              </div>
            ) : (
              <div className="mt-3.5 flex items-center gap-1.5 rounded-md bg-success p-2.5 text-xs font-medium text-success-foreground">
                <Check size={13} />
                Tous les champs recommandés sont remplis.
              </div>
            )}
          </Card>
        </div>
      </div>
    </form>
  );
}
