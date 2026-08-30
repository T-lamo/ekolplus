'use client';

import { Download, Eye, FileText } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

interface TermBulletinSummary {
  termId: string;
  label: string;
  order: number;
  overallAverage: number | null;
  rank: number | null;
  rankedCount: number;
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1);
}

export function BulletinsTab({ studentId }: { studentId: string }) {
  const t = useTranslations('Eleves.bulletins');
  const { data, error: dataErr } = useApi<{ terms: TermBulletinSummary[] }>(
    `/api/school/students/${studentId}/bulletins`,
  );
  const rows = data ? [...data.terms].sort((a, b) => a.order - b.order) : null;
  const error = dataErr ? t('loadError') : null;

  if (error) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <p className="text-sm text-destructive-foreground">{error}</p>
      </Card>
    );
  }

  if (!rows) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <Card key={i} className="flex-row items-center gap-4 p-4.5">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-8 w-36 rounded-md" />
          </Card>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <FileText size={28} className="text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">{t('empty')}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const generated = r.overallAverage != null;
        return (
          <Card key={r.termId} className="flex-row flex-wrap items-center gap-4 p-4.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
              <FileText size={17} />
            </div>
            <div className="flex min-w-[160px] flex-1 flex-col gap-0.5">
              <div className="text-caption font-bold text-foreground">{r.label}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold ${
                    generated
                      ? 'bg-success text-success-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {generated ? t('generated') : t('pending')}
                </span>
                {generated && (
                  <span>
                    {t('summary', {
                      average: fmt(r.overallAverage),
                      rank: r.rank ?? '—',
                      rankedCount: r.rankedCount,
                    })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/bulletins/${studentId}/${r.termId}`}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-caption font-semibold text-foreground"
              >
                <Eye size={13} />
                {t('view')}
              </Link>
              <a
                href={`/api/school/students/${studentId}/bulletin/pdf?termId=${r.termId}`}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-caption font-semibold ${
                  generated
                    ? 'bg-primary text-primary-foreground'
                    : 'pointer-events-none bg-muted text-muted-foreground'
                }`}
                aria-disabled={!generated}
              >
                <Download size={13} />
                PDF
              </a>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
