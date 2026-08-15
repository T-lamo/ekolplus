'use client';

import { CalendarX, FileText, NotebookPen, UserPlus, Wallet, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/contexts/ToastContext';
import { DASHBOARD } from '@/lib/constants';
import type { DashboardData } from './types';

const t = DASHBOARD.activity;

const TYPE_META: Record<
  DashboardData['recentActivity'][number]['type'],
  { icon: LucideIcon; iconBg: string; iconFg: string }
> = {
  grade: { icon: NotebookPen, iconBg: 'bg-secondary', iconFg: 'text-primary' },
  absence: { icon: CalendarX, iconBg: 'bg-destructive', iconFg: 'text-destructive-foreground' },
  payment: { icon: Wallet, iconBg: 'bg-warning', iconFg: 'text-warning-foreground' },
  enrollment: { icon: UserPlus, iconBg: 'bg-success', iconFg: 'text-success-foreground' },
};

function relativeTimeFr(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffH = Math.round(diffMs / 3_600_000);
  if (diffH < 1) return "à l'instant";
  if (diffH < 24) return `il y a ${diffH}h`;
  const isYesterday = diffH < 48;
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return `Hier, ${time}`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export function RecentActivityCard({ activity }: { activity: DashboardData['recentActivity'] }) {
  const { toast } = useToast();

  return (
    <Card className="gap-1.5 p-4 sm:p-5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-caption font-semibold text-foreground">{t.title}</span>
        <button
          type="button"
          onClick={() => toast('Historique complet — bientôt disponible.', 'info')}
          className="text-xs font-medium text-primary"
        >
          {t.seeAll}
        </button>
      </div>
      {activity.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <FileText size={16} />
          {t.empty}
        </div>
      ) : (
        <div className="flex flex-col">
          {activity.map((a, i) => {
            const meta = TYPE_META[a.type];
            return (
              <div
                key={`${a.type}-${a.at}-${i}`}
                className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-none"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.iconBg} ${meta.iconFg}`}
                >
                  <meta.icon size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{a.text}</span>
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {relativeTimeFr(a.at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
