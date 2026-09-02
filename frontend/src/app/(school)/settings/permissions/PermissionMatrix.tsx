'use client';

// Table pilotée par le registre `lib/permissions.ts` (settings/permissions).
// Aucune donnée de rôle ici : seulement `grants`/`readOnly`/`onToggle`, la
// page parente (Task 10) porte l'état et le PATCH réseau.
import { Download, Eye, Pencil, PlusCircle, Trash2, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/Switch';
import { TABLE_SCROLL, STICKY_THEAD } from '@/lib/layout';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionAction,
  type PermissionSection,
} from '@/lib/permissions';
import { PERMISSION_MODULE_ICONS } from './permission-icons';

const SECTION_ORDER: readonly PermissionSection[] = ['general', 'academic', 'finance', 'config'];

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

const ACTION_ICON: Record<PermissionAction, LucideIcon> = {
  view: Eye,
  create: PlusCircle,
  edit: Pencil,
  delete: Trash2,
  export: Download,
};

interface PermissionMatrixProps {
  grants: ReadonlySet<string>;
  readOnly: boolean;
  onToggle: (grant: string, next: boolean) => void;
}

export function PermissionMatrix({ grants, readOnly, onToggle }: PermissionMatrixProps) {
  const t = useTranslations('Permissions');

  return (
    <div className={TABLE_SCROLL}>
      <table className="w-full min-w-[560px] table-fixed border-collapse text-sm">
        <thead className={STICKY_THEAD}>
          <tr>
            <th
              scope="col"
              className="w-[34%] px-3 py-2.5 text-left text-2xs font-semibold text-muted-foreground uppercase"
            >
              {t('matrix.module')}
            </th>
            {PERMISSION_ACTIONS.map((action) => {
              const Icon = ACTION_ICON[action];
              return (
                <th
                  key={action}
                  scope="col"
                  className="w-[13.2%] px-2 py-2.5 text-center text-2xs font-semibold text-muted-foreground uppercase"
                >
                  <span className="flex flex-col items-center gap-1">
                    <Icon size={14} />
                    {t(`matrix.${ACTION_LABEL_KEY[action]}`)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {SECTION_ORDER.flatMap((section) => {
            const modules = PERMISSION_MODULES.filter((m) => m.section === section);
            if (modules.length === 0) return [];
            return [
              <tr key={`section-${section}`}>
                <th
                  scope="colgroup"
                  colSpan={PERMISSION_ACTIONS.length + 1}
                  className="bg-background px-3 py-1.5 text-left text-2xs font-bold tracking-wide text-muted-foreground uppercase"
                >
                  {t(`sections.${section}`)}
                </th>
              </tr>,
              ...modules.map((mod) => {
                const Icon = PERMISSION_MODULE_ICONS[mod.icon];
                const moduleLabel = t(`modules.${mod.key}.label`);
                const applicableActions = mod.actions as readonly string[];
                return (
                  <tr key={mod.key} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: mod.dotBg, color: mod.dotFg }}
                        >
                          {Icon && <Icon size={14} />}
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-xs font-semibold text-foreground">
                            {moduleLabel}
                          </span>
                          <span className="truncate text-2xs text-muted-foreground">
                            {t(`modules.${mod.key}.sub`)}
                          </span>
                        </div>
                      </div>
                    </td>
                    {PERMISSION_ACTIONS.map((action) => {
                      const applicable = applicableActions.includes(action);
                      const grant = `${mod.key}.${action}`;
                      return (
                        <td key={action} className="px-2 py-2.5 text-center">
                          {applicable && (
                            <Switch
                              checked={grants.has(grant)}
                              onChange={(next) => onToggle(grant, next)}
                              disabled={readOnly}
                              label={`${moduleLabel} · ${t(`matrix.${ACTION_LABEL_KEY[action]}`)}`}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              }),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
