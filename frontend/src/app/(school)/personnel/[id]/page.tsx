'use client';

// Unified Personnel fiche (/personnel/[id]) — spec
// docs/superpowers/specs/2026-09-04-personnel-module-design.md §6.3.
// Header (avatar, name, profile badges, account status, login mode, "Donner
// un accès…" buttons) is new, governed by the Banani mockup
// (.planning/banani/fetches/personnel-module/personnel-fiche.html). The
// Infos + Enseignement tab BODIES are the old /enseignants/[id] fiche's
// exact tab bodies, extracted verbatim into TeacherInfoTab/
// TeacherAssignmentsTab and consuming the SAME `GET /api/school/teachers/
// [id]` endpoint, unchanged — no regression (the one non-negotiable
// acceptance criterion on this task). Accès & rôles and Compte are new tabs.
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Calendar,
  Hash,
  KeyRound,
  Link as LinkIcon,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  User as UserIcon,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePermissions } from '@/lib/usePermissions';
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { useUser } from '@/contexts/AuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useToast } from '@/contexts/ToastContext';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { LOCALE_BCP47 } from '@/lib/locales';
import { TeacherFormModal } from '../../enseignants/TeacherFormModal';
import { teacherStatusLabel } from '../../enseignants/status-label';
import { TeacherInfoTab } from './TeacherInfoTab';
import { TeacherAssignmentsTab } from './TeacherAssignmentsTab';
import { AccesRolesTab } from './AccesRolesTab';
import { CompteTab } from './CompteTab';
import type { PersonnelAccountStatus, PersonnelLoginMode } from '../types';
import type { PersonnelDetailResponse, TeacherWithAccess } from './types';

const STATUS_DOT: Record<'ACTIVE' | 'ON_LEAVE' | 'INACTIVE', string> = {
  ACTIVE: '#16A34A',
  ON_LEAVE: '#F59E0B',
  INACTIVE: '#9CA3AF',
};

const ACCOUNT_STATUS_TONE: Record<PersonnelAccountStatus, BadgeTone> = {
  NONE: 'muted',
  PENDING: 'warning',
  ACTIVE: 'success',
};

type TabKey = 'info' | 'assignments' | 'access' | 'compte';

function fmtDate(d: string, locale: string): string {
  return new Date(d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Same hero-card stat tile the old /enseignants/[id] fiche used (subjects /
// classes / weekly hours) — kept verbatim so a teacher's fiche shows the
// exact same at-a-glance numbers as before, not just the raw table.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-xl leading-none font-bold text-foreground">{value}</div>
      <div className="text-center text-2xs text-muted-foreground">{label}</div>
    </div>
  );
}

function LoginModeChip({ mode, label }: { mode: PersonnelLoginMode; label: string | null }) {
  if (mode === null || label === null) return null;
  const Icon = mode === 'USERNAME' ? UserIcon : Mail;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
      <Icon size={12} />
      {label}
    </span>
  );
}

