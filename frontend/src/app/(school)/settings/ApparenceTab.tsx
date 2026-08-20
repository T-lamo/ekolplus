'use client';

// Paramètres › Apparence — colour theme of the app (per-user preference).
// The picker applies the theme immediately via ThemeProvider and persists
// it on the account; there is no Save button on purpose.
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { ThemePicker } from '@/components/settings/ThemePicker';

export function ApparenceTab() {
  const t = useTranslations('Settings.apparence');
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-bold text-foreground">{t('title')}</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">{t('description')}</p>
      <ThemePicker />
    </Card>
  );
}
