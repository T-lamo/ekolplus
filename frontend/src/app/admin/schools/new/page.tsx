'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Copy,
  ImagePlus,
  Mail,
  Phone,
  School,
  UserCheck,
  Users,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ADMIN_CREATE_SCHOOL as T } from '@/lib/constants';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

interface CreateSchoolResponse {
  organization: { id: string; slug: string; name: string };
  school: { id: string };
  owner: { id: string; email: string; name: string | null };
  tempPassword: string | null;
}

const initialForm = {
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

export default function CreateSchoolPage() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateSchoolResponse | null>(null);
  const [copied, setCopied] = useState(false);

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
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <Card className="items-center gap-3 px-6 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success">
            <Check size={22} className="text-success-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{T.successTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {result.tempPassword ? T.newAccountCreated : T.existingAccountLinked}
          </p>
        </Card>

        {result.tempPassword && (
          <Card className="gap-3 bg-[#0f0a1e] px-5 py-5">
            <span className="text-[10px] font-semibold tracking-wide text-white/40 uppercase">
              {T.tempPasswordLabel}
            </span>
            <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.06] px-3 py-2.5">
              <code className="text-sm font-semibold text-white">{result.tempPassword}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(result.tempPassword ?? '');
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex min-h-8 items-center gap-1 rounded-sm bg-primary/35 px-2 text-xs font-semibold text-violet-300"
              >
                <Copy size={12} />
                {copied ? T.copied : T.copy}
              </button>
            </div>
            <p className="text-xs text-white/40">{T.tempPasswordNote}</p>
          </Card>
        )}

        <Link href="/admin" className="text-center text-sm font-medium text-primary">
          {T.backToDashboard}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{T.title}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{T.subtitle}</p>
        </div>
        <Link
          href="/admin"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3.5 text-xs font-medium text-muted-foreground"
        >
          <ArrowLeft size={13} />
          {T.backToSchools}
        </Link>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-secondary">
              <School size={14} className="text-primary" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-foreground">{T.schoolSection.title}</div>
              <div className="text-[11px] text-muted-foreground">{T.schoolSection.subtitle}</div>
            </div>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <div className="flex shrink-0 flex-col gap-1.5">
                <span className="text-xs font-semibold text-foreground">Logo</span>
                {/* Not wired this pass — see create-school.md */}
                <div className="flex h-20 w-25 flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-border">
                  <ImagePlus size={16} className="text-primary" />
                  <span className="text-[10px] text-muted-foreground">PNG, JPG</span>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3.5">
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
                onChange={(e) => set('schoolType', e.target.value)}
              >
                {T.schoolTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
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
              <Field
                label={T.schoolSection.phone}
                icon={<Phone size={13} />}
                placeholder={T.schoolSection.phonePlaceholder}
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
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
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-[#e0f0ff]">
              <UserCheck size={14} className="text-[#2563eb]" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-foreground">{T.adminSection.title}</div>
              <div className="text-[11px] text-muted-foreground">{T.adminSection.subtitle}</div>
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
                onChange={(e) => set('ownerRole', e.target.value)}
              >
                <option value="Directeur / Directrice">Directeur / Directrice</option>
                <option value="Administrateur / Administratrice">
                  Administrateur / Administratrice
                </option>
              </Select>
              <Field
                label={T.adminSection.phone}
                icon={<Phone size={13} />}
                placeholder={T.schoolSection.phonePlaceholder}
                value={form.ownerPhone}
                onChange={(e) => set('ownerPhone', e.target.value)}
              />
            </div>
          </div>
        </Card>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}

        <Button type="submit" loading={submitting}>
          {submitting ? T.submitting : T.submit}
        </Button>
      </form>
    </div>
  );
}
