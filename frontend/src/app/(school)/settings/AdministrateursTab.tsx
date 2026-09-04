'use client';

// Paramètres › Administrateurs — Banani « Admin Settings » (rvtF-BUdU2om,
// 2026-09-04, plan .planning/banani/admin-settings.md): the members card
// (identity / account type + since / staff roles / actions), the « Gérer
// les rôles et permissions » footer link, and the dashed invite card.
// Mutations are org-role gated (ADMIN+; promote/demote OWNER only), never
// by grants — spec 2026-09-01-multi-espaces §8. The staff-roles column is
// editable by ADMIN+ viewers through a checkbox popover (a member can hold
// several roles at once, effective grants = their union); everyone else
// sees it as plain text.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useToast } from '@/contexts/ToastContext';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { LOCALE_BCP47 } from '@/lib/locales';
import { InviteMemberModal, type StaffRoleOption } from './InviteMemberModal';
import { roleLabel } from './role-label';
import type { MemberData } from './types';

interface RolesResponse {
  roles: (StaffRoleOption & {
    description: string | null;
    grants: string[];
    memberCount: number;
    updatedAt: string;
  })[];
  systemCounts: { owners: number; admins: number };
}

export function AdministrateursTab({
  members,
  myRole,
  myUserId,
  onChanged,
}: {
  members: MemberData[];
  myRole: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
  myUserId: string;
  /** Re-read /api/school after an invite, a removal or an org-role change. */
  onChanged: () => void;
}) {
  const t = useTranslations('Settings.administrateurs');
  const tAdmins = useTranslations('Permissions.adminsTab');
  const tCommon = useTranslations('Common');
  const tRoles = useTranslations('Common.roles');
  const locale = useLocale();
  const { toast } = useToast();
  const confirm = useConfirm();

  const isOwner = myRole === 'OWNER';
  const isAdminPlus = isOwner || myRole === 'ADMIN';

  // GET /api/school/roles 403s plain MEMBERs — only fetch it for viewers who
  // can actually assign a staff role, so a MEMBER browsing this tab never
  // triggers a failing request.
  const { data: rolesData } = useApi<RolesResponse>('/api/school/roles', { skip: !isAdminPlus });
  const roles = rolesData?.roles ?? [];

  const [rows, setRows] = useState(members);
  // The parent re-reads /api/school after each mutation (onChanged): follow it.
  useEffect(() => {
    setRows(members);
  }, [members]);
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  function fmt(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(LOCALE_BCP47[locale], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  function displayName(m: MemberData): string {
    return m.name ?? m.email;
  }
  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.code === 'MEMBER_IS_TEACHER') return t('actions.cannotRemoveTeacher');
      return err.message;
    }
    return tCommon('errors.network');
  }

  async function handleRolesChange(userId: string, staffRoleIds: string[]) {
    const previous = rows.find((m) => m.userId === userId)?.staffRoleIds;
    setSavingIds((prev) => new Set(prev).add(userId));
    // Optimistic: apply immediately so a rapid second toggle reads the new
    // value off `rows` rather than a stale prop (lost-update race — the
    // popover stays interactive while a PATCH is in flight for another row,
    // and `disabled` on this row only blocks further clicks here).
    setRows((prev) => prev.map((m) => (m.userId === userId ? { ...m, staffRoleIds } : m)));
    try {
      await api(`/api/school/members/${userId}`, {
        method: 'PATCH',
        body: { staffRoleIds },
      });
      toast(tAdmins('roleUpdated'), 'success');
    } catch (err) {
      if (previous) {
        setRows((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, staffRoleIds: previous } : m)),
        );
      }
      toast(errorMessage(err), 'error');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  async function run(userId: string, action: () => Promise<unknown>, successMessage: string) {
    setBusyId(userId);
    try {
      await action();
      toast(successMessage, 'success');
      onChanged();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(m: MemberData) {
    const ok = await confirm({
      title: t('actions.removeTitle'),
      message: t('actions.removeBody', { name: displayName(m) }),
      confirmLabel: t('actions.remove'),
      danger: true,
    });
    if (!ok) return;
    await run(
      m.userId,
      () => api(`/api/school/members/${m.userId}`, { method: 'DELETE' }),
      t('actions.removed'),
    );
  }

  async function changeRole(m: MemberData, role: 'ADMIN' | 'MEMBER') {
    const promote = role === 'ADMIN';
    const ok = await confirm({
      title: t(promote ? 'actions.promoteTitle' : 'actions.demoteTitle'),
      message: t(promote ? 'actions.promoteBody' : 'actions.demoteBody', {
        name: displayName(m),
      }),
      confirmLabel: t(promote ? 'actions.promote' : 'actions.demote'),
    });
    if (!ok) return;
    await run(
      m.userId,
      () => api(`/api/school/members/${m.userId}`, { method: 'PATCH', body: { role } }),
      t(promote ? 'actions.promoted' : 'actions.demoted'),
    );
  }

  async function resend(m: MemberData) {
    await run(
      m.userId,
      () => api(`/api/school/members/${m.userId}/invite`, { method: 'POST' }),
      t('actions.resent'),
    );
  }

  function canRemove(m: MemberData): boolean {
    return (
      isAdminPlus &&
      m.role !== 'OWNER' &&
      m.userId !== myUserId &&
      !m.isTeacher &&
      (isOwner || m.role === 'MEMBER')
    );
  }

  function menuItems(m: MemberData): ActionMenuItem[] {
    const items: ActionMenuItem[] = [];
    if (m.status === 'INVITED') {
      items.push({
        label: t('actions.resend'),
        icon: <RefreshCw size={14} />,
        onClick: () => void resend(m),
      });
    }
    if (isOwner && m.role === 'MEMBER' && m.userId !== myUserId) {
      items.push({
        label: t('actions.promote'),
        icon: <ArrowUpCircle size={14} />,
        onClick: () => void changeRole(m, 'ADMIN'),
      });
    }
    if (isOwner && m.role === 'ADMIN') {
      items.push({
        label: t('actions.demote'),
        icon: <ArrowDownCircle size={14} />,
        onClick: () => void changeRole(m, 'MEMBER'),
      });
    }
    if (canRemove(m)) {
      items.push({
        label: t('actions.remove'),
        icon: <Trash2 size={14} />,
        onClick: () => void remove(m),
        tone: 'danger',
        divider: true,
      });
    }
    return items;
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-caption font-bold text-foreground">{t('title')}</h2>
            <p className="text-2xs text-muted-foreground">{t('description')}</p>
          </div>
          {isAdminPlus && (
            <Button
              type="button"
              size="sm"
              className="w-full shrink-0 sm:w-fit"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus size={14} />
              {t('inviteButton')}
            </Button>
          )}
        </div>

        <div className="flex flex-col divide-y divide-border">
          {rows.map((m) => {
            const isFullAccess = m.role === 'OWNER' || m.role === 'ADMIN';
            const saving = savingIds.has(m.userId);
            const busy = busyId === m.userId;
            const items = isAdminPlus ? menuItems(m) : [];

            return (
              <div
                key={m.userId}
                className={`grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_150px_230px_84px] lg:items-center lg:gap-4 ${busy ? 'opacity-60' : ''}`}
                aria-busy={busy}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={displayName(m)} size={38} src={m.avatarUrl} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {displayName(m)}
                      </span>
                      {m.userId === myUserId && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {t('you')}
                        </span>
                      )}
                    </div>
                    {/* An account without a display name is already shown by its
                        email above: don't print it twice. */}
                    {m.name && (
                      <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 lg:flex-col lg:items-start lg:gap-1">
                  <Badge tone={m.role === 'MEMBER' ? 'muted' : 'primary'}>
                    {roleLabel(m.role, tRoles)}
                  </Badge>
                  {m.status === 'INVITED' && <Badge tone="warning">{t('status.invited')}</Badge>}
                  <span className="text-[11px] text-muted-foreground">
                    {t('since', { date: fmt(m.joinedAt) })}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {tAdmins('roleColumn')}
                  </span>
                  {isFullAccess ? (
                    <span className="text-sm font-medium text-foreground">
                      {tAdmins('fullAccess')}
                    </span>
                  ) : isAdminPlus ? (
                    <MultiSelect
                      options={roles.map((r) => ({ id: r.id, label: r.name }))}
                      value={m.staffRoleIds}
                      onChange={(ids) => void handleRolesChange(m.userId, ids)}
                      disabled={saving || busy}
                      ariaLabel={tAdmins('roleColumn')}
                      placeholder={tAdmins('noRolePlaceholder')}
                      searchPlaceholder={tAdmins('searchRoles')}
                      emptyLabel={tAdmins('noRoleResults')}
                      className="w-full"
                    />
                  ) : (
                    <span className="text-sm font-medium text-foreground">
                      {m.staffRoleIds.length > 0 ? tAdmins('roleAssigned') : tAdmins('noRole')}
                    </span>
                  )}
                  {m.isTeacher && !isFullAccess && (
                    <span className="w-fit rounded-full bg-info px-2 py-0.5 text-2xs font-semibold text-info-foreground">
                      {tAdmins('teacherBadge')}
                    </span>
                  )}
                </div>

                {isAdminPlus && (
                  <div className="flex items-center justify-end gap-1">
                    {canRemove(m) && (
                      <button
                        type="button"
                        aria-label={t('actions.remove')}
                        title={t('actions.remove')}
                        disabled={busy}
                        onClick={() => void remove(m)}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-destructive-foreground outline-none hover:bg-destructive disabled:opacity-50 lg:h-7 lg:w-7"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                    {items.length > 0 && <ActionMenu items={items} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isAdminPlus && (
          <Link
            href="/settings/permissions"
            className="flex items-center gap-2 border-t border-border px-5 py-3.5 text-[13px] font-semibold text-primary hover:bg-muted/60"
          >
            <ShieldCheck size={16} />
            {tAdmins('manageLink')}
            <ArrowRight size={14} />
          </Link>
        )}
      </Card>

      {isAdminPlus && (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-muted px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">{t('inviteCard.title')}</div>
            <p className="text-xs text-muted-foreground">{t('inviteCard.description')}</p>
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full shrink-0 sm:w-fit"
            onClick={() => setInviteOpen(true)}
          >
            <Send size={14} />
            {t('inviteCard.cta')}
          </Button>
        </div>
      )}

      {inviteOpen && (
        <InviteMemberModal
          roles={roles}
          canInviteAdmin={isOwner}
          onClose={() => setInviteOpen(false)}
          onInvited={onChanged}
        />
      )}
    </div>
  );
}
