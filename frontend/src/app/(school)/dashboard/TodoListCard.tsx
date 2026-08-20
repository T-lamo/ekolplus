import Link from 'next/link';
import { CalendarX, ClipboardCheck, UserX, Wallet, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import type { DashboardData } from './types';

export function TodoListCard({ todos }: { todos: DashboardData['todos'] }) {
  const t = useTranslations('Dashboard.todos');
  const items: {
    key: string;
    href: string;
    icon: LucideIcon;
    iconBg: string;
    iconFg: string;
    title: string;
    sub: string;
    subTone: string;
    count: number;
  }[] = [
    {
      key: 'evaluations',
      href: '/pedagogie/carnet-de-notes',
      icon: ClipboardCheck,
      iconBg: 'bg-[#fff4e0]',
      iconFg: 'text-[#d97706]',
      title: t('evaluationsToGrade'),
      sub:
        todos.evaluationsOverdue > 0
          ? t('evaluationsOverdueLabel', { n: todos.evaluationsOverdue })
          : '',
      subTone: 'text-destructive-foreground',
      count: todos.evaluationsToGrade,
    },
    {
      key: 'absences',
      href: '/pedagogie/presences',
      icon: CalendarX,
      iconBg: 'bg-destructive',
      iconFg: 'text-destructive-foreground',
      title: t('unjustifiedAbsences'),
      sub: t('unjustifiedAbsencesSub'),
      subTone: 'text-muted-foreground',
      count: todos.unjustifiedAbsencesThisWeek,
    },
    {
      key: 'teachers',
      href: '/configuration/matieres',
      icon: UserX,
      iconBg: 'bg-secondary',
      iconFg: 'text-primary',
      title: t('teachersWithoutClass'),
      sub: t('teachersWithoutClassSub'),
      subTone: 'text-primary',
      count: todos.teachersWithoutClass,
    },
    {
      key: 'payments',
      href: '/scolarite/relances',
      icon: Wallet,
      iconBg: 'bg-warning',
      iconFg: 'text-warning-foreground',
      title: t('overduePayments'),
      sub: t('overduePaymentsSub'),
      subTone: 'text-warning-foreground',
      count: todos.overduePayments,
    },
  ];

  const activeCount = items.filter((i) => i.count > 0).length;

  return (
    <Card className="gap-3.5 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-caption font-semibold text-foreground">{t('title')}</span>
        {activeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ef4444] text-2xs font-bold text-white">
            {activeCount}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="flex items-center gap-3 rounded-md bg-background px-3 py-2.5"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${item.iconBg} ${item.iconFg}`}
            >
              <item.icon size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-foreground">{item.title}</span>
              {item.sub && (
                <span className={`mt-0.5 block text-2xs ${item.subTone}`}>{item.sub}</span>
              )}
            </span>
            <span className="shrink-0 text-xl font-bold text-foreground">{item.count}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
