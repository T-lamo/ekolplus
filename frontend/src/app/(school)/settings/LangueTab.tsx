'use client';

// Paramètres › Langue — UI language of the app (per-user preference).
// The picker applies the language immediately via LocaleProvider and
// persists it on the account; there is no Save button, same as Apparence.
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { LanguagePicker } from '@/components/settings/LanguagePicker';

export function LangueTab() {
  const t = useTranslations('Settings.langue');
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-bold text-foreground">{t('title')}</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">{t('description')}</p>
      <LanguagePicker />
    </Card>
  );
}
