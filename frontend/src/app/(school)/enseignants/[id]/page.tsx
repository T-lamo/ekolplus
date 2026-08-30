'use client';

// Teacher profile page — strictly the same layout skeleton as the student
// profile (/eleves/[id]): back+actions row, gradient hero card (avatar,
// identity chips, status pill, stats), tab bar, info tab as a 2-column
// grid of InfoRow cards. Stats and the Matières & Classes tab are real,
// derived from ClassSubject assignments — never fabricated numbers.

import { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Calendar,
  Hash,
  Link as LinkIcon,
  Mail,
  Pencil,
  Phone,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { LOCALE_BCP47 } from '@/lib/locales';
import { TeacherFormModal } from '../TeacherFormModal';
import { teacherStatusLabel } from '../status-label';
import type { TeacherDetail, TeacherStatus } from '../types';

const STATUS_DOT: Record<TeacherStatus, string> = {
  ACTIVE: '#16A34A',
  ON_LEAVE: '#F59E0B',
  INACTIVE: '#9CA3AF',
};

// GET /api/school/teachers/[id] also returns these fields (Espace
// Enseignant invite state) alongside everything TeacherDetail already
// declares — kept as a page-local extension rather than touching the
// shared types.ts, since this profile page is the only current consumer.
// `userCreatedAt` (the linked User's own createdAt, not Teacher.updatedAt)
// is the "pending since" date — Teacher.updatedAt changes on any
// unrelated profile edit and does NOT change on an invite resend.
type TeacherWithAccess = TeacherDetail & {
  userId: string | null;
  emailVerifiedAt: string | null;
  userCreatedAt: string | null;
  updatedAt: string;
};

function fmtDate(d: string, locale: string): string {
  return new Date(d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function TeacherProfilePage() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const t = useTranslations('Enseignants.profile');
  const tStatus = useTranslations('Enseignants.status');
  const tInvite = useTranslations('Enseignants.invite');
  const tCommon = useTranslations('Common');
  const { toast } = useToast();
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [tab, setTab] = useState<'info' | 'assignments'>('info');
  const [editing, setEditing] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);

  const TABS = [
    { key: 'info' as const, label: t('tabs.info'), icon: UserCheck },
    { key: 'assignments' as const, label: t('tabs.assignments'), icon: BookOpen },
  ];

  const [loadError, setLoadError] = useState<string | null>(null);
  const { data: teacherData, refresh: load } = useApi<{ teacher: TeacherWithAccess }>(
    `/api/school/teachers/${params.id}`,
    {
      skip: !user,
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return true;
        }
        setLoadError(
          err instanceof ApiError && err.status === 404 ? t('notFound') : t('loadError'),
        );
        return true;
      },
    },
  );
  const teacher = teacherData?.teacher ?? null;
  const error = loadError;

  if (!user || (teacher === null && !error)) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-40 rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-40 rounded-md" />
            <Skeleton className="h-9 w-40 rounded-md" />
          </div>
        </div>

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

        <Skeleton className="h-10 w-72 rounded-lg" />

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

  if (error || !teacher) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/enseignants"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  const displayName = [teacher.civility, teacher.name].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/enseignants"
          className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/configuration/matieres"
            className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground"
          >
            <LinkIcon size={14} />
            {t('manageAssignments')}
          </Link>
          <Button className="w-fit" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            {t('editProfile')}
          </Button>
        </div>
      </div>

      <Card className="relative gap-4 overflow-hidden p-6">
        <div
          className="absolute inset-x-0 top-0 h-[72px]"
          style={{
            background:
              'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-gradient-end) 100%)',
          }}
        />
        <div className="relative z-10 flex flex-col gap-4 pt-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="relative shrink-0">
              <div className="rounded-full border-[3px] border-card shadow-lg">
                <Avatar name={teacher.name} size={80} src={teacher.photoUrl} />
              </div>
              <div
                className="absolute right-1 bottom-1 h-3.5 w-3.5 rounded-full border-2 border-card"
                style={{ background: STATUS_DOT[teacher.status] }}
              />
            </div>
            <div>
              <div className="text-xl font-bold text-foreground">{displayName}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {teacher.idNumber && (
                  <span className="flex items-center gap-1">
                    <Hash size={12} />
                    {teacher.idNumber}
                  </span>
                )}
                {teacher.email && (
                  <span className="flex items-center gap-1">
                    <Mail size={12} />
                    {teacher.email}
                  </span>
                )}
                {teacher.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={12} />
                    {teacher.phone}
                  </span>
                )}
                {teacher.contractType && (
                  <span className="flex items-center gap-1">
                    <Briefcase size={12} />
                    {teacher.contractType}
                  </span>
                )}
                {teacher.hiredAt && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {t('sinceDate', { date: fmtDate(teacher.hiredAt, bcp47) })}
                  </span>
                )}
              </div>
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_DOT[teacher.status] }}
                  />
                  {teacherStatusLabel(teacher.status, tStatus)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 sm:gap-6">
            <Stat label={t('stats.subjects')} value={String(teacher.subjects.length)} />
            <div className="h-9 w-px bg-border" />
            <Stat label={t('stats.classes')} value={String(teacher.classes.length)} />
            <div className="h-9 w-px bg-border" />
            <Stat label={t('stats.weeklyHours')} value={`${teacher.weeklyHours} h`} />
          </div>
        </div>
      </Card>

      <div role="tablist" className="flex w-fit gap-1 overflow-x-auto rounded-lg bg-card p-1">
        {TABS.map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.key}
              type="button"
              role="tab"
              aria-selected={tab === tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-2 text-caption font-medium whitespace-nowrap ${
                tab === tabItem.key
                  ? 'bg-secondary font-semibold text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              <Icon size={13} />
              {tabItem.label}
            </button>
          );
        })}
      </div>

      {tab === 'info' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
                <UserCheck size={14} className="text-primary" />
                {t('personalInfo')}
              </div>
              <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary">
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
            <InfoRow label={t('fields.idNumber')} value={teacher.idNumber ?? '—'} />
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
              <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary">
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
                      void load();
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
                        void load();
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
      )}

      {tab === 'assignments' && (
        <Card className="p-5">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
              <BookOpen size={14} className="text-primary" />
              {t('assignedSubjectsClasses')}
            </div>
            <Link href="/configuration/matieres" className="text-xs font-medium text-primary">
              {t('manage')}
            </Link>
          </div>
          {teacher.assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.rich('noAssignments', {
                link: (chunks) => (
                  <Link href="/configuration/matieres" className="font-semibold text-primary">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <th className="py-2 pr-3">{t('assignmentsTable.subject')}</th>
                    <th className="py-2 pr-3">{t('assignmentsTable.class')}</th>
                    <th className="py-2 pr-3">{t('assignmentsTable.weeklyHours')}</th>
                    <th className="py-2">{t('assignmentsTable.coefficient')}</th>
                  </tr>
                </thead>
                <tbody>
                  {teacher.assignments.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-3 text-caption font-medium text-foreground">
                        {a.subject.name}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="rounded-full bg-info px-2.5 py-1 text-xs font-semibold text-info-foreground">
                          {a.class.name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-caption text-foreground">
                        {a.weeklyHours !== null ? `${a.weeklyHours} h` : '—'}
                      </td>
                      <td className="py-2.5 text-caption text-foreground">
                        {a.coefficient ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {editing && (
        <TeacherFormModal
          teacherId={teacher.id}
          onClose={() => setEditing(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-xl leading-none font-bold text-foreground">{value}</div>
      <div className="text-center text-2xs text-muted-foreground">{label}</div>
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
