'use client';

// Pure presentational table for the Personnel list (/personnel) — Banani
// source: .planning/banani/fetches/personnel-module/personnel-list.html
// (sidebar/topbar chrome discarded, only the table is reproduced here).
// No data fetching: the parent page owns the API call, filters and paging;
// this component only renders the rows it's given and navigates to a
// person's fiche on "Voir le profil".
import type { ReactNode } from 'react';
import { Eye, Mail, Minus, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Card } from '@/components/ui/Card';
import { STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import type { PersonnelAccountStatus, PersonnelLoginMode, PersonnelRow } from './types';

const ACCOUNT_STATUS_TONE: Record<PersonnelAccountStatus, BadgeTone> = {
  NONE: 'muted',
  PENDING: 'warning',
  ACTIVE: 'success',
};

// Fixed colors for the two structural profiles — matches Banani's
// .badge-enseignant / .badge-admin exactly. Staff role names are free text
// (schools name their own roles via /settings/permissions), so they get a
// deterministic color instead: a handful of known French role names match
// Banani's demo palette, anything else cycles through a small fallback set
// — same pattern as lib/subject-visuals.ts for subject badges.
const TEACHER_BADGE = { bg: '#F1EEFF', fg: '#5B56D6' };
const ADMIN_BADGE = { bg: '#FFF3CC', fg: '#B7791F' };
const KNOWN_ROLE_BADGES: Record<string, { bg: string; fg: string }> = {
  comptable: { bg: '#E8FBF0', fg: '#0F9F62' },
  rh: { bg: '#FEEAEC', fg: '#D44A57' },
  surveillant: { bg: '#ECFBF1', fg: '#16A34A' },
  secrétaire: { bg: '#EBF3FF', fg: '#2563EB' },
  secretaire: { bg: '#EBF3FF', fg: '#2563EB' },
};
const FALLBACK_ROLE_BADGES = [
  { bg: '#E8FBF0', fg: '#0F9F62' },
  { bg: '#FEEAEC', fg: '#D44A57' },
  { bg: '#ECFBF1', fg: '#16A34A' },
  { bg: '#EBF3FF', fg: '#2563EB' },
  { bg: '#FDF0F5', fg: '#DB2777' },
  { bg: '#EEF8FF', fg: '#0284C7' },
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

function roleBadgeVisual(name: string): { bg: string; fg: string } {
  const known = KNOWN_ROLE_BADGES[name.trim().toLowerCase()];
  if (known) return known;
  return FALLBACK_ROLE_BADGES[hashString(name) % FALLBACK_ROLE_BADGES.length]!;
}

function ProfileBadge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-semibold whitespace-nowrap"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

function StatusBadge({
  status,
  label,
  title,
}: {
  status: PersonnelAccountStatus;
  label: string;
  title?: string | undefined;
}) {
  return (
    <Badge tone={ACCOUNT_STATUS_TONE[status]} {...(title ? { title } : {})}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-90" aria-hidden="true" />
      {label}
    </Badge>
  );
}

function LoginModeCell({ mode, labels }: { mode: PersonnelLoginMode; labels: LoginModeLabels }) {
  if (mode === 'EMAIL') {
    return <ConnexionCell icon={<Mail size={14} />}>{labels.email}</ConnexionCell>;
  }
  if (mode === 'USERNAME') {
    return <ConnexionCell icon={<User size={14} />}>{labels.username}</ConnexionCell>;
  }
  if (mode === 'BOTH') {
    return <ConnexionCell icon={<Mail size={14} />}>{labels.both}</ConnexionCell>;
  }
  return <ConnexionCell icon={<Minus size={14} />}>{'—'}</ConnexionCell>;
}

interface LoginModeLabels {
  email: string;
  username: string;
  both: string;
}

function ConnexionCell({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

function Th({ children, align = 'left' }: { children?: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}

export function PersonnelTable({ rows }: { rows: PersonnelRow[] }) {
  const t = useTranslations('Personnel.list');
  const router = useRouter();
  const loginLabels: LoginModeLabels = {
    email: t('loginMode.email'),
    username: t('loginMode.username'),
    both: t('loginMode.both'),
  };
  const statusLabel: Record<PersonnelAccountStatus, string> = {
    NONE: t('accountStatus.none'),
    PENDING: t('accountStatus.pending'),
    ACTIVE: t('accountStatus.active'),
  };

  return (
    <Card className="overflow-hidden">
      <div className={TABLE_SCROLL}>
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className={STICKY_THEAD}>
            <tr className="border-b border-border">
              <Th>{t('table.name')}</Th>
              <Th>{t('table.profiles')}</Th>
              <Th>{t('table.account')}</Th>
              <Th>{t('table.login')}</Th>
              <Th align="right">{t('table.actions')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-none">
                <td className="px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={row.name} size={36} src={row.avatarUrl} />
                    <div className="min-w-0 truncate font-semibold text-foreground">{row.name}</div>
                  </div>
                </td>
                <td className="px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.profiles.includes('TEACHER') && (
                      <ProfileBadge
                        label={t('profileBadge.teacher')}
                        bg={TEACHER_BADGE.bg}
                        fg={TEACHER_BADGE.fg}
                      />
                    )}
                    {row.profiles.includes('ADMIN') && (
                      <ProfileBadge
                        label={t('profileBadge.admin')}
                        bg={ADMIN_BADGE.bg}
                        fg={ADMIN_BADGE.fg}
                      />
                    )}
                    {row.profiles.includes('MEMBER') &&
                      row.staffRoleNames.map((name) => {
                        const visual = roleBadgeVisual(name);
                        return (
                          <ProfileBadge key={name} label={name} bg={visual.bg} fg={visual.fg} />
                        );
                      })}
                  </div>
                </td>
                <td className="px-3.5 py-2.5">
                  <StatusBadge
                    status={row.accountStatus}
                    label={statusLabel[row.accountStatus]}
                    title={
                      row.accountStatus === 'PENDING' ? t('accountStatus.pendingFull') : undefined
                    }
                  />
                </td>
                <td className="px-3.5 py-2.5">
                  <LoginModeCell mode={row.loginMode} labels={loginLabels} />
                </td>
                <td className="px-3.5 py-2.5">
                  <div className="flex justify-end">
                    <ActionMenu
                      items={[
                        {
                          label: t('menu.viewProfile'),
                          icon: <Eye size={14} />,
                          onClick: () => router.push(`/personnel/${row.id}`),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
