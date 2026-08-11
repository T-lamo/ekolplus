'use client';

import { useState, type FormEvent } from 'react';
import { ImagePlus, Mail, Phone } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { SchoolData } from './types';

export function EtablissementTab({
  school,
  onUpdated,
}: {
  school: SchoolData;
  onUpdated: (school: SchoolData) => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: school.name,
    shortName: school.shortName ?? '',
    officialCode: school.officialCode ?? '',
    schoolType: school.schoolType,
    address: school.address ?? '',
    phone: school.phone ?? '',
    officialEmail: school.officialEmail ?? '',
    website: school.website ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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
          shortName: form.shortName || null,
          officialCode: form.officialCode || null,
          schoolType: form.schoolType,
          address: form.address || null,
          phone: form.phone || null,
          officialEmail: form.officialEmail || null,
          website: form.website || null,
        },
      });
      onUpdated(res.school);
      toast('Informations mises à jour.', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-[13px] font-bold text-foreground">
          Informations de l&apos;établissement
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Ces informations apparaissent sur les bulletins et documents officiels.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div className="flex shrink-0 flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground">Logo</span>
            {/* Not wired this pass — same as Create School */}
            <div className="flex h-20 w-25 flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-border">
              <ImagePlus size={16} className="text-primary" />
              <span className="text-[10px] text-muted-foreground">PNG, JPG</span>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3.5">
            <Field
              label="Nom de l'établissement"
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field
                label="Nom abrégé / Sigle"
                maxLength={10}
                value={form.shortName}
                onChange={(e) => set('shortName', e.target.value)}
              />
              <Field
                label="Code ou matricule officiel"
                value={form.officialCode}
                onChange={(e) => set('officialCode', e.target.value)}
              />
            </div>
          </div>
        </div>

        <Field
          label="Type d'établissement"
          required
          value={form.schoolType}
          onChange={(e) => set('schoolType', e.target.value)}
        />

        <Field
          label="Adresse"
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
        />

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field
            label="Téléphone"
            icon={<Phone size={13} />}
            placeholder="+509 ..."
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
          <Field
            label="Courriel officiel"
            type="email"
            icon={<Mail size={13} />}
            value={form.officialEmail}
            onChange={(e) => set('officialEmail', e.target.value)}
          />
        </div>

        <Field
          label="Site web (optionnel)"
          value={form.website}
          onChange={(e) => set('website', e.target.value)}
        />

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}

        <Button type="submit" loading={submitting} className="w-fit">
          {submitting ? 'Enregistrement…' : 'Enregistrer les modifications'}
        </Button>
      </form>
    </Card>
  );
}
