import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared landing primitives. The landing is a self-contained **light** marketing
 * surface: explicit `violet-*` (brand = the app's #7c3aed primary) + `slate-*`
 * (the design's greys are exactly the Tailwind slate palette) + white, so it
 * renders identically regardless of the app's dark-mode theme. Icons come from
 * lucide-react (the app's icon set), not the Material Symbols font.
 */

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600';

export const btnOutline =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 transition-colors hover:border-violet-300 hover:text-violet-600';

/** A CTA that navigates internally (e.g. to /login) or to an on-page anchor (#…). */
export function CtaLink({
  href,
  variant = 'primary',
  className,
  children,
}: {
  href: string;
  variant?: 'primary' | 'outline';
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(variant === 'primary' ? btnPrimary : btnOutline, className);
  // On-page anchors use a native <a> so the browser's smooth-scroll handles it.
  if (href.startsWith('#')) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

export function AppCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  );
}
