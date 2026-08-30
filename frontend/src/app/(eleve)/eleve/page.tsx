'use client';

import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';

export default function EspaceElevePage() {
  const t = useTranslations('ElevePortal');
  const user = useUser();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
      <p className="text-sm text-foreground">
        {t('welcome', { name: user?.name ?? user?.email ?? '' })}
      </p>
      <p className="text-sm text-muted-foreground">{t('comingSoon')}</p>
    </div>
  );
}
