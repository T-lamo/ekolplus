'use client';

// Onglet "Accès & rôles" (spec 2026-09-04-personnel-module-design.md §6.3) —
// new tab, genuinely governed by the Banani fiche mockup
// (.planning/banani/fetches/personnel-module/personnel-fiche.html). Lifts
// the role Select + staff-roles MultiSelect straight out of
// AdministrateursTab.tsx/InviteMemberModal.tsx (same PATCH endpoint, same
// role-rank rules), adds a read-only "résumé des droits" panel driven by
// the shared permissions registry. Only ever rendered by the shell for an
// ADMIN+ caller viewing a person who genuinely holds an OrganizationMember
// (never the OWNER's own row — see personnel/view.ts's genuineMemberProfile,
// which excludes the OWNER from ever surfacing an organizationMember block).
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Select, SelectItem } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { PERMISSION_ACTIONS, PERMISSION_MODULES, type PermissionAction } from '@/lib/permissions';

interface StaffRoleOption {
  id: string;
  name: string;
}
interface RolesResponse {
  roles: (StaffRoleOption & { grants: string[] })[];
}

// Literal-union value type (mirrors settings/permissions/PermissionMatrix.tsx's
// own ACTION_LABEL_KEY) — a `Record<string, string>` widens the template
// literal `t(\`matrix.${...}\`)` below to a plain `string`, which next-intl's
// namespaced key type rejects.
const ACTION_LABEL_KEY: Record<
  PermissionAction,
  'view' | 'create' | 'editAction' | 'deleteAction' | 'export'
> = {
  view: 'view',
  create: 'create',
  edit: 'editAction',
  delete: 'deleteAction',
  export: 'export',
};

