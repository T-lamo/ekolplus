'use client';

// Paramètres › Langue — UI language of the app (per-user preference).
// The picker applies the language immediately via LocaleProvider and
// persists it on the account; there is no Save button, same as Apparence.
import { Card } from '@/components/ui/Card';
import { LanguagePicker } from '@/components/settings/LanguagePicker';

export function LangueTab() {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-bold text-foreground">Langue de l'interface</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
        Choisis la langue de l'application. Préférence personnelle : elle s'applique immédiatement,
        sur tous tes appareils, et ne change rien pour les autres membres.
      </p>
      <LanguagePicker />
    </Card>
  );
}
