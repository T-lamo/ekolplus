'use client';

// Wizard stepper for the teacher/student form modals — rendered in the
// Modal `header` slot so it stays fixed while the step content scrolls.
// Desktop shows every step with connectors; small screens show only the
// current step ("Étape 2 sur 4") + a progress bar to keep the UI light.

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface FormStep {
  id: string;
  label: string;
}

export function FormStepsBar({
  steps,
  activeIndex,
  maxReachedIndex,
  onStepSelect,
}: {
  steps: FormStep[];
  activeIndex: number;
  /** Highest step the user has reached — earlier steps stay clickable. */
  maxReachedIndex: number;
  onStepSelect: (index: number) => void;
}) {
  const t = useTranslations('Common.formStepsBar');
  const active = steps[activeIndex];
  return (
    // min-w-0: as a flex item of a `flex-col` parent, this root would
    // otherwise size to its content's min-content width (the default
    // `min-width: auto` on flex items) and overflow that parent instead of
    // respecting it — the overflow-x-auto below only has room to activate
    // once this box is actually constrained to the parent's width.
    <div className="min-w-0">
      {/* Compact variant — small screens: current step only */}
      <div className="flex items-center gap-3 sm:hidden">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">
          {activeIndex + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-2xs font-medium text-muted-foreground">
            {t('stepCount', { current: activeIndex + 1, total: steps.length })}
          </div>
          <div className="truncate text-caption font-semibold text-foreground">{active?.label}</div>
        </div>
        <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Full variant — sm and up: every step. overflow-x-auto is a no-op
          when everything fits (no visible scrollbar); it only kicks in as a
          safety net if a long label set ever overflows a narrow column. */}
      <div className="hidden items-center overflow-x-auto sm:flex">
        {steps.map((step, i) => {
          const done = i < activeIndex;
          const isActive = i === activeIndex;
          const reachable = i <= maxReachedIndex;
          return (
            <div key={step.id} className="flex shrink-0 items-center">
              {i > 0 && (
                <div
                  // A fixed width regardless of viewport size: this bar lives
                  // in variable-width columns (a full-width page column here,
                  // a fixed-width modal elsewhere), not the viewport itself,
                  // so widening the connector just because the browser window
                  // is large doesn't track the space actually available.
                  className={`mx-2 h-px w-8 shrink-0 ${done || isActive ? 'bg-primary' : 'bg-border'}`}
                />
              )}
              <button
                type="button"
                onClick={() => reachable && onStepSelect(i)}
                disabled={!reachable}
                aria-current={isActive ? 'step' : undefined}
                className={`flex shrink-0 items-center gap-1.5 ${reachable ? '' : 'cursor-default'}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-2xs font-bold ${
                    done || isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {done ? <Check size={12} /> : i + 1}
                </span>
                <span
                  className={`text-caption whitespace-nowrap ${
                    isActive
                      ? 'font-semibold text-primary'
                      : done
                        ? 'font-medium text-foreground'
                        : 'font-medium text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
