'use client';

// Shown by both gradebook list pages in place of the notebook when the
// selected class-subject is evaluated by criteria (spec 2026-09-05 §4).
import { ListChecks } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function QualitativeSubjectCard({ href }: { href: string }) {
  const t = useTranslations('Gradebook.criteria');
  const router = useRouter();
  return (
    <Card className="items-center gap-3 p-10 text-center">
      <ListChecks size={28} className="text-muted-foreground" />
      <p className="max-w-md text-sm text-muted-foreground">{t('qualitativeSubjectHint')}</p>
      <Button className="w-fit" onClick={() => router.push(href)}>
        <ListChecks size={14} />
        {t('openSheet')}
      </Button>
    </Card>
  );
}
