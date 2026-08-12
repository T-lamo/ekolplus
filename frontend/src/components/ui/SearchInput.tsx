import { forwardRef, type InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Unlabeled search input for toolbar filter rows — same h-10 control height
 * as Field/Select/Button, without the <label> wrapper those need for real
 * form fields. Was duplicated inline (search icon + input) across every
 * list page's toolbar; consolidated here to keep sizing in sync. */
export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <span className="relative flex h-10 min-w-0 flex-1 items-center">
      <Search size={14} className="pointer-events-none absolute left-3 text-muted-foreground" />
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-md border border-border bg-card pr-3 pl-8 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/10',
          className,
        )}
        {...props}
      />
    </span>
  ),
);
SearchInput.displayName = 'SearchInput';
