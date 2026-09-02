'use client';
// Lecture client du RBAC école — s'appuie sur le snapshot déjà chargé par
// SchoolPlanProvider (zéro requête en plus). permissions === null (encore
// en chargement) => tout est visible, même convention anti-flicker que
// filterSectionsByRole ; le serveur reste l'autorité (403 PERMISSION_DENIED).
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { hasGrant, type PermissionAction, type PermissionModuleKey } from '@/lib/permissions';

/**
 * Pure decision logic, extracted so it is unit-testable without rendering a
 * component (this project has no @testing-library/react). The hook below is
 * a thin wrapper around this function.
 */
export function computeCan(
  permissions: 'ALL' | readonly string[] | null,
  module: PermissionModuleKey,
  action: PermissionAction,
): boolean {
  if (permissions === null) return true;
  return hasGrant(permissions, module, action);
}

export function usePermissions() {
  const { permissions } = useSchoolPlan();
  function can(module: PermissionModuleKey, action: PermissionAction): boolean {
    return computeCan(permissions, module, action);
  }
  return {
    permissions,
    loaded: permissions !== null,
    can,
    canSee: (module: PermissionModuleKey) => can(module, 'view'),
  };
}
