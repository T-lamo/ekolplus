'use client';

// One line under the plan grid: what the SELECTED card would do for this
// school (from the pure transition matrix). Tone follows the direction —
// gold for anything that leads to a paid plan (upgrade / reactivate / resume /
// regularise), warning for a downgrade, neutral for the current plan, a quote
// or a managed contract. `aria-live` so a keyboard user hears the change.
import { AlertTriangle, ArrowDownCircle, Info, Mail, Sparkles } from 'lucide-react';
import { PLAN_LABELS, type PlanKey } from '@/lib/billing-plans';
import { cn } from '@/lib/utils';
import type { PlanTransition } from './plan-transition';

export function PlanTransitionHint({
  plan,
  transition: t,
}: {
  plan: PlanKey;
  transition: PlanTransition;
}) {
  const tone =
    t.kind === 'downgrade'
      ? 'warning'
      : t.kind === 'regularize'
        ? 'alert'
        : t.kind === 'upgrade' ||
            t.kind === 'reactivate' ||
            t.kind === 'resume' ||
            t.kind === 'downgrade-scheduled'
          ? 'gold'
          : t.kind === 'contact'
            ? 'primary'
            : 'muted';
  const cls = {
    gold: 'border-gold-300 bg-gold-100 text-gold-700',
    warning: 'border-warning-foreground/30 bg-warning text-warning-foreground',
    alert: 'border-destructive-foreground/30 bg-destructive text-destructive-foreground',
    primary: 'border-primary/20 bg-secondary text-primary',
    muted: 'border-border bg-muted text-muted-foreground',
  }[tone];
  const Icon =
    tone === 'gold'
      ? Sparkles
      : tone === 'warning'
        ? ArrowDownCircle
        : tone === 'alert'
          ? AlertTriangle
          : tone === 'primary'
            ? Mail
            : Info;
  const heading =
    t.kind === 'current'
      ? `${PLAN_LABELS[plan]} — votre plan actuel`
      : t.kind === 'downgrade' || t.kind === 'downgrade-scheduled'
        ? `Rétrogradation vers ${PLAN_LABELS.STARTER}`
        : t.kind === 'upgrade'
          ? `Passage à ${PLAN_LABELS.PRO}`
          : t.kind === 'reactivate'
            ? `Réactivation de ${PLAN_LABELS.PRO}`
            : t.kind === 'resume'
              ? `Reprise de ${PLAN_LABELS.PRO}`
              : t.kind === 'regularize'
                ? 'Paiement à régulariser'
                : t.kind === 'contact'
                  ? `${PLAN_LABELS[plan]} — sur devis`
                  : `${PLAN_LABELS[plan]} — non disponible en libre-service`;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="plan-transition-hint"
      data-kind={t.kind}
      className={cn('flex items-start gap-2.5 rounded-md border p-3.5 text-caption', cls)}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>
        <strong className="font-bold">{heading}.</strong> {t.hint}
      </p>
    </div>
  );
}
