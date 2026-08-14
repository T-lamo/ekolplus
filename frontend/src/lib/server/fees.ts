// Shared fee-computation helpers for Frais & Scolarité. Status is always
// derived live from the FeePayment ledger, never stored — same precedent as
// Term.status (grades.ts's resolveCurrentTerm) and Attendance's rate/count
// helpers. See .planning/banani/frais-scolarite.md.
import 'server-only';

export interface FeeTrancheLike {
  id: string;
  amount: number;
  dueDate: Date;
  latePenaltyPercent: number | null;
  latePenaltyGraceDays: number | null;
}

export interface FeePaymentLike {
  feeTrancheId: string;
  amount: number;
}

// Fraction paid (0..1, capped at 1) — the building block for both a
// per-tranche status and the "1/3", "1.5/3" tranche-progress fraction shown
// on the Fee Management table.
export function trancheProgress(tranche: FeeTrancheLike, payments: FeePaymentLike[]): number {
  if (tranche.amount <= 0) return 1;
  const paid = payments
    .filter((p) => p.feeTrancheId === tranche.id)
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.min(paid / tranche.amount, 1);
}

export type TrancheStatus = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UPCOMING';

export function trancheStatus(
  tranche: FeeTrancheLike,
  payments: FeePaymentLike[],
  now: Date,
): TrancheStatus {
  const progress = trancheProgress(tranche, payments);
  if (progress >= 1) return 'PAID';
  if (now > tranche.dueDate) return 'OVERDUE';
  if (progress > 0) return 'PARTIAL';
  return 'UPCOMING';
}

export type StudentFeeStatus = 'UP_TO_DATE' | 'PARTIAL' | 'OVERDUE' | 'UNPAID';

// Overall status shown on the Fee Management table's "Statut" column —
// worst-case across the student's tranches: any OVERDUE tranche wins, then
// any partial payment, then "all paid", else "nothing paid yet".
export function studentFeeStatus(
  tranches: FeeTrancheLike[],
  payments: FeePaymentLike[],
  now: Date,
): StudentFeeStatus {
  if (tranches.length === 0) return 'UNPAID';
  const statuses = tranches.map((t) => trancheStatus(t, payments, now));
  if (statuses.some((s) => s === 'OVERDUE')) return 'OVERDUE';
  if (statuses.every((s) => s === 'PAID')) return 'UP_TO_DATE';
  const anyPaid = payments.some((p) => tranches.some((t) => t.id === p.feeTrancheId));
  return anyPaid ? 'PARTIAL' : 'UNPAID';
}

// Sum of trancheProgress across every tranche — the "1.5/3" fraction. Not
// rounded; the UI formats it (e.g. "1.5/3", "3/3").
export function tranchesPaidCount(tranches: FeeTrancheLike[], payments: FeePaymentLike[]): number {
  return tranches.reduce((sum, t) => sum + trancheProgress(t, payments), 0);
}

export function totalPaid(tranches: FeeTrancheLike[], payments: FeePaymentLike[]): number {
  const trancheIds = new Set(tranches.map((t) => t.id));
  return payments
    .filter((p) => trancheIds.has(p.feeTrancheId))
    .reduce((sum, p) => sum + p.amount, 0);
}

// Days overdue for a single tranche — 0 if not overdue or already paid.
// Used by Relances Impayés' "Retard" column and its Critique(>30j)/Récent(≤14j) thresholds.
export function daysOverdue(
  tranche: FeeTrancheLike,
  payments: FeePaymentLike[],
  now: Date,
): number {
  if (trancheStatus(tranche, payments, now) !== 'OVERDUE') return 0;
  const ms = now.getTime() - tranche.dueDate.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Auto-calculated late penalty for a payment registered after the grace
// period — e.g. HTG 15,000 tranche at 5% = HTG 750, matching the Payment
// Registration modal's mock exactly. Rounds to the nearest whole HTG (the
// app stores money as integers, no decimals — same convention as FCFA
// elsewhere).
export function computeLatePenalty(tranche: FeeTrancheLike, paidAt: Date): number {
  if (tranche.latePenaltyPercent == null) return 0;
  const graceDays = tranche.latePenaltyGraceDays ?? 0;
  const graceDeadline = new Date(tranche.dueDate.getTime() + graceDays * 24 * 60 * 60 * 1000);
  if (paidAt <= graceDeadline) return 0;
  return Math.round((tranche.amount * tranche.latePenaltyPercent) / 100);
}
