'use client';

// Banani « Moyen de paiement » section-card. Card details are never stored
// on our side (PCI stays with Stripe), so the row reads « Carte gérée par
// Stripe » with « Modifier » → Customer Portal ; the two info strips
// (secure via Stripe / dedicated secure page) are kept verbatim.
import { CreditCard, ExternalLink, Info, Shield } from 'lucide-react';
import type { BillingSummary } from '@/lib/billing-plans';

export function PaymentMethodCard({
  billing,
  canManage,
  onOpenPortal,
  busy,
}: {
  billing: BillingSummary;
  canManage: boolean;
  onOpenPortal: () => void;
  busy?: boolean;
}) {
  const hasStripe = billing.hasStripeCustomer;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-[18px] sm:py-[13px]">
        <div className="text-caption font-bold text-foreground">Moyen de paiement</div>
        {hasStripe && canManage && (
          <button
            type="button"
            onClick={onOpenPortal}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-2xs font-semibold text-primary hover:bg-secondary/80 disabled:opacity-60"
          >
            <ExternalLink size={11} />
            Factures & carte
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 py-[13px] sm:px-[18px]">
        <span className="flex h-[27px] w-10 shrink-0 items-center justify-center rounded bg-foreground text-white">
          <CreditCard size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-caption font-semibold text-foreground">
            {hasStripe ? 'Carte bancaire · gérée par Stripe' : 'Aucun moyen de paiement'}
          </div>
          <div className="mt-px text-2xs text-muted-foreground">
            {hasStripe
              ? billing.managedByStripe
                ? 'Par défaut · modifiable dans l’espace sécurisé Stripe'
                : 'Client Stripe créé · aucun abonnement actif'
              : billing.plan === 'STARTER'
                ? 'Le plan Starter est gratuit — aucune carte requise'
                : 'Abonnement géré manuellement par Schoolgesti'}
          </div>
        </div>
        {hasStripe && canManage && (
          <button
            type="button"
            onClick={onOpenPortal}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-[5px] text-2xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            Modifier
          </button>
        )}
      </div>

      <div className="border-t border-border px-4 py-3 sm:px-[18px]">
        <div className="flex items-center gap-[7px] rounded-md bg-success px-3 py-[9px]">
          <Shield size={13} className="shrink-0 text-success-foreground" />
          <span className="text-2xs font-medium text-success-foreground">
            Paiements sécurisés via Stripe (SSL 256-bit, PCI-DSS niveau 1)
          </span>
        </div>
      </div>
      <div className="px-4 pb-3.5 sm:px-[18px]">
        <div className="flex items-center gap-[7px] rounded-md border border-[#c4b5fd] bg-[#f5f3ff] px-3 py-[9px]">
          <Info size={13} className="shrink-0 text-primary" />
          <span className="text-2xs font-medium text-primary">
            Le paiement s’effectue via Stripe sur une page sécurisée dédiée — vos données bancaires
            ne transitent jamais par nos serveurs.
          </span>
        </div>
      </div>
    </section>
  );
}