export default function PersonnelFichePage() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const t = useTranslations('Personnel');
  const tEns = useTranslations('Enseignants.profile');
  const tStatus = useTranslations('Enseignants.status');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const { toast } = useToast();
  const confirm = useConfirm();
  const { can, canSee } = usePermissions();
  const { role: schoolRole } = useSchoolPlan();
  const isAdminPlus = schoolRole === 'OWNER' || schoolRole === 'ADMIN';
  const isOwner = schoolRole === 'OWNER';

  // Literal per-branch t() calls (not a template literal key) — next-intl's
  // namespaced key type rejects a templated `list.accountStatus.${string}`.
  const accountStatusLabel: Record<PersonnelAccountStatus, string> = {
    NONE: t('list.accountStatus.none'),
    PENDING: t('list.accountStatus.pending'),
    ACTIVE: t('list.accountStatus.active'),
  };
  const loginModeLabel: Record<'EMAIL' | 'USERNAME' | 'BOTH', string> = {
    EMAIL: t('list.loginMode.email'),
    USERNAME: t('list.loginMode.username'),
    BOTH: t('list.loginMode.both'),
  };

  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<TabKey | null>(null);
  const [grantBusy, setGrantBusy] = useState<'teacher' | 'staff' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { data: personnelData, refresh: refreshPersonnel } = useApi<PersonnelDetailResponse>(
    `/api/school/personnel/${params.id}`,
    {
      skip: !user,
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return true;
        }
        setLoadError(
          err instanceof ApiError && err.status === 404 ? t('fiche.notFound') : tEns('loadError'),
        );
        return true;
      },
    },
  );
  const personnel = personnelData?.personnel ?? null;
  useEffect(() => {
    if (personnelData) setLoadError(null);
  }, [personnelData]);

  const needsTeacherDetail = !!(personnel && personnel.teacher != null);
  const { data: teacherData, refresh: refreshTeacher } = useApi<{ teacher: TeacherWithAccess }>(
    `/api/school/teachers/${params.id}`,
    { skip: !user || !needsTeacherDetail },
  );
  const teacher = needsTeacherDetail ? (teacherData?.teacher ?? null) : null;

  const hasTeacher = personnel?.teacher != null;
  const hasOrgMember = personnel?.organizationMember != null;
  const canSeeAccesRoles = hasOrgMember && isAdminPlus;
  // NOT re-derived from `hasTeacher`/`hasOrgMember` — a non-ADMIN+ caller
  // never sees the real `organizationMember` for a genuine staff person
  // (route.ts nulls it), so "no staff profile" can't be inferred from
  // "organizationMember is null" without wrongly re-granting Compte access
  // for a double-profile person. `canManageAccount` is the route's own
  // authorization decision, mirrored back verbatim.
  const canSeeCompte = personnelData?.canManageAccount === true;

  // Gated on `personnel` having loaded: `canSeeCompte` alone can already be
  // true from `isAdminPlus` before the fetch resolves (schoolRole often
  // arrives from SchoolPlanContext's warm cache before this page's own
  // data does), which would otherwise produce a transient tabs=['compte']
  // and lock the default-tab effect below onto Compte instead of Infos the
  // moment the real data (with a teacher profile) lands.
  const tabs: { key: TabKey; label: string; icon: typeof UserCheck }[] = personnel
    ? [
        ...(hasTeacher
          ? [
              { key: 'info' as const, label: tEns('tabs.info'), icon: UserCheck },
              { key: 'assignments' as const, label: tEns('tabs.assignments'), icon: BookOpen },
            ]
          : []),
        ...(canSeeAccesRoles
          ? [{ key: 'access' as const, label: t('fiche.tabs.access'), icon: ShieldCheck }]
          : []),
        ...(canSeeCompte
          ? [{ key: 'compte' as const, label: t('fiche.tabs.compte'), icon: KeyRound }]
          : []),
      ]
    : [];
  const tabsKey = tabs.map((tb) => tb.key).join('|');

  useEffect(() => {
    if (tabs.length === 0) return;
    if (tab === null || !tabs.some((tb) => tb.key === tab)) {
      setTab(tabs[0]!.key);
    }
    // Deliberately keyed on `tabsKey` (a stable string) rather than `tabs`
    // (a new array identity every render) or `tab` (would refire on every
    // manual tab switch) — only re-derive the default when the *set* of
    // visible tabs actually changes. This project's eslint config has no
    // react-hooks plugin registered, so no exhaustive-deps suppression is
    // needed (or accepted) here.
  }, [tabsKey]);

  if (!canSee('enseignants')) return <AccessDenied />;

  if (!user || (personnel === null && !loadError)) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-40 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
        <Card className="gap-4 p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        </Card>
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError || !personnel) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/personnel"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('fiche.backToList')}
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {loadError}
        </p>
      </div>
    );
  }

  const displayName = teacher
    ? [teacher.civility, teacher.name].filter(Boolean).join(' ')
    : personnel.name;

  const showGiveTeachingAccess =
    personnel.userId != null && personnel.teacher == null && can('enseignants', 'create');
  const showGiveManagementAccess =
    personnel.userId != null && personnel.organizationMember == null && isAdminPlus;

  async function giveTeachingAccess() {
    const ok = await confirm({
      title: t('fiche.header.confirmTeachingTitle'),
      message: t('fiche.header.confirmTeachingBody', { name: personnel!.name }),
      confirmLabel: t('fiche.header.confirmTeachingButton'),
    });
    if (!ok) return;
    setGrantBusy('teacher');
    try {
      await api(`/api/school/personnel/${params.id}/profiles`, {
        method: 'POST',
        body: { profile: 'teacher' },
      });
      toast(t('fiche.header.teachingGranted'), 'success');
      void refreshPersonnel();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tEns('loadError'), 'error');
    } finally {
      setGrantBusy(null);
    }
  }

  async function giveManagementAccess() {
    const ok = await confirm({
      title: t('fiche.header.confirmManagementTitle'),
      message: t('fiche.header.confirmManagementBody', { name: personnel!.name }),
      confirmLabel: t('fiche.header.confirmManagementButton'),
    });
    if (!ok) return;
    setGrantBusy('staff');
    try {
      await api(`/api/school/personnel/${params.id}/profiles`, {
        method: 'POST',
        body: { profile: 'staff', role: 'MEMBER', staffRoleIds: [] },
      });
      toast(t('fiche.header.managementGranted'), 'success');
      void refreshPersonnel();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tEns('loadError'), 'error');
    } finally {
      setGrantBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/personnel"
          className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('fiche.backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {hasTeacher && (
            <Link
              href="/configuration/matieres"
              className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground"
            >
              <LinkIcon size={14} />
              {tEns('manageAssignments')}
            </Link>
          )}
          {showGiveTeachingAccess && (
            <Button
              variant="outline"
              className="w-fit"
              loading={grantBusy === 'teacher'}
              onClick={() => void giveTeachingAccess()}
            >
              <UserPlus size={14} />
              {t('fiche.header.giveTeachingAccess')}
            </Button>
          )}
          {showGiveManagementAccess && (
            <Button
              variant="outline"
              className="w-fit"
              loading={grantBusy === 'staff'}
              onClick={() => void giveManagementAccess()}
            >
              <UserPlus size={14} />
              {t('fiche.header.giveManagementAccess')}
            </Button>
          )}
          {hasTeacher && (
            <Button className="w-fit" onClick={() => setEditing(true)}>
              <Pencil size={14} />
              {tEns('editProfile')}
            </Button>
          )}
        </div>
      </div>

      <Card className="gap-4 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="relative shrink-0">
              <div className="rounded-full border-[3px] border-card shadow-lg">
                <Avatar
                  name={displayName}
                  size={80}
                  src={teacher?.photoUrl ?? personnel.avatarUrl}
                />
              </div>
              {teacher && (
                <div
                  className="absolute right-1 bottom-1 h-3.5 w-3.5 rounded-full border-2 border-card"
                  style={{ background: STATUS_DOT[teacher.status] }}
                />
              )}
            </div>
            <div>
              <div className="text-xl font-bold text-foreground">{displayName}</div>
              {teacher && (
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
                      {tEns('sinceDate', { date: fmtDate(teacher.hiredAt, bcp47) })}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {teacher && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_DOT[teacher.status] }}
                    />
                    {teacherStatusLabel(teacher.status, tStatus)}
                  </span>
                )}
                {personnel.profiles.includes('TEACHER') && (
                  <Badge tone="primary">{t('list.profileBadge.teacher')}</Badge>
                )}
                {personnel.profiles.includes('ADMIN') && (
                  <Badge tone="gold">{t('list.profileBadge.admin')}</Badge>
                )}
                {personnel.profiles.includes('MEMBER') &&
                  personnel.staffRoleNames.map((name) => (
                    <Badge key={name} tone="muted">
                      {name}
                    </Badge>
                  ))}
                <Badge tone={ACCOUNT_STATUS_TONE[personnel.accountStatus]}>
                  {accountStatusLabel[personnel.accountStatus]}
                </Badge>
                <LoginModeChip
                  mode={personnel.loginMode}
                  label={personnel.loginMode ? loginModeLabel[personnel.loginMode] : null}
                />
              </div>
            </div>
          </div>
          {teacher && (
            <div className="flex items-center gap-5 sm:gap-6">
              <Stat label={tEns('stats.subjects')} value={String(teacher.subjects.length)} />
              <div className="h-9 w-px bg-border" />
              <Stat label={tEns('stats.classes')} value={String(teacher.classes.length)} />
              <div className="h-9 w-px bg-border" />
              <Stat label={tEns('stats.weeklyHours')} value={`${teacher.weeklyHours} h`} />
            </div>
          )}
        </div>
      </Card>

      {tabs.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">{t('fiche.noTabAccess')}</p>
        </Card>
      ) : (
        <>
          <div role="tablist" className="flex w-fit gap-1 overflow-x-auto rounded-lg bg-card p-1">
            {tabs.map((tabItem) => {
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

          {tab === 'info' && teacher && (
            <TeacherInfoTab
              teacher={teacher}
              onEdit={() => setEditing(true)}
              onReload={() => void refreshTeacher()}
            />
          )}
          {tab === 'assignments' && teacher && <TeacherAssignmentsTab teacher={teacher} />}
          {tab === 'access' && personnel.organizationMember && personnel.userId && (
            <AccesRolesTab
              userId={personnel.userId}
              name={personnel.name}
              role={personnel.organizationMember.role}
              staffRoleIds={personnel.organizationMember.staffRoleIds}
              isOwner={isOwner}
              onChanged={() => void refreshPersonnel()}
            />
          )}
          {tab === 'compte' && (
            <CompteTab
              userId={personnel.userId}
              name={personnel.name}
              accountStatus={personnel.accountStatus}
              email={personnel.email}
              username={personnel.username}
              onChanged={() => void refreshPersonnel()}
            />
          )}
        </>
      )}

      {editing && teacher && (
        <TeacherFormModal
          teacherId={teacher.id}
          onClose={() => setEditing(false)}
          onSaved={() => void refreshTeacher()}
        />
      )}
    </div>
  );
}
