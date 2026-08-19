'use client';

// Paramètres › Apparence — colour theme of the app (per-user preference).
// The picker applies the theme immediately via ThemeProvider and persists
// it on the account; there is no Save button on purpose.
import { Card } from '@/components/ui/Card';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { APPEARANCE as T } from '@/lib/constants';

export function ApparenceTab() {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-bold text-foreground">{T.title}</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">{T.description}</p>
      <ThemePicker />
    </Card>
  );
}
