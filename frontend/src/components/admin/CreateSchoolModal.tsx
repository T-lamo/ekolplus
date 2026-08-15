'use client';

// "Créer une école" — was a dedicated page (schools/new), now a Modal
// opened from /admin and /admin/schools per the user's request (no more
// full-page navigation for this flow). Same fields as the original page
// plus a real logo upload (the page's dropzone was a static placeholder).
// See .planning/banani/create-school.md for the original screen spec.

import { useState, type FormEvent } from 'react';
import { Check, Mail, MailCheck, School, UserCheck, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ADMIN_CREATE_SCHOOL as T } from '@/lib/constants';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Select, SelectItem } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ImageUploader } from '@/components/ui/ImageUploader';

interface CreateSchoolResponse {
  organization: { id: string; slug: string; name: string };
  school: { id: string };
  owner: { id: string; email: string; name: string | null };
  verificationEmailSent: boolean;
}

const initialForm = {
  logoUrl: null as string | null,
  schoolName: '',
  shortName: '',
  country: '',
  city: '',
  schoolType: T.schoolTypes[0] as string,
  primaryLanguage: '',
  address: '',
  phone: '',
  estimatedStudents: '',
  ownerFirstName: '',
  ownerLastName: '',
  ownerEmail: '',
  ownerRole: 'Directeur / Directrice',
  ownerPhone: '',
};

export function CreateSchoolModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateSchoolResponse | null>(null);

  function set<K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (
      !form.schoolName ||
      !form.country ||
      !form.city ||
      !form.schoolType ||
      !form.ownerFirstName ||
      !form.ownerLastName ||
      !form.ownerEmail
    ) {
      setError(T.requiredFieldsError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api<CreateSchoolResponse>('/api/admin/schools', {
        method: 'POST',
        body: {
          schoolName: form.schoolName,
          shortName: form.shortName || undefined,
          country: form.country,
          city: form.city,
          schoolType: form.schoolType,
          primaryLanguage: form.primaryLanguage || undefined,
          address: form.address || undefined,
          phone: form.phone || undefined,
          estimatedStudents: form.estimatedStudents ? Number(form.estimatedStudents) : undefined,
          logoUrl: form.logoUrl ?? undefined,
          ownerFirstName: form.ownerFirstName,
          ownerLastName: form.ownerLastName,
          ownerEmail: form.ownerEmail,
          ownerRole: form.ownerRole || undefined,
          ownerPhone: form.ownerPhone || undefined,
        },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Modal title={T.successTitle} onClose={onCreated} wide>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success">
            <Check size={22} className="text-success-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {result.verificationEmailSent ? T.newAccountCreated : T.existingAccountLinked}
          </p>
        </div>

        {result.verificationEmailSent && (
          <Card className="flex-row items-start gap-3 bg-[#0f0a1e] px-5 py-5">
            <MailCheck size={18} className="mt-0.5 shrink-0 text-violet-300" />
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold text-white">
                {T.verificationEmailSentLabel}
              </span>
              <p className="text-xs text-white/40">{T.verificationEmailSentNote}</p>
            </div>
          </Card>
        )}

        <Button className="mt-4" onClick={onCreated}>
          {T.close}
        </Button>
      </Modal>
    );
  }

  return (
    <Modal title={T.title} onClose={onClose} wide>
      <p className="-mt-1 mb-4 text-xs text-muted-foreground">{T.subtitle}</p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-secondary">
              <School size={14} className="text-primary" />
            </div>
            <div>
              <div className="text-caption font-bold text-foreground">{T.schoolSection.title}</div>
              <div className="text-2xs text-muted-foreground">{T.schoolSection.subtitle}</div>
            </div>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <ImageUploader
              label={T.schoolSection.logo}
              hint={T.schoolSection.logoHint}
              value={form.logoUrl}
              onChange={(url) => set('logoUrl', url)}
            />

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field
                label={T.schoolSection.schoolName}
                required
                value={form.schoolName}
                onChange={(e) => set('schoolName', e.target.value)}
              />
              <div className="flex flex-col gap-1">
                <Field
                  label={T.schoolSection.shortName}
                  value={form.shortName}
                  maxLength={10}
                  onChange={(e) => set('shortName', e.target.value)}
                />
                <span className="text-[10px] text-muted-foreground">
                  {T.schoolSection.shortNameHint}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field
                label={T.schoolSection.country}
                required
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
              />
              <Field
                label={T.schoolSection.city}
                required
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Select
                label={T.schoolSection.schoolType}
                required
                value={form.schoolType}
                onValueChange={(v) => set('schoolType', v)}
              >
                {T.schoolTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </Select>
              <Field
                label={T.schoolSection.primaryLanguage}
                value={form.primaryLanguage}
                onChange={(e) => set('primaryLanguage', e.target.value)}
              />
            </div>

            <Field
              label={T.schoolSection.address}
              placeholder={T.schoolSection.addressPlaceholder}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <PhoneInput
                label={T.schoolSection.phone}
                value={form.phone}
                onChange={(v) => set('phone', v)}
              />
              <div className="flex flex-col gap-1">
                <Field
                  label={T.schoolSection.estimatedStudents}
                  icon={<Users size={13} />}
                  type="number"
                  min={0}
                  value={form.estimatedStudents}
                  onChange={(e) => set('estimatedStudents', e.target.value)}
                />
                <span className="text-[10px] text-muted-foreground">
                  {T.schoolSection.estimatedStudentsHint}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-info">
              <UserCheck size={14} className="text-info-foreground" />
            </div>
            <div>
              <div className="text-caption font-bold text-foreground">{T.adminSection.title}</div>
              <div className="text-2xs text-muted-foreground">{T.adminSection.subtitle}</div>
            </div>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field
                label={T.adminSection.firstName}
                required
                value={form.ownerFirstName}
                onChange={(e) => set('ownerFirstName', e.target.value)}
              />
              <Field
                label={T.adminSection.lastName}
                required
                value={form.ownerLastName}
                onChange={(e) => set('ownerLastName', e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Field
                label={T.adminSection.email}
                type="email"
                required
                icon={<Mail size={13} />}
                value={form.ownerEmail}
                onChange={(e) => set('ownerEmail', e.target.value)}
              />
              <span className="text-[10px] text-muted-foreground">{T.adminSection.emailHint}</span>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Select
                label={T.adminSection.role}
                value={form.ownerRole}
                onValueChange={(v) => set('ownerRole', v)}
              >
                <SelectItem value="Directeur / Directrice">Directeur / Directrice</SelectItem>
                <SelectItem value="Administrateur / Administratrice">
                  Administrateur / Administratrice
                </SelectItem>
              </Select>
              <PhoneInput
                label={T.adminSection.phone}
                value={form.ownerPhone}
                onChange={(v) => set('ownerPhone', v)}
              />
            </div>
          </div>
        </Card>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}

        <div className="flex gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>
            {T.cancel}
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting ? T.submitting : T.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
