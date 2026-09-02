// Source unique de vérité du RBAC école (spec 2026-09-01-permission-manager).
// Module PUR, partagé client/serveur — pas de 'server-only', pas d'import React.
// Les couleurs dotBg/dotFg sont des couleurs de données (pastilles de la
// matrice), volontairement non thémées, comme les couleurs de matières.

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionSection = 'general' | 'academic' | 'finance' | 'config';

export interface PermissionModule {
  key: string;
  section: PermissionSection;
  actions: readonly PermissionAction[];
  /** Nom d'icône lucide — mappé vers le composant dans permission-icons.ts (client). */
  icon: string;
  dotBg: string;
  dotFg: string;
}

const ALL_ACTIONS = PERMISSION_ACTIONS;
const NO_EXPORT = ['view', 'create', 'edit', 'delete'] as const;

export const PERMISSION_MODULES = [
  {
    key: 'dashboard',
    section: 'general',
    actions: ['view', 'export'],
    icon: 'layout-dashboard',
    dotBg: '#EFEAFB',
    dotFg: '#6C2BD9',
  },
  {
    key: 'eleves',
    section: 'academic',
    actions: ALL_ACTIONS,
    icon: 'users',
    dotBg: '#EAF9F4',
    dotFg: '#16A34A',
  },
  {
    key: 'enseignants',
    section: 'academic',
    actions: ALL_ACTIONS,
    icon: 'user-check',
    dotBg: '#FFF5EA',
    dotFg: '#D97706',
  },
  {
    key: 'notes',
    section: 'academic',
    actions: ALL_ACTIONS,
    icon: 'notebook-pen',
    dotBg: '#FFF9E8',
    dotFg: '#CA8A04',
  },
  {
    key: 'appreciations',
    section: 'academic',
    actions: ALL_ACTIONS,
    icon: 'message-square-text',
    dotBg: '#FDF0F5',
    dotFg: '#DB2777',
  },
  {
    key: 'presences',
    section: 'academic',
    actions: ALL_ACTIONS,
    icon: 'calendar-check',
    dotBg: '#EEF8FF',
    dotFg: '#0284C7',
  },
  {
    key: 'emploiDuTemps',
    section: 'academic',
    actions: ALL_ACTIONS,
    icon: 'calendar-days',
    dotBg: '#FAF0FF',
    dotFg: '#C026D3',
  },
  {
    key: 'paiements',
    section: 'finance',
    actions: ALL_ACTIONS,
    icon: 'wallet',
    dotBg: '#E6F4F1',
    dotFg: '#0F766E',
  },
  {
    key: 'configuration',
    section: 'config',
    actions: NO_EXPORT,
    icon: 'settings-2',
    dotBg: '#F1F5F9',
    dotFg: '#475569',
  },
  {
    key: 'parametres',
    section: 'config',
    actions: NO_EXPORT,
    icon: 'sliders-horizontal',
    dotBg: '#F1F5F9',
    dotFg: '#475569',
  },
] as const satisfies readonly PermissionModule[];

export type PermissionModuleKey = (typeof PERMISSION_MODULES)[number]['key'];
export type PermissionGrant = `${PermissionModuleKey}.${PermissionAction}`;

const MODULE_BY_KEY = new Map<string, PermissionModule>(PERMISSION_MODULES.map((m) => [m.key, m]));

export function isValidGrant(g: string): g is PermissionGrant {
  const dot = g.indexOf('.');
  if (dot === -1) return false;
  const mod = MODULE_BY_KEY.get(g.slice(0, dot));
  if (!mod) return false;
  return (mod.actions as readonly string[]).includes(g.slice(dot + 1));
}

export function sanitizeGrants(input: readonly string[]): PermissionGrant[] {
  const wanted = new Set(input.filter(isValidGrant));
  return allGrants().filter((g) => wanted.has(g));
}

export function hasGrant(
  grants: 'ALL' | readonly string[] | ReadonlySet<string>,
  module: PermissionModuleKey,
  action: PermissionAction,
): boolean {
  if (grants === 'ALL') return true;
  const g: string = `${module}.${action}`;
  return grants instanceof Set ? grants.has(g) : (grants as readonly string[]).includes(g);
}

export function allGrants(): PermissionGrant[] {
  return PERMISSION_MODULES.flatMap((m) =>
    m.actions.map((a) => `${m.key}.${a}` as PermissionGrant),
  );
}
