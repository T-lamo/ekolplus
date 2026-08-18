'use client';

// Banani `.billing-toggle` : muted pill, two 12px/600 options, the active
// one on a white chip with a soft shadow, plus the green « Économisez 10 % »
// badge. Reused by the plan cards header and the checkout récap.
import { ANNUAL_DISCOUNT, type BillingIntervalKey } from '@/lib/billing-plans';
import { cn } from '@/lib/utils';

export function BillingCycleToggle({
  value,
  onChange,
  disabled,
  showSaving = true,
  className,
}: {
  value: BillingIntervalKey;
  onChange: (v: BillingIntervalKey) => void;
  disabled?: boolean;
  showSaving?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="radiogroup"
        aria-label="Cycle de facturation"
        className="flex items-center gap-0.5 rounded-full bg-muted p-[3px]"
      >
        {(['MONTH', 'YEAR'] as const).map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={cn(
                'rounded-full px-4 py-[5px] text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                active
                  ? 'bg-card text-primary shadow-[0_1px_4px_rgba(0,0,0,0.09)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt === 'MONTH' ? 'Mensuel' : 'Annuel'}
            </button>
          );
        })}
      </div>
      {showSaving && (
        <span className="rounded-full bg-success px-[9px] py-[3px] text-[10px] font-bold whitespace-nowrap text-success-foreground">
          Économisez {Math.round(ANNUAL_DISCOUNT * 100)} %
        </span>
      )}
    </div>
  );
}
