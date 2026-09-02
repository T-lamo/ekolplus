'use client';
// Client-side companion to the server's PERMISSION_DENIED 403 — rendered by
// page guards (`if (!canSee(module)) return <AccessDenied />;`) so a MEMBER
// without the grant for a page never sees its content flash before the
// server would refuse it. The server remains the authority; this is only UX.
import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';

export function AccessDenied() {
  const t = useTranslations('Permissions.accessDenied');
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="max-w-md items-center gap-3 px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-base font-semibold text-foreground">{t('title')}</p>
        <p className="text-sm text-muted-foreground">{t('body')}</p>
      </Card>
    </div>
  );
}
