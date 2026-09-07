'use client';

// Extracted verbatim from the old `/enseignants/[id]` fiche's "Infos" tab
// (spec docs/superpowers/specs/2026-09-04-personnel-module-design.md §6.3:
// this tab reuses the current app's layout as-is, no regression — Banani's
// mockup does not govern this tab). Same JSX, same behavior, same
// `GET /api/school/teachers/[id]` data shape as before; only the state that
// used to live inline in the single-file page (`inviteSending`) now lives
// here since this is the only consumer of it.
import { useState } from 'react';
import { Briefcase, UserCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LOCALE_BCP47 } from '@/lib/locales';
import { teacherStatusLabel } from '../../enseignants/status-label';
import type { TeacherWithAccess } from './types';

function fmtDate(d: string, locale: string): string {
  return new Date(d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-start gap-2 py-1.5 ${last ? '' : 'border-b border-border'}`}>
      <span className="min-w-[130px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-caption font-medium text-foreground">{value}</span>
    </div>
  );
}

export function TeacherInfoTab({
  teacher,
  onEdit,
  onReload,
}: {
  teacher: TeacherWithAccess;
  onEdit: () => void;
  onReload: () => void;
}) {
  const t = useTranslations('Enseignants.profile');
  const tStatus = useTranslations('Enseignants.status');
  const tInvite = useTranslations('Enseignants.invite');
  const tCommon = useTranslations('Common');
  const { toast } = useToast();
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [inviteSending, setInviteSending] = useState(false);

  const displayName = [teacher.civility, teacher.name].filter(Boolean).join(' ');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
            <UserCheck size={14} className="text-primary" />
            {t('personalInfo')}
          </div>
          <button onClick={onEdit} className="text-xs font-medium text-primary">
            {t('edit')}
          </button>
        </div>
        <InfoRow label={t('fields.fullName')} value={displayName} />
        <InfoRow
          label={t('fields.dateOfBirth')}
          value={teacher.dateOfBirth ? fmtDate(teacher.dateOfBirth, bcp47) : '—'}
        />
        <InfoRow label={t('fields.gender')} value={teacher.gender ?? '—'} />
        <InfoRow label={t('fields.nationality')} value={teacher.nationality ?? '—'} />
        <InfoRow label={t('fields.birthPlace')} value={teacher.birthPlace ?? '—'} />
        <InfoRow label={t('fields.diploma')} value={teacher.diploma ?? '—'} />
        <InfoRow label={t('fields.nif')} value={teacher.nif ?? '—'} />
        <InfoRow label={t('fields.niu')} value={teacher.niu ?? '—'} />
        <InfoRow label={t('fields.address')} value={teacher.address ?? '—'} />
        <InfoRow
          label={t('fields.status')}
          value={teacherStatusLabel(teacher.status, tStatus)}
          last
        />
      </Card>

      <Card className="p-5">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
            <Briefcase size={14} className="text-primary" />
            {t('contactContract')}
          </div>
          <button onClick={onEdit} className="text-xs font-medium text-primary">
            {t('edit')}
          </button>
        </div>
        <InfoRow label={t('fields.email')} value={teacher.email ?? '—'} />
        <InfoRow label={t('fields.phone')} value={teacher.phone ?? '—'} />
        <InfoRow label={t('fields.secondaryPhone')} value={teacher.secondaryPhone ?? '—'} />
        <InfoRow label={t('fields.contractType')} value={teacher.contractType ?? '—'} />
        <InfoRow
          label={t('fields.hiredAt')}
          value={teacher.hiredAt ? fmtDate(teacher.hiredAt, bcp47) : '—'}
        />
        <InfoRow
          label={t('fields.weeklyHoursTarget')}
          value={teacher.weeklyHoursTarget !== null ? `${teacher.weeklyHoursTarget} h` : '—'}
          last
        />

        <div className="mt-3.5 border-t border-border pt-3.5">
          {teacher.userId === null ? (
            <Button
              size="sm"
              className="w-fit"
              disabled={!teacher.email}
              title={!teacher.email ? tInvite('buttonDisabledNoEmail') : undefined}
              loading={inviteSending}
              onClick={async () => {
                setInviteSending(true);
                try {
                  await api(`/api/school/teachers/${teacher.id}/invite`, { method: 'POST' });
                  toast(tInvite('sentToast'), 'success');
                  onReload();
                } catch (err) {
                  toast(
                    err instanceof ApiError && err.code === 'EMAIL_ALREADY_IN_USE'
                      ? tInvite('errorEmailInUse')
                      : tCommon('errors.network'),
                    'error',
                  );
                } finally {
                  setInviteSending(false);
                }
              }}
            >
              {tInvite('button')}
            </Button>
          ) : teacher.emailVerifiedAt ? (
            <span className="text-xs text-muted-foreground">
              {tInvite('activeSince', { date: fmtDate(teacher.emailVerifiedAt, bcp47) })}
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {tInvite('pendingSince', {
                  date: fmtDate(teacher.userCreatedAt ?? teacher.updatedAt, bcp47),
                })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="w-fit"
                loading={inviteSending}
                onClick={async () => {
                  setInviteSending(true);
                  try {
                    await api(`/api/school/teachers/${teacher.id}/invite`, { method: 'POST' });
                    toast(tInvite('resentToast'), 'success');
                    onReload();
                  } catch (err) {
                    toast(
                      err instanceof ApiError && err.code === 'EMAIL_ALREADY_IN_USE'
                        ? tInvite('errorEmailInUse')
                        : tCommon('errors.network'),
                      'error',
                    );
                  } finally {
                    setInviteSending(false);
                  }
                }}
              >
                {tInvite('resendButton')}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
