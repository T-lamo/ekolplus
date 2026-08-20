// Shared receipt printing for Frais & Scolarité — opens a small dedicated
// print window built from data already in hand (no server round trip),
// rather than window.print()-ing the on-screen app chrome. Used by the
// Payment Registration modal's "Enregistrer & Imprimer" and Fee Management/
// Relances' "Imprimer le reçu" row action.
//
// A plain function outside the React tree can't call useTranslations()
// itself, so every caller resolves its own strings via useTranslations and
// passes them in as `labels` — the printed receipt follows the admin's UI
// locale (see docs/superpowers/specs/2026-08-20-i18n-scolarite-design.md).
import { fmtMoney, fmtDate } from '@/lib/fees-format';

export type FeePaymentMethod = 'ESPECES' | 'MONCASH' | 'NATCASH' | 'CHEQUE' | 'VIREMENT';

export interface ReceiptLabels {
  title: string;
  tranche: string;
  amountPaid: string;
  latePenalty: string;
  paymentMethod: string;
  reference: string;
  totalCollected: string;
  methodLabel: string;
}

export interface ReceiptParams {
  studentName: string;
  studentNumber: string;
  trancheLabel: string;
  amount: number;
  penaltyAmount: number;
  method: FeePaymentMethod;
  reference?: string | undefined;
  paidAt: string;
  currency: string;
  locale: string;
  labels: ReceiptLabels;
}

export function openReceiptAndPrint(params: ReceiptParams): void {
  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) return;
  const total = params.amount + params.penaltyAmount;
  const { labels } = params;
  win.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${labels.title}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      p { margin: 2px 0; font-size: 13px; }
      table { width: 100%; margin-top: 16px; border-collapse: collapse; font-size: 13px; }
      td { padding: 6px 0; border-bottom: 1px solid #eee; }
      td:last-child { text-align: right; font-weight: 600; }
      .total td { font-size: 15px; font-weight: 700; border-top: 2px solid #111; border-bottom: none; }
    </style></head><body>
    <h1>${labels.title}</h1>
    <p>${params.studentName} — #${params.studentNumber}</p>
    <p>${fmtDate(params.paidAt, params.locale)}</p>
    <table>
      <tr><td>${labels.tranche}</td><td>${params.trancheLabel}</td></tr>
      <tr><td>${labels.amountPaid}</td><td>${fmtMoney(params.amount, params.currency)}</td></tr>
      ${params.penaltyAmount > 0 ? `<tr><td>${labels.latePenalty}</td><td>${fmtMoney(params.penaltyAmount, params.currency)}</td></tr>` : ''}
      <tr><td>${labels.paymentMethod}</td><td>${labels.methodLabel}</td></tr>
      ${params.reference ? `<tr><td>${labels.reference}</td><td>${params.reference}</td></tr>` : ''}
      <tr class="total"><td>${labels.totalCollected}</td><td>${fmtMoney(total, params.currency)}</td></tr>
    </table>
  </body></html>`);
  win.document.close();
  win.onload = () => win.print();
}
