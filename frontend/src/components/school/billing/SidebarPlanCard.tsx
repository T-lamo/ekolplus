'use client';

// Plan card at the bottom of the school sidebar (above the profile block).
// « Or = plan payant » (user decision 2026-08-18):
//   · Starter  → gold-gradient upsell card « Passez à Établissement Pro »
//                (urgency copy near / at the 50-student cap, « Réactiver »
//                after a canceled Pro) with a CTA to /abonnement;
//   · Pro / Enterprise → pale-gold status strip (trial / renewal / cancel
//                scheduled / payment failed) linking to /abonnement.
// Copy + tone come from the pure `planPresentation()` (unit tested); the
// snapshot comes from SchoolPlanContext (one fetch per shell, refreshed by
// the Abonnement screens). Renders nothing while loading / without a school /
// for Starter on a deployment without Stripe.
import * as Tooltip from '@radix-ui/react-tooltip';
import { AlertTriangle, ArrowRight, ChevronRight, Crown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { LOCALE_BCP47 } from '@/lib/locales';
import { cn } from '@/lib/utils';
import { planPresentation } from './plan-presentation';

const GOLD_GRADIENT = 'bg-linear-to-br from-gold-300 to-gold-500 text-gold-900';

export function SidebarPlanCard({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const { snapshot } = useSchoolPlan();
  const t = useTranslations('SchoolPlanCard');
  const tPlan = useTranslations('BillingPlans.label');
  const locale = useLocale();
  const p = planPresentation(snapshot, t, tPlan, LOCALE_BCP47[locale]);
  if (!p) return null;
  const upsell = p.kind === 'upsell';
  const alert = p.tone === 'alert';

  if (collapsed) {
    return (
      <Tooltip.Root delayDuration={300}>
        <Tooltip.Trigger asChild>
          <Link
            href={p.href}
            {...(onNavigate && { onClick: onNavigate })}
            aria-label={p.shortLabel}
            data-testid="sidebar-plan-card"
            className={cn(
              'relative mx-auto mb-1.5 flex h-10 w-10 items-center justify-center rounded-xl transition hover:brightness-95',
              upsell ? GOLD_GRADIENT : 'border border-gold-300 bg-gold-100 text-gold-700',
            )}
          >
            <Crown size={17} />
            {alert && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-destructive-foreground"
              />
            )}
          </Link>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            className="z-50 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
          >
            {p.shortLabel}
            <Tooltip.Arrow className="fill-foreground" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  }

  if (upsell) {
    return (
      <Link
        href={p.href}
        {...(onNavigate && { onClick: onNavigate })}
        data-testid="sidebar-plan-card"
        className={cn('mb-1.5 block rounded-xl p-3 transition hover:brightness-95', GOLD_GRADIENT)}
      >
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-900/10">
            <Crown size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-xs leading-tight font-extrabold">{p.title}</div>
            <div
              className={cn(
                'mt-0.5 flex items-start gap-1 text-2xs leading-snug',
                alert ? 'font-semibold' : 'text-gold-900/80',
              )}
            >
              {alert && <AlertTriangle size={11} className="mt-px shrink-0" />}
              <span>{p.subtitle}</span>
            </div>
          </div>
        </div>
        <span className="mt-2.5 flex h-8 items-center justify-center gap-1 rounded-md bg-gold-900 text-2xs font-bold text-gold-100">
          {p.cta}
          <ArrowRight size={12} />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={p.href}
      {...(onNavigate && { onClick: onNavigate })}
      data-testid="sidebar-plan-card"
      className="mb-1.5 flex items-center gap-2 rounded-xl border border-gold-300 bg-gold-100 px-2 py-2 text-gold-700 transition hover:bg-gold-200/60"
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          GOLD_GRADIENT,
        )}
      >
        <Crown size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-extrabold">{p.title}</div>
        <div
          className={cn(
            'flex items-center gap-1 text-2xs',
            alert ? 'font-semibold text-destructive-foreground' : 'text-gold-700/80',
          )}
        >
          {alert && <AlertTriangle size={11} className="shrink-0" />}
          <span className="truncate">{p.subtitle}</span>
        </div>
      </div>
      <ChevronRight size={13} className="-mr-0.5 shrink-0 opacity-50" />
    </Link>
  );
}
