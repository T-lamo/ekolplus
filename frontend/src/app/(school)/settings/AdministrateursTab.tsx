'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { LOCALE_BCP47 } from '@/lib/locales';
import { roleLabel } from './role-label';
import type { MemberData } from './types';

// Read-only for V1 — add/remove is an invite flow, deferred (see
// school-settings.md).
export function AdministrateursTab({ members }: { members: MemberData[] }) {
  const t = useTranslations('Settings.administrateurs');
  const tRoles = useTranslations('Common.roles');
  const locale = useLocale();

  function fmt(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(LOCALE_BCP47[locale], {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-caption font-bold text-foreground">{t('title')}</h2>
        <p className="text-2xs text-muted-foreground">{t('description')}</p>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {m.name ?? m.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
                {roleLabel(m.role, tRoles)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t('since', { date: fmt(m.joinedAt) })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
