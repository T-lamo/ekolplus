'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { LOCALE_BCP47 } from '@/lib/locales';
import { roleLabel } from './role-label';
import type { MemberData } from './types';

interface StaffRole {
  id: string;
  name: string;
  description: string | null;
  grants: string[];
  memberCount: number;
  updatedAt: string;
}

interface RolesResponse {
  roles: StaffRole[];
  systemCounts: { owners: number; admins: number };
}

// Add/remove is an invite flow, deferred (see school-settings.md). The
// staff-roles column is editable by ADMIN+ viewers via a checkbox popover
// (a member can hold several roles at once, effective grants = their
// union — multi-espaces 2026-09-01); everyone else sees it as plain text.
export function AdministrateursTab({
  members,
  myRole,
}: {
  members: MemberData[];
  myRole: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
}) {
  const t = useTranslations('Settings.administrateurs');
  const tAdmins = useTranslations('Permissions.adminsTab');
  const tCommon = useTranslations('Common');
  const tRoles = useTranslations('Common.roles');
  const locale = useLocale();
  const { toast } = useToast();

  const isAdminPlus = myRole === 'OWNER' || myRole === 'ADMIN';

  // GET /api/school/roles 403s plain MEMBERs — only fetch it for viewers who
  // can actually assign a staff role, so a MEMBER browsing this tab never
  // triggers a failing request.
  const { data: rolesData } = useApi<RolesResponse>('/api/school/roles', { skip: !isAdminPlus });
  const roles = rolesData?.roles ?? [];

  const [rows, setRows] = useState(members);
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set());

  function fmt(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(LOCALE_BCP47[locale], {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
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
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-caption font-bold text-foreground">{t('title')}</h2>
        <p className="text-2xs text-muted-foreground">{t('description')}</p>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {rows.map((m) => {
          const isFullAccess = m.role === 'OWNER' || m.role === 'ADMIN';
          const saving = savingIds.has(m.userId);

          return (
            <div
              key={m.userId}
              className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 sm:flex-1">
                <div className="truncate text-sm font-semibold text-foreground">
                  {m.name ?? m.email}
                </div>
                <div className="truncate text-xs text-muted-foreground">{m.email}</div>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-0.5 sm:items-end">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
                  {roleLabel(m.role, tRoles)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {t('since', { date: fmt(m.joinedAt) })}
                </span>
              </div>
              <div className="flex w-full shrink-0 flex-col gap-1 sm:w-56">
                <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {tAdmins('roleColumn')}
                </span>
                {isFullAccess ? (
                  <span className="text-xs font-medium text-foreground">
                    {tAdmins('fullAccess')}
                  </span>
                ) : isAdminPlus ? (
                  <MultiSelect
                    options={roles.map((r) => ({ id: r.id, label: r.name }))}
                    value={m.staffRoleIds}
                    onChange={(ids) => void handleRolesChange(m.userId, ids)}
                    disabled={saving}
                    ariaLabel={tAdmins('roleColumn')}
                    placeholder={tAdmins('noRolePlaceholder')}
                    searchPlaceholder={tAdmins('searchRoles')}
                    emptyLabel={tAdmins('noRoleResults')}
                    className="w-full"
                  />
                ) : (
                  <span className="text-xs font-medium text-foreground">
                    {m.staffRoleIds.length > 0 ? tAdmins('roleAssigned') : tAdmins('noRole')}
                  </span>
                )}
                {m.isTeacher && !isFullAccess && (
                  <span className="w-fit rounded-full bg-info px-2 py-0.5 text-2xs font-semibold text-info-foreground">
                    {tAdmins('teacherBadge')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {isAdminPlus && (
        <div className="border-t border-border px-5 py-3.5">
          <Link
            href="/settings/permissions"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            {tAdmins('manageLink')}
            <ChevronRight size={14} />
          </Link>
        </div>
      )}
    </Card>
  );
}
