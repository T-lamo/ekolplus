import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

/** Labeled native select matching Banani's `.form-select` shape. Native
 * <select> rather than a headless-UI listbox — first real consumer, no need
 * for custom option rendering yet. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, className, id, children, ...props }, ref) => {
    const selectId = id ?? props.name;
    return (
      <label htmlFor={selectId} className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'min-h-12 w-full cursor-pointer appearance-none rounded-md border border-border bg-input py-2.5 pr-9 pl-3 text-sm text-foreground focus:border-primary focus:ring-3 focus:ring-primary/10 focus:outline-none',
              className,
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3 text-muted-foreground"
          />
        </span>
      </label>
    );
  },
);
Select.displayName = 'Select';
