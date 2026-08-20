'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Select, SelectItem } from '@/components/ui/Select';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Button } from '@/components/ui/Button';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { ADMIN_CREATE_SCHOOL, SCHOOL_STATUTES } from '@/lib/constants';
import { roleLabel } from './role-label';
import type { SchoolData, MemberData } from './types';

export function EtablissementTab({
  school,
  members,
  onUpdated,
}: {
  school: SchoolData;
  members: MemberData[];
  onUpdated: (school: SchoolData) => void;
}) {
  const t = useTranslations('Settings.etablissement');
  const tCommon = useTranslations('Common');
  const tRoles = useTranslations('Common.roles');
  const { toast } = useToast();
  const [logoUrl, setLogoUrl] = useState(school.logoUrl);
  const [form, setForm] = useState({
    name: school.name,
    officialCode: school.officialCode ?? '',
    statute: school.statute ?? '',
    schoolType: school.schoolType,
    address: school.address ?? '',
    phone: school.phone ?? '',
    officialEmail: school.officialEmail ?? '',
    website: school.website ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const director = members.find((m) => m.role === 'OWNER');

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveLogo(url: string | null) {
    const previous = logoUrl;
    setLogoUrl(url);
    try {
      const res = await api<{ school: SchoolData }>('/api/school', {
        method: 'PUT',
        body: { logoUrl: url },
      });
      onUpdated(res.school);
      toast(t('logoUpdated'), 'success');
    } catch (err) {
      setLogoUrl(previous);
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ school: SchoolData }>('/api/school', {
        method: 'PUT',
        body: {
          name: form.name,
          officialCode: form.officialCode || null,
          statute: form.statute || null,
          schoolType: form.schoolType,
          address: form.address || null,
          phone: form.phone || null,
          officialEmail: form.officialEmail || null,
          website: form.website || null,
        },
      });
      onUpdated(res.school);
      toast(t('infoUpdated'), 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-caption font-bold text-foreground">{t('title')}</h2>
        <p className="text-2xs text-muted-foreground">{t('subtitle')}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div className="w-full shrink-0 sm:w-40">
            <ImageUploader
              label={t('logoLabel')}
              hint={t('logoHint')}
              value={logoUrl}
              onChange={saveLogo}
            />
          </div>
          <div className="flex flex-1 flex-col gap-3.5">
            <Field
              label={t('nameLabel')}
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <Field
              label={t('codeLabel')}
              value={form.officialCode}
              onChange={(e) => set('officialCode', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Select
            label={t('statuteLabel')}
            value={form.statute}
            onValueChange={(v) => set('statute', v)}
          >
            {SCHOOL_STATUTES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </Select>
          <Select
            label={t('schoolTypeLabel')}
            required
            value={form.schoolType}
            onValueChange={(v) => set('schoolType', v)}
          >
            {ADMIN_CREATE_SCHOOL.schoolTypes.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </Select>
        </div>

        <Field
          label={t('addressLabel')}
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
        />

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <PhoneInput
            label={t('phoneLabel')}
            value={form.phone}
            onChange={(v) => set('phone', v)}
          />
          <Field
            label={t('emailLabel')}
            type="email"
            icon={<Mail size={13} />}
            value={form.officialEmail}
            onChange={(e) => set('officialEmail', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {director && (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-semibold text-foreground">
                {roleLabel('OWNER', tRoles)}
              </span>
              <span className="flex h-10 items-center gap-2 rounded-md border border-border bg-muted px-3 text-foreground">
                {director.name ?? director.email}
              </span>
            </div>
          )}
          <Field
            label={t('websiteLabel')}
            value={form.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}

        <Button type="submit" loading={submitting} className="w-fit">
          {submitting ? t('saving') : t('save')}
        </Button>
      </form>
    </Card>
  );
}
