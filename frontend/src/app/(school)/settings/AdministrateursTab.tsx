'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { LOCALE_BCP47 } from '@/lib/locales';
import { roleLabel } from './role-label';
import type { MemberData } from './types';

const NO_ROLE_VALUE = '';

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
// staff-role column is editable by ADMIN+ viewers (assigns/clears a
// member's StaffRole); everyone else sees it as plain text.
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

  async function handleRoleChange(userId: string, value: string) {
    const staffRoleId = value === NO_ROLE_VALUE ? null : value;
    setSavingIds((prev) => new Set(prev).add(userId));
    try {
      await api(`/api/school/members/${userId}`, {
        method: 'PATCH',
        body: { staffRoleId },
      });
      setRows((prev) => prev.map((m) => (m.userId === userId ? { ...m, staffRoleId } : m)));
      toast(tAdmins('roleUpdated'), 'success');
    } catch (err) {
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
              <div className="flex w-full shrink-0 flex-col gap-1 sm:w-48">
                <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {tAdmins('roleColumn')}
                </span>
                {isFullAccess ? (
                  <span className="text-xs font-medium text-foreground">
                    {tAdmins('fullAccess')}
                  </span>
                ) : isAdminPlus ? (
                  <FilterSelect
                    value={m.staffRoleId ?? NO_ROLE_VALUE}
                    onValueChange={(v) => void handleRoleChange(m.userId, v)}
                    disabled={saving}
                    ariaLabel={tAdmins('roleColumn')}
                    className="w-full"
                  >
                    <SelectItem value={NO_ROLE_VALUE}>{tAdmins('noRole')}</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </FilterSelect>
                ) : (
                  <span className="text-xs font-medium text-foreground">
                    {m.staffRoleId !== null ? tAdmins('roleAssigned') : tAdmins('noRole')}
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
