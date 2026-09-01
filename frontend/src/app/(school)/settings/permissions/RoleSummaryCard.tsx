'use client';

// En-tête de la carte de détail (settings/permissions) : identité du rôle
// sélectionné + actions Modifier/Supprimer. Les rôles système (Propriétaire/
// Administrateur) passent `readOnly` : les boutons sont remplacés par
// `systemRoleHint`, cohérent avec l'état des switches de PermissionMatrix.
import { Clock3, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LOCALE_BCP47 } from '@/lib/locales';

interface RoleSummaryCardProps {
  name: string;
  description: string | null;
  memberCount: number;
  updatedAt: string;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function RoleSummaryCard({
  name,
  description,
  memberCount,
  updatedAt,
  readOnly,
  onEdit,
  onDelete,
}: RoleSummaryCardProps) {
  const t = useTranslations('Permissions');
  const locale = useLocale();

  const dateLabel = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(updatedAt));

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <ShieldCheck size={20} />
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold text-foreground">{name}</span>
              {readOnly && <Badge tone="muted">{t('systemBadge')}</Badge>}
              <Badge tone="primary">
                {t(memberCount === 1 ? 'usersCount.one' : 'usersCount.other', {
                  count: memberCount,
                })}
              </Badge>
            </div>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
            <p className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Clock3 size={12} className="shrink-0" />
              {t('modifiedOn', { date: dateLabel })}
            </p>
          </div>
        </div>

        {readOnly ? (
          <p className="text-xs text-muted-foreground sm:text-right">{t('systemRoleHint')}</p>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onEdit}>
              <Pencil size={14} />
              {t('edit')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground"
              onClick={onDelete}
            >
              <Trash2 size={14} />
              {t('delete')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
