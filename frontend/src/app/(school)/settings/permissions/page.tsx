'use client';

// Écran /settings/permissions — assemble RolesPanel + RoleSummaryCard +
// PermissionMatrix (Task 9) et RoleFormModal (Task 8) autour de
// GET/POST/PATCH/DELETE /api/school/roles (Task 4). Cette page porte tout
// l'état (rôle sélectionné, brouillon de grants, réseau) : les composants
// enfants restent purs.
//
// Gate : `useSchoolPlan().role` — le serveur refuse déjà les MEMBER (403),
// cette page se contente d'afficher un état dédié plutôt qu'un message
// d'erreur générique. `role === null` = snapshot pas encore chargé →
// squelettes, pas d'écran d'erreur.
//
// Sélection : `selectedId` (état brut, écrit par les actions utilisateur) et
// `effectiveSelectedId` (dérivé, retombe sur le premier rôle personnalisé —
// ou le rôle système Propriétaire — dès que `selectedId` pointe vers un rôle
// qui n'existe plus, ex. juste après une suppression). Tout le rendu utilise
// la valeur dérivée : aucun flash entre "sélection par défaut" et "sélection
// réelle" pendant la reconciliation.
import { useEffect, useState } from 'react';
import { Copy, Plus, Save, ShieldOff, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton';
import { allGrants } from '@/lib/permissions';
import { LOCALE_BCP47 } from '@/lib/locales';
import { RolesPanel, SYSTEM_ADMIN_ID, SYSTEM_OWNER_ID, type RoleRow } from './RolesPanel';
import { RoleSummaryCard } from './RoleSummaryCard';
import { PermissionMatrix } from './PermissionMatrix';
import { RoleFormModal, type RoleFormSavedRole } from './RoleFormModal';

interface ApiRole {
  id: string;
  name: string;
  description: string | null;
  grants: string[];
  memberCount: number;
  updatedAt: string;
}

interface RolesResponse {
  roles: ApiRole[];
  systemCounts: { owners: number; admins: number };
}

type FormModalState = { mode: 'create' } | { mode: 'edit'; role: ApiRole } | null;

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

function deleteConfirmKey(memberCount: number): 'zero' | 'one' | 'other' {
  if (memberCount === 0) return 'zero';
  if (memberCount === 1) return 'one';
  return 'other';
}

function PermissionsPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-3.5 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="hidden w-[240px] shrink-0 flex-col gap-1.5 lg:flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[34px] w-full rounded-md" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Skeleton className="h-9 w-full lg:hidden" />
          <Card className="h-24 p-4">
            <Skeleton className="h-full w-full" />
          </Card>
          <Card className="overflow-hidden">
            <SkeletonTable rows={6} cols={6} />
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function PermissionsPage() {
  const t = useTranslations('Permissions');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const { role: schoolRole } = useSchoolPlan();
  const confirm = useConfirm();
  const { toast } = useToast();

  const { data, error, refresh } = useApi<RolesResponse>('/api/school/roles');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftGrants, setDraftGrants] = useState<Set<string>>(new Set());
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Sélection effective : garde `selectedId` tant qu'il désigne un rôle
  // système ou un rôle personnalisé encore présent dans `data` ; sinon
  // retombe sur le premier rôle personnalisé, ou le rôle système Propriétaire.
  const isKnownCustomRole = data ? data.roles.some((r) => r.id === selectedId) : false;
  const isSystemRaw = selectedId === SYSTEM_OWNER_ID || selectedId === SYSTEM_ADMIN_ID;
  const effectiveSelectedId =
    selectedId !== null && (isSystemRaw || isKnownCustomRole)
      ? selectedId
      : (data?.roles[0]?.id ?? SYSTEM_OWNER_ID);

  const isSystemSelected =
    effectiveSelectedId === SYSTEM_OWNER_ID || effectiveSelectedId === SYSTEM_ADMIN_ID;
  const selectedRole =
    data && !isSystemSelected
      ? (data.roles.find((r) => r.id === effectiveSelectedId) ?? null)
      : null;

  // Garde le state en phase avec la valeur dérivée (ex. après une suppression
  // qui invalide la sélection courante) — sans jamais bloquer le rendu :
  // celui-ci utilise déjà `effectiveSelectedId`, donc rien ne "flashe".
  useEffect(() => {
    if (data && effectiveSelectedId !== selectedId) {
      setSelectedId(effectiveSelectedId);
    }
  }, [data, effectiveSelectedId, selectedId]);

  // Réinitialise le brouillon de grants à chaque changement de sélection ou
  // de données fraîches (après Enregistrer, le rôle rechargé redevient la
  // référence "non modifiée" -> dirty repasse à false automatiquement).
  useEffect(() => {
    setDraftGrants(new Set(selectedRole ? selectedRole.grants : []));
  }, [effectiveSelectedId, selectedRole]);

  const dirty = selectedRole !== null && !setsEqual(draftGrants, new Set(selectedRole.grants));

  if (schoolRole === null) {
    return <PermissionsPageSkeleton />;
  }

  if (schoolRole === 'MEMBER') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
          <ShieldOff size={22} />
        </span>
        <h1 className="text-lg font-bold text-foreground">{t('accessDenied.title')}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t('accessDenied.body')}</p>
      </div>
    );
  }

  // Chargement initial de la liste des rôles (une fois le gate de rôle
  // école déjà résolu ci-dessus) : squelette plein écran, pas de double
  // en-tête avec le rendu normal plus bas.
  if (!data && !error) {
    return <PermissionsPageSkeleton />;
  }

  async function handleSelect(id: string) {
    if (id === effectiveSelectedId) return;
    if (dirty) {
      const ok = await confirm({ message: t('unsavedSwitchConfirm') });
      if (!ok) return;
    }
    setSelectedId(id);
  }

  function handleToggle(grant: string, next: boolean) {
    setDraftGrants((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(grant);
      else copy.delete(grant);
      return copy;
    });
  }

  function handleCancelDraft() {
    setDraftGrants(new Set(selectedRole ? selectedRole.grants : []));
  }

  async function handleSaveGrants() {
    if (!selectedRole || !dirty) return;
    setSaving(true);
    try {
      await api(`/api/school/roles/${selectedRole.id}`, {
        method: 'PATCH',
        body: { grants: [...draftGrants] },
      });
      toast(t('toasts.saved'), 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRole() {
    if (!selectedRole) return;
    const key = deleteConfirmKey(selectedRole.memberCount);
    const ok = await confirm({
      message: t(`deleteConfirm.${key}`, {
        name: selectedRole.name,
        count: selectedRole.memberCount,
      }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/school/roles/${selectedRole.id}`, { method: 'DELETE' });
      toast(t('toasts.deleted'), 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  function handleRoleSaved(saved: RoleFormSavedRole, wasCreate: boolean) {
    void refresh().then(() => {
      if (wasCreate) setSelectedId(saved.id);
    });
  }

  async function handleDuplicate() {
    if (!selectedRole) return;
    setDuplicating(true);
    try {
      const res = await api<{ role: RoleFormSavedRole }>('/api/school/roles', {
        method: 'POST',
        body: {
          name: `${selectedRole.name} ${t('duplicateSuffix')}`,
          ...(selectedRole.description ? { description: selectedRole.description } : {}),
          grants: [...selectedRole.grants],
        },
      });
      toast(t('toasts.duplicated'), 'success');
      await refresh();
      setSelectedId(res.role.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ROLE_NAME_TAKEN') {
        toast(t('form.nameTaken'), 'error');
      } else {
        toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
      }
    } finally {
      setDuplicating(false);
    }
  }

  const panelRoles: RoleRow[] = (data?.roles ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    memberCount: r.memberCount,
  }));
  const customRolesCount = data?.roles.length ?? 0;

  const summaryName = isSystemSelected
    ? effectiveSelectedId === SYSTEM_OWNER_ID
      ? t('ownerRole')
      : t('adminRole')
    : (selectedRole?.name ?? '');
  const summaryMemberCount = isSystemSelected
    ? effectiveSelectedId === SYSTEM_OWNER_ID
      ? (data?.systemCounts.owners ?? 0)
      : (data?.systemCounts.admins ?? 0)
    : (selectedRole?.memberCount ?? 0);
  // null for system roles: they aren't `StaffRole` rows and have no real
  // modification date — RoleSummaryCard skips the "Modifié le" line entirely
  // rather than showing a fabricated one.
  const summaryUpdatedAt = isSystemSelected ? null : (selectedRole?.updatedAt ?? null);

  const footerDateLabel = selectedRole
    ? new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(selectedRole.updatedAt))
    : '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={isSystemSelected || !selectedRole || dirty || duplicating}
            loading={duplicating}
            onClick={() => void handleDuplicate()}
          >
            <Copy size={14} />
            {t('duplicateRole')}
          </Button>
          <Button type="button" className="w-fit" onClick={() => setFormModal({ mode: 'create' })}>
            <Plus size={14} />
            {t('newRole')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {t('loadError')}
        </p>
      )}

      {data && (
        <>
          {customRolesCount === 0 && (
            <div className="rounded-2xl border border-border bg-secondary px-4 py-3 text-xs text-foreground">
              {t('emptyRoles')}
            </div>
          )}

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <RolesPanel
              roles={panelRoles}
              systemCounts={data.systemCounts}
              selectedId={effectiveSelectedId}
              onSelect={(id) => void handleSelect(id)}
              onAddRole={() => setFormModal({ mode: 'create' })}
            />

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <RoleSummaryCard
                name={summaryName}
                description={isSystemSelected ? null : (selectedRole?.description ?? null)}
                memberCount={summaryMemberCount}
                updatedAt={summaryUpdatedAt}
                readOnly={isSystemSelected}
                onEdit={() => {
                  if (selectedRole) setFormModal({ mode: 'edit', role: selectedRole });
                }}
                onDelete={() => void handleDeleteRole()}
              />

              <Card className="overflow-hidden">
                <PermissionMatrix
                  grants={isSystemSelected ? new Set(allGrants()) : draftGrants}
                  readOnly={isSystemSelected}
                  onToggle={handleToggle}
                />
              </Card>

              {!isSystemSelected && selectedRole && (
                <Card className="flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {t('footer.meta', {
                      name: selectedRole.name,
                      count: selectedRole.memberCount,
                      date: footerDateLabel,
                    })}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => void handleDeleteRole()}
                    >
                      <Trash2 size={14} />
                      {t('footer.deleteRole')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit"
                      disabled={!dirty}
                      onClick={handleCancelDraft}
                    >
                      {t('footer.cancel')}
                    </Button>
                    <Button
                      type="button"
                      className="w-fit"
                      disabled={!dirty}
                      loading={saving}
                      onClick={() => void handleSaveGrants()}
                    >
                      <Save size={14} />
                      {t('footer.save')}
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {formModal?.mode === 'create' && (
        <RoleFormModal
          mode="create"
          onSaved={(saved) => handleRoleSaved(saved, true)}
          onClose={() => setFormModal(null)}
        />
      )}
      {formModal?.mode === 'edit' && (
        <RoleFormModal
          mode="edit"
          role={{
            id: formModal.role.id,
            name: formModal.role.name,
            description: formModal.role.description,
          }}
          onSaved={(saved) => handleRoleSaved(saved, false)}
          onClose={() => setFormModal(null)}
        />
      )}
    </div>
  );
}
