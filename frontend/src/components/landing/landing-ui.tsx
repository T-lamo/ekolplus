'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { tapScale } from './landing-motion';

/**
 * Shared landing primitives — dark "Lavande Douce" marketing theme (see
 * `#landing-root` in globals.css). Reused across every section rewritten
 * from the Banani export: nav, hero, features, roles, steps, pricing,
 * demo and faq all share the same kicker-pill / CTA-pill shapes.
 */

const MotionLink = motion.create(Link);

const ctaBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold';

const ctaVariant = {
  primary: cn(
    ctaBase,
    'bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_22px_42px_-6px_rgba(199,167,255,0.45)]',
  ),
  secondary: cn(ctaBase, 'border border-border bg-white/5 text-foreground'),
} as const;

export function CtaLink({
  href,
  variant = 'primary',
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof ctaVariant;
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(ctaVariant[variant], 'px-6 py-3.5', className);
  const hover = {
    scale: 1.045,
    y: -3,
    boxShadow:
      variant === 'primary'
        ? '0 28px 52px -8px rgba(199,167,255,0.6)'
        : '0 16px 32px -8px rgba(0,0,0,0.3)',
  };
  const hoverTransition = { type: 'spring' as const, stiffness: 340, damping: 18 };
  if (href.startsWith('#')) {
    return (
      <motion.a
        href={href}
        className={classes}
        whileHover={hover}
        whileTap={tapScale}
        transition={hoverTransition}
      >
        {children}
      </motion.a>
    );
  }
  return (
    <MotionLink
      href={href}
      className={classes}
      whileHover={hover}
      whileTap={tapScale}
      transition={hoverTransition}
    >
      {children}
    </MotionLink>
  );
}

/** `.hero-pill` / `.section-kicker` — small rounded label with a lucide icon. */
export function Kicker({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-white/[0.06] px-3.5 py-2 text-[11px] font-bold tracking-wide text-accent">
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}

/** `.section-head` — kicker + title + description, centered or left-aligned.
 * Shared by FeaturesSection, RolesSection, StepsSection, PricingSection,
 * DemoRequestSection and FaqSection (the `.section` pattern in Banani). */
export function SectionHead({
  icon,
  kicker,
  title,
  text,
  centered = false,
  className,
}: {
  icon: LucideIcon;
  kicker: string;
  title: ReactNode;
  text: string;
  centered?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('max-w-[680px]', centered && 'mx-auto text-center', className)}>
      <Kicker icon={icon}>{kicker}</Kicker>
      <h2 className="mt-[18px] mb-2.5 text-[28px] leading-[1.1] font-extrabold tracking-[-0.01em] text-foreground sm:text-[36px] lg:text-[48px] lg:leading-[1.06] lg:tracking-[-2px]">
        {title}
      </h2>
      <p
        className={cn('max-w-[620px] text-[15px] text-secondary-foreground', centered && 'mx-auto')}
      >
        {text}
      </p>
    </div>
  );
}

const ICON_PLATE_SIZES = {
  lg: { plate: 'h-[54px] w-[54px] rounded-[18px_18px_18px_14px]', icon: 'h-6 w-6' },
  md: { plate: 'h-[42px] w-[42px] rounded-[14px]', icon: 'h-5 w-5' },
  sm: { plate: 'h-10 w-10 rounded-[14px]', icon: 'h-[18px] w-[18px]' },
} as const;

/** `.feature-icon-wrap` — the small rounded icon plate reused by features
 * (lg), roles (md) and the steps ribbon / demo points list (sm). */
export function IconPlate({
  icon: Icon,
  size = 'lg',
  className,
}: {
  icon: LucideIcon;
  size?: keyof typeof ICON_PLATE_SIZES;
  className?: string;
}) {
  const { plate, icon } = ICON_PLATE_SIZES[size];
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center border border-[rgba(41,29,63,0.08)] bg-[rgba(155,107,255,0.10)]',
        plate,
        className,
      )}
    >
      <Icon className={cn('text-primary', icon)} aria-hidden="true" />
    </div>
  );
}
