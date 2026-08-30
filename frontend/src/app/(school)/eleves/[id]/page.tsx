'use client';

import { Suspense, useState } from 'react';
import {
  ArrowLeft,
  Pencil,
  FileText,
  Hash,
  School as SchoolIcon,
  Calendar,
  UserCheck,
  BarChart2,
  CalendarCheck,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { LOCALE_BCP47 } from '@/lib/locales';
import { NotesResultatsTab } from './NotesResultatsTab';
import { AppreciationsTab } from './AppreciationsTab';
import { PresencesTab } from './PresencesTab';
import { BulletinsTab } from './BulletinsTab';
import { StudentFormModal } from '../StudentFormModal';
import { studentStatusLabel } from '../status-label';
import { formatOrdinal } from '../ordinal';
import type { StudentDetail, StudentResults, StudentStatus } from '../types';
import type { StudentAttendanceResponse } from '../../pedagogie/presences/types';

const STATUS_DOT: Record<StudentStatus, string> = {
  ENROLLED: '#16A34A',
  REPEATED_ABSENCES: '#F59E0B',
  SUSPENDED: '#9CA3AF',
};

// GET /api/school/students/[id] also returns these fields (Espace Élève
// invite state) alongside everything StudentDetail already declares - kept
// as a page-local extension rather than touching the shared types.ts, since
// this profile page is the only current consumer (same convention as the
// teacher profile page's TeacherWithAccess).
type StudentWithAccess = StudentDetail & {
  userId: string | null;
  userEmailVerifiedAt: string | null;
};

function fmtDate(d: string, locale: string): string {
  return new Date(d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ageFrom(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

const TAB_KEYS = ['info', 'grades', 'attendance', 'appreciations', 'bulletins'] as const;

export default function StudentProfilePage() {
  return (
    <Suspense fallback={null}>
      <StudentProfile />
    </Suspense>
  );
}

function StudentProfile() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const { toast } = useToast();
  const t = useTranslations('Eleves.profile');
  const tStatus = useTranslations('Eleves.status');
  const tOrdinal = useTranslations('Eleves.ordinal');
  const tInvite = useTranslations('Eleves.invite');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TAB_KEYS)[number]>(
    initialTab && TAB_KEYS.some((k) => k === initialTab)
      ? (initialTab as (typeof TAB_KEYS)[number])
      : 'info',
  );
  const [editing, setEditing] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);

  function handleLoadError(err: unknown) {
    if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
      router.replace('/');
      return true;
    }
    setLoadError(err instanceof ApiError && err.status === 404 ? t('notFound') : t('loadError'));
    return true;
  }
  const { data: studentData, refresh: refreshStudent } = useApi<{ student: StudentWithAccess }>(
    `/api/school/students/${params.id}`,
    { skip: !user, onError: handleLoadError },
  );
  const student = studentData?.student ?? null;
  const { data: results, refresh: refreshResults } = useApi<StudentResults>(
    `/api/school/students/${params.id}/results`,
    { skip: !user, onError: handleLoadError },
  );
  const { data: attendance, refresh: refreshAttendance } = useApi<StudentAttendanceResponse>(
    `/api/school/students/${params.id}/attendance`,
    { skip: !user, onError: handleLoadError },
  );
  const error = loadError;

  const TABS = [
    { key: 'info' as const, label: t('tabs.info'), icon: UserCheck },
    { key: 'grades' as const, label: t('tabs.grades'), icon: BarChart2 },
    { key: 'attendance' as const, label: t('tabs.attendance'), icon: CalendarCheck },
    { key: 'appreciations' as const, label: t('tabs.appreciations'), icon: Star },
    { key: 'bulletins' as const, label: t('tabs.bulletins'), icon: FileText },
  ];

  if (!user || (student === null && !error)) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-40 rounded-md" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="hidden h-9 w-36 rounded-md sm:block" />
            <Skeleton className="h-9 w-36 rounded-md" />
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

  if (error || !student) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/eleves"
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/eleves"
          className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {results?.resolvedTermId ? (
            <Link
              href={`/bulletins/${params.id}/${results.resolvedTermId}`}
              className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground"
            >
              <FileText size={14} />
              {t('viewBulletin')}
            </Link>
          ) : (
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => toast(t('noTermAvailable'), 'info')}
            >
              <FileText size={14} />
              {t('viewBulletin')}
            </Button>
          )}
          <Button className="w-fit" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            {t('editProfile')}
          </Button>
        </div>
      </div>

      <Card className="gap-4 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="relative shrink-0">
              <div className="rounded-full border-[3px] border-card shadow-lg">
                <Avatar
                  name={`${student.firstName} ${student.lastName}`}
                  size={80}
                  src={student.photoUrl}
                />
              </div>
              <div
                className="absolute right-1 bottom-1 h-3.5 w-3.5 rounded-full border-2 border-card"
                style={{ background: STATUS_DOT[student.status] }}
              />
            </div>
            <div>
              <div className="text-xl font-bold text-foreground">
                {student.firstName} {student.lastName}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Hash size={12} />#{student.studentNumber}
                </span>
                {student.class && (
                  <span className="flex items-center gap-1">
                    <SchoolIcon size={12} />
                    {student.class.name}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {fmtDate(student.dateOfBirth, bcp47)} ·{' '}
                  {t('ageYears', { age: ageFrom(student.dateOfBirth) })}
                </span>
                {student.homeroomTeacher && (
                  <span className="flex items-center gap-1">
                    <UserCheck size={12} />
                    {student.homeroomTeacher.name} {t('homeroomSuffix')}
                  </span>
                )}
              </div>
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_DOT[student.status] }}
                  />
                  {studentStatusLabel(student.status, tStatus)}
                </span>
              </div>
            </div>
          </div>
          {/* 1×4 row with dividers from `sm` up; below that a 360px screen
              can't fit 4 labels + 3 dividers on one line (measured overflow
              during the mobile audit), so it becomes a borderless 2×2 grid. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:items-center sm:gap-6">
            <Stat
              label={t('stats.overallAverage')}
              value={results?.overallAverage != null ? `${results.overallAverage.toFixed(1)}` : '—'}
            />
            <div className="hidden h-9 w-px bg-border sm:block" />
            <Stat
              label={t('stats.attendanceRate')}
              value={attendance?.ratePercent != null ? `${attendance.ratePercent}%` : '—'}
            />
            <div className="hidden h-9 w-px bg-border sm:block" />
            <Stat
              label={t('stats.absencesThisTerm')}
              value={attendance ? String(attendance.absences) : '—'}
            />
            <div className="hidden h-9 w-px bg-border sm:block" />
            <Stat
              label={t('stats.classRank')}
              value={results?.rank ? formatOrdinal(results.rank, bcp47, tOrdinal) : '—'}
            />
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
            <div className="mb-3.5 flex items-center justify-between border-b border-border pb-3">
              {student.userId === null ? (
                <Button
                  size="sm"
                  className="w-fit"
                  disabled={
                    !student.email && !student.guardians.some((g) => g.isPrimary && g.email)
                  }
                  title={
                    !student.email && !student.guardians.some((g) => g.isPrimary && g.email)
                      ? tInvite('buttonDisabledNoEmail')
                      : undefined
                  }
                  loading={inviteSending}
                  onClick={async () => {
                    setInviteSending(true);
                    try {
                      await api(`/api/school/students/${student.id}/invite`, { method: 'POST' });
                      toast(tInvite('sentToast'), 'success');
                      void refreshStudent();
                    } catch (err) {
                      toast(
                        err instanceof ApiError && err.code === 'EMAIL_ALREADY_IN_USE'
                          ? tInvite('errorEmailInUse')
                          : err instanceof ApiError && err.code === 'NO_INVITE_TARGET'
                            ? tInvite('errorNoTarget')
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
              ) : student.userEmailVerifiedAt ? (
                <span className="text-xs text-muted-foreground">{tInvite('activeSince')}</span>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">{tInvite('pendingSince')}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-fit"
                    loading={inviteSending}
                    onClick={async () => {
                      setInviteSending(true);
                      try {
                        await api(`/api/school/students/${student.id}/invite`, {
                          method: 'POST',
                        });
                        toast(tInvite('resentToast'), 'success');
                        void refreshStudent();
                      } catch {
                        toast(tCommon('errors.network'), 'error');
                      } finally {
                        setInviteSending(false);
                      }
                    }}
                  >
                    {tInvite('resendButton')}
                  </Button>
                </>
              )}
            </div>
            <InfoRow
              label={t('fields.fullName')}
              value={`${student.firstName} ${student.lastName}`}
            />
            <InfoRow label={t('fields.dateOfBirth')} value={fmtDate(student.dateOfBirth, bcp47)} />
            <InfoRow label={t('fields.placeOfBirth')} value={student.placeOfBirth ?? '—'} />
            <InfoRow label={t('fields.gender')} value={student.gender ?? '—'} />
            <InfoRow label={t('fields.nationality')} value={student.nationality ?? '—'} />
            <InfoRow label={t('fields.address')} value={student.address ?? '—'} />
            <InfoRow label={t('fields.enrolledAt')} value={fmtDate(student.enrolledAt, bcp47)} />
            <InfoRow
              label={t('fields.status')}
              value={studentStatusLabel(student.status, tStatus)}
              last
            />
          </Card>

          <Card className="p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
                <UserCheck size={14} className="text-primary" />
                {t('guardian')}
              </div>
              <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary">
                {t('edit')}
              </button>
            </div>
            {student.guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noGuardian')}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {student.guardians.map((g, i) => (
                  <div key={g.id ?? i} className={i > 0 ? 'border-t border-border pt-4' : ''}>
                    <div className="mb-2 flex items-center gap-2.5">
                      <Avatar name={g.name} size={36} />
                      <div>
                        <div className="text-caption font-semibold text-foreground">{g.name}</div>
                        <div className="text-xs text-muted-foreground">{g.relationship}</div>
                      </div>
                    </div>
                    <InfoRow label={t('fields.phone')} value={g.phone ?? '—'} />
                    <InfoRow label={t('fields.email')} value={g.email ?? '—'} />
                    <InfoRow label={t('fields.profession')} value={g.profession ?? '—'} last />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'grades' && results && (
        <NotesResultatsTab
          studentId={student.id}
          studentName={`${student.firstName} ${student.lastName}`}
          initial={results}
        />
      )}
      {tab === 'attendance' && <PresencesTab studentId={student.id} />}
      {tab === 'appreciations' && <AppreciationsTab studentId={student.id} />}
      {tab === 'bulletins' && <BulletinsTab studentId={student.id} />}

      {editing && (
        <StudentFormModal
          studentId={student.id}
          onClose={() => setEditing(false)}
          onSaved={() => {
            void refreshStudent();
            void refreshResults();
            void refreshAttendance();
          }}
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
