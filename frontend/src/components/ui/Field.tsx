import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  trailing?: ReactNode;
}

/** Labeled input matching Banani's `.form-group` / `.form-input-wrap` shape,
 * with an optional leading icon and trailing slot (e.g. a show/hide toggle). */
export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, icon, trailing, className, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="flex items-center gap-2 rounded-md border-[1.5px] border-border bg-input px-3 py-2.5 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10">
          {icon && <span className="flex shrink-0 items-center text-primary">{icon}</span>}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground',
              className,
            )}
            {...props}
          />
          {trailing}
        </span>
      </label>
    );
  },
);
Field.displayName = 'Field';
