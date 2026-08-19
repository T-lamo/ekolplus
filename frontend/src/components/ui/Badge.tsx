// Generic status pill — same visual contract as the Frais & Scolarité
// badges (school/fees/badges.tsx) so a status reads identically anywhere in
// the app; extracted now that the SaaS admin screens push the pattern past
// rule-of-three (school/subscription/transaction/coupon/user statuses).
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'success' | 'warning' | 'destructive' | 'muted' | 'primary' | 'gold';

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  muted: 'bg-secondary text-secondary-foreground',
  primary: 'bg-primary/10 text-primary',
  // Paid plan (Pro / Enterprise) — see globals.css --color-gold-*.
  gold: 'bg-gold-100 text-gold-700',
};

export function Badge({
  tone = 'muted',
  className,
  title,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  /** Native tooltip — a one-line explanation of the status. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
