'use client';

// Colonne de sélection des rôles (settings/permissions). Les deux rôles
// système (Propriétaire/Administrateur) sont épinglés en tête de liste — ils
// n'existent pas comme lignes `Role` en base, d'où les sentinelles d'id
// exportées ci-dessous, consommées par la page parente (Task 10) pour savoir
// quel jeu de grants (ALL) et quel mode lecture seule appliquer.
import { Info, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';

export const SYSTEM_OWNER_ID = '__owner__';
export const SYSTEM_ADMIN_ID = '__admin__';

export interface RoleRow {
  id: string;
  name: string;
  memberCount: number;
}

interface RolesPanelProps {
  roles: RoleRow[];
  systemCounts: { owners: number; admins: number };
  selectedId: string;
  onSelect: (id: string) => void;
  onAddRole: () => void;
}

export function RolesPanel({
  roles,
  systemCounts,
  selectedId,
  onSelect,
  onAddRole,
}: RolesPanelProps) {
  const t = useTranslations('Permissions');

  const rows: RoleRow[] = [
    { id: SYSTEM_OWNER_ID, name: t('ownerRole'), memberCount: systemCounts.owners },
    { id: SYSTEM_ADMIN_ID, name: t('adminRole'), memberCount: systemCounts.admins },
    ...roles,
  ];

  return (
    <>
      {/* Mobile / tablette : remplace la colonne par un combobox pleine largeur. */}
      <div className="flex flex-col gap-2 lg:hidden">
        <FilterSelect
          value={selectedId}
          onValueChange={onSelect}
          ariaLabel={t('rolesLabel')}
          className="w-full"
        >
          {rows.map((r) => {
            const isSystem = r.id === SYSTEM_OWNER_ID || r.id === SYSTEM_ADMIN_ID;
            return (
              <SelectItem key={r.id} value={r.id}>
                {isSystem ? `${r.name} · ${t('systemBadge')}` : r.name}
              </SelectItem>
            );
          })}
        </FilterSelect>
        <Button type="button" variant="outline" onClick={onAddRole}>
          <Plus size={16} />
          {t('newRole')}
        </Button>
      </div>

      {/* Desktop : colonne fixe 240px. */}
      <div className="hidden w-[240px] shrink-0 flex-col gap-3 lg:flex">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('rolesLabel')}
          </span>
          <button
            type="button"
            onClick={onAddRole}
            aria-label={t('newRole')}
            title={t('newRole')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const active = r.id === selectedId;
            const isSystem = r.id === SYSTEM_OWNER_ID || r.id === SYSTEM_ADMIN_ID;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex h-[34px] items-center justify-between gap-2 rounded-md border border-border px-2.5 text-left transition-colors',
                  active ? 'bg-secondary text-primary' : 'bg-card text-foreground hover:bg-muted',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-xs font-semibold">{r.name}</span>
                  {isSystem && (
                    <Badge tone={active ? 'primary' : 'muted'} className="shrink-0">
                      {t('systemBadge')}
                    </Badge>
                  )}
                </span>
                <span
                  className={cn(
                    'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-2xs font-semibold',
                    active ? 'bg-card text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {r.memberCount}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-start gap-2 rounded-md bg-secondary p-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-primary" />
          <div className="flex flex-col gap-0.5">
            <p className="text-2xs font-semibold text-foreground">{t('note.title')}</p>
            <p className="text-2xs text-muted-foreground">{t('note.body')}</p>
          </div>
        </div>
      </div>
    </>
  );
}
