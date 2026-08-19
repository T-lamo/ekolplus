import { forwardRef, type InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Unlabeled search input for toolbar filter rows — same h-10 control height
 * as Field/Select/Button, without the <label> wrapper those need for real
 * form fields. Was duplicated inline (search icon + input) across every
 * list page's toolbar; consolidated here to keep sizing in sync. */
export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    // Every caller's `className` is a sizing constraint (max-w-*, min-w-*,
    // flex-1...) meant for "the search control" as a whole, so it belongs on
    // this wrapper — the actual flex item in the toolbar row — not on the
    // `<input>` inside it. A text `<input>`'s own rendered width has a
    // browser-enforced floor around its padding/border box (~46px here) that
    // no CSS can shrink below (not `width`, not `min-width`, not even an
    // inline `!important`); a caller-supplied `min-w-[…]` landing on the
    // input instead of the wrapper let the input demand more room than its
    // flex-shrunk parent had, and it silently overflowed into the next
    // toolbar control instead of the row wrapping onto a new line.
    <span className={cn('relative flex h-10 min-w-[140px] flex-1 items-center', className)}>
      <Search size={14} className="pointer-events-none absolute left-3 text-muted-foreground" />
      <input
        ref={ref}
        className="h-10 w-full rounded-md border border-border bg-card pr-3 pl-8 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/10"
        {...props}
      />
    </span>
  ),
);
SearchInput.displayName = 'SearchInput';