export function AccesRolesTab({
  userId,
  name,
  role,
  staffRoleIds,
  isOwner,
  onChanged,
}: {
  userId: string;
  name: string;
  role: 'ADMIN' | 'MEMBER';
  staffRoleIds: string[];
  /** OWNER only: an ADMIN may never promote someone else to Administrateur. */
  isOwner: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations('Personnel.fiche.accesRoles');
  const tModal = useTranslations('Settings.administrateurs.modal');
  const tAdmins = useTranslations('Permissions.adminsTab');
  const tActions = useTranslations('Settings.administrateurs.actions');
  const tPerm = useTranslations('Permissions');
  const tCommon = useTranslations('Common');
  const { toast } = useToast();
  const confirm = useConfirm();

  const { data, loading: rolesLoading } = useApi<RolesResponse>('/api/school/roles');
  const roles = data?.roles ?? [];
  // True only for the very first fetch of this session (no stale-while-
  // revalidate cache yet) — guards the MultiSelect and the "résumé des
  // droits" panel below, both of which cross-reference `localStaffRoleIds`
  // (already known from the personnel payload) against `roles` (this
  // separate, slower fetch). Rendering with `roles` still empty would show
  // a false "Aucun rôle (aucun accès)" for someone who genuinely has role(s)
  // assigned, on the one tab this task's spec singles out as
  // authorization-adjacent — worth a real loading guard, not just a flicker.
  const rolesReady = data != null || !rolesLoading;

  const [localRole, setLocalRole] = useState(role);
  const [localStaffRoleIds, setLocalStaffRoleIds] = useState(staffRoleIds);
  const [savingRole, setSavingRole] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);

  useEffect(() => {
    setLocalRole(role);
    setLocalStaffRoleIds(staffRoleIds);
  }, [role, staffRoleIds]);

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    return tCommon('errors.network');
  }

  async function changeRole(next: 'ADMIN' | 'MEMBER') {
    if (next === localRole) return;
    const promote = next === 'ADMIN';
    const ok = await confirm({
      title: tActions(promote ? 'promoteTitle' : 'demoteTitle'),
      message: tActions(promote ? 'promoteBody' : 'demoteBody', { name }),
      confirmLabel: tActions(promote ? 'promote' : 'demote'),
    });
    if (!ok) return;
    const previous = localRole;
    setLocalRole(next);
    setSavingRole(true);
    try {
      await api(`/api/school/members/${userId}`, { method: 'PATCH', body: { role: next } });
      toast(tActions(promote ? 'promoted' : 'demoted'), 'success');
      onChanged();
    } catch (err) {
      setLocalRole(previous);
      toast(errorMessage(err), 'error');
    } finally {
      setSavingRole(false);
    }
  }

  async function changeStaffRoles(next: string[]) {
    const previous = localStaffRoleIds;
    setLocalStaffRoleIds(next);
    setSavingRoles(true);
    try {
      await api(`/api/school/members/${userId}`, { method: 'PATCH', body: { staffRoleIds: next } });
      toast(tAdmins('roleUpdated'), 'success');
      onChanged();
    } catch (err) {
      setLocalStaffRoleIds(previous);
      toast(errorMessage(err), 'error');
    } finally {
      setSavingRoles(false);
    }
  }

  const isFullAccess = localRole === 'ADMIN';
  const selectedRoles = roles.filter((r) => localStaffRoleIds.includes(r.id));
  const effectiveGrants = new Set(selectedRoles.flatMap((r) => r.grants));
  const moduleSummaries = isFullAccess
    ? []
    : PERMISSION_MODULES.map((m) => ({
        key: m.key,
        actions: PERMISSION_ACTIONS.filter((a) => effectiveGrants.has(`${m.key}.${a}`)),
      })).filter((m) => m.actions.length > 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <div className="mb-3.5 text-caption font-semibold text-foreground">
            {t('sectionTitle')}
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Select
                label={tModal('roleLabel')}
                value={localRole}
                disabled={savingRole}
                onValueChange={(v) => void changeRole(v === 'ADMIN' ? 'ADMIN' : 'MEMBER')}
              >
                <SelectItem value="MEMBER">{tModal('roleMember')}</SelectItem>
                {(isOwner || localRole === 'ADMIN') && (
                  <SelectItem value="ADMIN">{tModal('roleAdmin')}</SelectItem>
                )}
              </Select>
              <p className="text-2xs text-muted-foreground">
                {isFullAccess ? tModal('roleAdminHint') : tModal('roleMemberHint')}
              </p>
            </div>

            {!isFullAccess && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-foreground">
                  {tModal('staffRolesLabel')}
                </span>
                {rolesReady ? (
                  <MultiSelect
                    options={roles.map((r) => ({ id: r.id, label: r.name }))}
                    value={localStaffRoleIds}
                    onChange={(ids) => void changeStaffRoles(ids)}
                    disabled={savingRoles}
                    ariaLabel={tModal('staffRolesLabel')}
                    placeholder={tAdmins('noRolePlaceholder')}
                    searchPlaceholder={tAdmins('searchRoles')}
                    emptyLabel={tAdmins('noRoleResults')}
                  />
                ) : (
                  <Skeleton className="h-9 w-full" />
                )}
                <p className="text-2xs text-muted-foreground">{tModal('staffRolesHint')}</p>
              </div>
            )}
          </div>
        </Card>

        <Link
          href="/settings/permissions"
          className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3.5 text-[13px] font-semibold text-primary hover:bg-muted/60"
        >
          <ShieldCheck size={16} />
          {tAdmins('manageLink')}
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <div className="mb-3.5 text-caption font-semibold text-foreground">
            {t('summaryTitle')}
          </div>
          {isFullAccess ? (
            <p className="text-sm font-medium text-foreground">{tAdmins('fullAccess')}</p>
          ) : !rolesReady ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-2.5 w-28" />
                </div>
              ))}
            </div>
          ) : moduleSummaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tAdmins('noRole')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {moduleSummaries.map((m) => (
                <div key={m.key} className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-foreground">
                    {tPerm(`modules.${m.key}.label`)}
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {m.actions.map((a) => tPerm(`matrix.${ACTION_LABEL_KEY[a]}`)).join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
