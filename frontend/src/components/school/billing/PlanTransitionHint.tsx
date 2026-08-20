'use client';

// One line under the plan grid: what the SELECTED card would do for this
// school (from the pure transition matrix). Tone follows the direction —
// gold for anything that leads to a paid plan (upgrade / reactivate / resume /
// regularise), warning for a downgrade, neutral for the current plan, a quote
// or a managed contract. `aria-live` so a keyboard user hears the change.
import { AlertTriangle, ArrowDownCircle, Info, Mail, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PlanKey } from '@/lib/billing-plans';
import { planLabel } from '@/lib/billing-plan-i18n';
import { cn } from '@/lib/utils';
import type { PlanTransition } from './plan-transition';

export function PlanTransitionHint({
  plan,
  transition: t,
}: {
  plan: PlanKey;
  transition: PlanTransition;
}) {
  const tHint = useTranslations('Abonnement.planTransitionHint');
  const tPlan = useTranslations('BillingPlans.label');
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
  const planName = planLabel(plan, tPlan);
  const heading =
    t.kind === 'current'
      ? tHint('current', { plan: planName })
      : t.kind === 'downgrade' || t.kind === 'downgrade-scheduled'
        ? tHint('downgrade', { plan: planLabel('STARTER', tPlan) })
        : t.kind === 'upgrade'
          ? tHint('upgrade', { plan: planLabel('PRO', tPlan) })
          : t.kind === 'reactivate'
            ? tHint('reactivate', { plan: planLabel('PRO', tPlan) })
            : t.kind === 'resume'
              ? tHint('resume', { plan: planLabel('PRO', tPlan) })
              : t.kind === 'regularize'
                ? tHint('regularize')
                : t.kind === 'contact'
                  ? tHint('contact', { plan: planName })
                  : tHint('unavailable', { plan: planName });

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
