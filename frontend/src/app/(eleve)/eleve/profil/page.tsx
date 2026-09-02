'use client';

// Mon profil — the student's own record as the school holds it, read-only
// (the school stays the only editor: no edit, invite or unlink control
// here). The identity card mirrors the admin fiche's hero; the info cards
// mirror its « Informations » tab minus every edit affordance. Guardians
// are the student's own family contacts, shown with their phone/email.
import { useLocale, useTranslations } from 'next-intl';
import { Calendar, Hash, School as SchoolIcon, UserCheck, UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { LOCALE_BCP47 } from '@/lib/locales';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { studentStatusLabel } from '@/app/(school)/eleves/status-label';
import type { StudentMeResponse } from '../types';

function fmtDate(iso: string, bcp47: string): string {
  return new Date(iso).toLocaleDateString(bcp47, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ageFrom(iso: string): number {
  const dob = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export default function EleveProfilPage() {
  const t = useTranslations('ElevePortal.profile');
  const tPortal = useTranslations('ElevePortal');
  const tStatus = useTranslations('Eleves.status');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const { data, loading, error } = useApi<StudentMeResponse>('/api/student/me');

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-40 rounded-md" />
        <Card className="gap-4 p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="mb-3.5 h-4 w-48" />
              <div className="flex flex-col gap-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="h-3 w-28 shrink-0" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        {tPortal('loadError')}
      </p>
    );
  }

  const s = data.student;
  const fullName = `${s.firstName} ${s.lastName}`;
  const statusLabel = studentStatusLabel(s.status, tStatus);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card className="gap-4 p-6">
        <div className="flex items-end gap-4">
          <div className="shrink-0 rounded-full border-[3px] border-card shadow-lg">
            <Avatar name={fullName} size={80} src={s.photoUrl} />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{fullName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Hash size={12} />#{s.studentNumber}
              </span>
              {data.class && (
                <span className="flex items-center gap-1">
                  <SchoolIcon size={12} />
                  {data.class.name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {fmtDate(s.dateOfBirth, bcp47)} · {t('ageYears', { age: ageFrom(s.dateOfBirth) })}
              </span>
              {data.homeroomTeacher && (
                <span className="flex items-center gap-1">
                  <UserCheck size={12} />
                  {data.homeroomTeacher.name} {t('homeroomSuffix')}
                </span>
              )}
            </div>
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon={UserRound} label={t('identity')} />
          <InfoRow label={t('fields.fullName')} value={fullName} />
          <InfoRow label={t('fields.dateOfBirth')} value={fmtDate(s.dateOfBirth, bcp47)} />
          <InfoRow label={t('fields.placeOfBirth')} value={s.placeOfBirth ?? '—'} />
          <InfoRow label={t('fields.gender')} value={s.gender ?? '—'} />
          <InfoRow label={t('fields.nationality')} value={s.nationality ?? '—'} />
          <InfoRow label={t('fields.motherTongue')} value={s.motherTongue ?? '—'} />
          <InfoRow label={t('fields.class')} value={data.class?.name ?? '—'} />
          <InfoRow label={t('fields.homeroomTeacher')} value={data.homeroomTeacher?.name ?? '—'} />
          <InfoRow label={t('fields.enrolledAt')} value={fmtDate(s.enrolledAt, bcp47)} />
          <InfoRow
            label={t('fields.scholarship')}
            value={s.scholarship ? t('fields.yes') : t('fields.no')}
          />
          <InfoRow label={t('fields.status')} value={statusLabel} last />
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <SectionTitle icon={UserCheck} label={t('contact')} />
            <InfoRow label={t('fields.phone')} value={s.phone ?? '—'} />
            <InfoRow label={t('fields.email')} value={s.email ?? '—'} />
            <InfoRow label={t('fields.address')} value={s.address ?? '—'} last />
          </Card>

          <Card className="p-5">
            <SectionTitle icon={Users} label={t('guardians')} />
            {s.guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noGuardian')}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {s.guardians.map((g, i) => (
                  <div key={g.id} className={i > 0 ? 'border-t border-border pt-4' : ''}>
                    <div className="mb-2 flex items-center gap-2.5">
                      <Avatar name={g.name} size={36} />
                      <div>
                        <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
                          {g.name}
                          {g.isPrimary && (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-semibold text-secondary-foreground">
                              {t('primary')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{g.relationship}</div>
                      </div>
                    </div>
                    <InfoRow label={t('fields.phone')} value={g.phone ?? '—'} />
                    <InfoRow label={t('fields.email')} value={g.email ?? '—'} last />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t('readOnlyHint')}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2 text-caption font-semibold text-foreground">
      <Icon size={14} className="text-primary" />
      {label}
    </div>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-start gap-2 py-1.5 ${last ? '' : 'border-b border-border'}`}>
      <span className="min-w-[130px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-caption font-medium text-foreground">{value}</span>
    </div>
  );
}
