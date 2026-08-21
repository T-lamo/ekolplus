'use client';

// Banani « Historique de facturation » section-card : header (title, « N
// dernières transactions », export) + table Période · Plan · Montant ·
// Statut · Date · Facture. « PDF » opens Stripe's hosted invoice (which
// carries the PDF download) ; manual/back-office rows have no invoice link.
// The table scrolls inside its own container on small screens.
import { CheckCircle2, Download, FileSpreadsheet, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import { formatUsd, type BillingSummary } from '@/lib/billing-plans';
import { planLabel as resolvePlanLabel } from '@/lib/billing-plan-i18n';
import { LOCALE_BCP47 } from '@/lib/locales';
import { exportToCsv } from '@/lib/csv-export';
import {
  fmtDateShort,
  fmtPeriodMonth,
  methodLabel,
  transactionStatusLabel,
  type MethodT,
  type TransactionStatusT,
} from './billing-format';

const TH =
  'px-4 py-2.5 text-left text-2xs font-bold tracking-[0.5px] text-muted-foreground uppercase';
const TD = 'px-4 py-[11px] text-caption text-foreground align-middle';

export function BillingHistoryTable({ billing }: { billing: BillingSummary }) {
  const t = useTranslations('Abonnement.billingHistoryTable');
  const tStatusMethod = useTranslations('Abonnement') as unknown as TransactionStatusT & MethodT;
  const tPlan = useTranslations('BillingPlans.label');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const rows = billing.transactions;
  const planLabel = resolvePlanLabel(billing.subscribedPlan ?? billing.plan, tPlan);

  function exportCsv() {
    exportToCsv(
      'historique-facturation.csv',
      [
        t('csv.reference'),
        t('csv.period'),
        t('csv.plan'),
        t('csv.amountUsd'),
        t('csv.status'),
        t('csv.method'),
        t('csv.date'),
      ],
      rows.map((row) => [
        row.reference,
        fmtPeriodMonth(row.periodStart, bcp47),
        planLabel,
        (row.amountCents / 100).toFixed(2),
        transactionStatusLabel(row, tStatusMethod).label,
        methodLabel(row.method, tStatusMethod),
        fmtDateShort(row.paidAt, bcp47),
      ]),
    );
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-[18px] sm:py-[13px]">
        <div>
          <div className="text-caption font-bold text-foreground">{t('title')}</div>
          <div className="mt-px text-xs text-muted-foreground">
            {rows.length === 0
              ? t('noneYet')
              : t(rows.length > 1 ? 'count.other' : 'count.one', { count: rows.length })}
          </div>
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-[5px] text-2xs font-medium text-foreground hover:bg-muted"
          >
            <FileSpreadsheet size={11} className="text-muted-foreground" />
            {t('exportAll')}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-caption text-muted-foreground sm:px-[18px]">
          {billing.plan === 'STARTER'
            ? t('emptyStarter', { plan: resolvePlanLabel('PRO', tPlan) })
            : t('emptyOther')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className={TH}>{t('th.period')}</th>
                <th className={TH}>{t('th.plan')}</th>
                <th className={TH}>{t('th.amount')}</th>
                <th className={TH}>{t('th.status')}</th>
                <th className={TH}>{t('th.date')}</th>
                <th className={TH}>{t('th.invoice')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const st = transactionStatusLabel(row, tStatusMethod);
                const refund = row.amountCents < 0;
                return (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    <td className={`${TD} font-semibold whitespace-nowrap`}>
                      {fmtPeriodMonth(row.periodStart, bcp47)}
                      {refund && (
                        <span className="ml-1 text-2xs font-normal text-muted-foreground">
                          {t('refund')}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      {planLabel} · {methodLabel(row.method, tStatusMethod)}
                    </td>
                    <td className={`${TD} font-bold tabular-nums`}>
                      {formatUsd(row.amountCents, bcp47)}
                    </td>
                    <td className={TD}>
                      <Badge tone={st.tone}>
                        {row.status === 'FAILED' ? (
                          <XCircle size={10} />
                        ) : (
                          <CheckCircle2 size={10} />
                        )}
                        {st.label}
                      </Badge>
                    </td>
                    <td className={`${TD} text-muted-foreground`}>
                      {fmtDateShort(row.paidAt, bcp47)}
                    </td>
                    <td className={TD}>
                      {row.invoiceUrl ? (
                        <a
                          href={row.invoiceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-2xs font-medium text-primary hover:bg-secondary/80"
                        >
                          <Download size={10} />
                          {t('pdf')}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
