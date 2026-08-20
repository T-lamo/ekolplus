'use client';

// « Rétrograder vers Starter » — the one place a Pro school schedules its
// downgrade (PATCH cancelAtPeriodEnd:true). Lists every consequence before
// the button, in plain words: effective date (end of the paid period), no
// refund / no further invoice, the 50-student cap coming back (with the
// school's own headcount), data + modules kept (no locking), resume possible
// until the date. Confirmation = destructive-outline button; the primary
// action of the dialog is to KEEP Pro.
import { CalendarClock, Database, RotateCcw, Users, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PLAN_STUDENT_HARD_LIMIT, type BillingSummary } from '@/lib/billing-plans';
import { planLabel } from '@/lib/billing-plan-i18n';
import { LOCALE_BCP47 } from '@/lib/locales';
import { fmtDateLong } from './billing-format';

export function DowngradeDialog({
  billing,
  busy,
  onConfirm,
  onClose,
}: {
  billing: BillingSummary;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('Abonnement.downgradeDialog');
  const tPlan = useTranslations('BillingPlans.label');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const cap = PLAN_STUDENT_HARD_LIMIT.STARTER ?? 50;
  const n = billing.studentCount;
  const over = n > cap;
  const date = fmtDateLong(billing.renewsAt, bcp47);
  const trial = billing.status === 'TRIAL';
  const proLabel = planLabel('PRO', tPlan);
  const starterLabel = planLabel('STARTER', tPlan);

  const rows: { icon: React.ReactNode; title: string; body: string }[] = [
    {
      icon: <CalendarClock size={15} />,
      title: t('effectiveDateTitle', { date }),
      body: trial ? t('effectiveBodyTrial') : t('effectiveBodyPaid'),
    },
    {
      icon: <Users size={15} />,
      title: over ? t('capTitleOver', { count: n, cap }) : t('capTitleUnder', { cap }),
      body: over
        ? t('capBodyOver', { cap, count: n })
        : t('capBodyUnder', { count: n, remaining: Math.max(cap - n, 0) }),
    },
    {
      icon: <Database size={15} />,
      title: t('dataKeptTitle'),
      body: t('dataKeptBody'),
    },
    {
      icon: <Wallet size={15} />,
      title: t('invoicesTitle'),
      body: t('invoicesBody'),
    },
    {
      icon: <RotateCcw size={15} />,
      title: t('resumeTitle', { date }),
      body: t('resumeBody', { plan: proLabel }),
    },
  ];

  return (
    <Modal
      title={t('title', { plan: starterLabel })}
      subtitle={t('subtitle', { plan: proLabel, date })}
      onClose={onClose}
      medium
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-destructive-foreground/30 text-destructive-foreground hover:bg-destructive sm:w-fit"
            onClick={onConfirm}
            loading={busy}
            data-testid="downgrade-confirm"
          >
            {t('confirm')}
          </Button>
          <Button
            type="button"
            variant="gold"
            size="sm"
            className="w-full sm:w-fit"
            onClick={onClose}
            disabled={busy}
          >
            {t('keep', { plan: proLabel })}
          </Button>
        </div>
      }
    >
      <p className="text-caption text-foreground">{t('intro')}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {r.icon}
            </span>
            <div>
              <div className="text-caption font-semibold text-foreground">{r.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{r.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
