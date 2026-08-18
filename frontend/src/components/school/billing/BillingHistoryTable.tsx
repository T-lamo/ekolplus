'use client';

// Banani « Historique de facturation » section-card : header (title, « N
// dernières transactions », export) + table Période · Plan · Montant ·
// Statut · Date · Facture. « PDF » opens Stripe's hosted invoice (which
// carries the PDF download) ; manual/back-office rows have no invoice link.
// The table scrolls inside its own container on small screens.
import { CheckCircle2, Download, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { PLAN_LABELS, formatUsd, type BillingSummary } from '@/lib/billing-plans';
import { exportToCsv } from '@/lib/csv-export';
import {
  METHOD_LABELS,
  fmtDateShort,
  fmtPeriodMonth,
  transactionStatusLabel,
} from './billing-format';

const TH =
  'px-4 py-2.5 text-left text-2xs font-bold tracking-[0.5px] text-muted-foreground uppercase';
const TD = 'px-4 py-[11px] text-caption text-foreground align-middle';

export function BillingHistoryTable({ billing }: { billing: BillingSummary }) {
  const rows = billing.transactions;
  const planLabel = PLAN_LABELS[billing.subscribedPlan ?? billing.plan];

  function exportCsv() {
    exportToCsv(
      'historique-facturation.csv',
      ['Référence', 'Période', 'Plan', 'Montant (USD)', 'Statut', 'Moyen', 'Date'],
      rows.map((t) => [
        t.reference,
        fmtPeriodMonth(t.periodStart),
        planLabel,
        (t.amountCents / 100).toFixed(2),
        transactionStatusLabel(t).label,
        METHOD_LABELS[t.method],
        fmtDateShort(t.paidAt),
      ]),
    );
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-[18px] sm:py-[13px]">
        <div>
          <div className="text-caption font-bold text-foreground">Historique de facturation</div>
          <div className="mt-px text-xs text-muted-foreground">
            {rows.length === 0
              ? 'Aucune transaction pour le moment'
              : `${rows.length} dernière${rows.length > 1 ? 's' : ''} transaction${rows.length > 1 ? 's' : ''}`}
          </div>
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-[5px] text-2xs font-medium text-foreground hover:bg-muted"
          >
            <Download size={11} className="text-muted-foreground" />
            Tout exporter
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-caption text-muted-foreground sm:px-[18px]">
          {billing.plan === 'STARTER'
            ? 'Le plan Starter est gratuit — vos factures apparaîtront ici après un passage à Établissement Pro.'
            : 'Vos factures apparaîtront ici après le premier prélèvement.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className={TH}>Période</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Montant</th>
                <th className={TH}>Statut</th>
                <th className={TH}>Date</th>
                <th className={TH}>Facture</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const st = transactionStatusLabel(t);
                const refund = t.amountCents < 0;
                return (
                  <tr key={t.id} className="border-b border-border last:border-b-0">
                    <td className={`${TD} font-semibold whitespace-nowrap`}>
                      {fmtPeriodMonth(t.periodStart)}
                      {refund && (
                        <span className="ml-1 text-2xs font-normal text-muted-foreground">
                          (remboursement)
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      {planLabel} · {METHOD_LABELS[t.method]}
                    </td>
                    <td className={`${TD} font-bold tabular-nums`}>{formatUsd(t.amountCents)}</td>
                    <td className={TD}>
                      <Badge tone={st.tone}>
                        {t.status === 'FAILED' ? <XCircle size={10} /> : <CheckCircle2 size={10} />}
                        {st.label}
                      </Badge>
                    </td>
                    <td className={`${TD} text-muted-foreground`}>{fmtDateShort(t.paidAt)}</td>
                    <td className={TD}>
                      {t.invoiceUrl ? (
                        <a
                          href={t.invoiceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-2xs font-medium text-primary hover:bg-secondary/80"
                        >
                          <Download size={10} />
                          PDF
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
