'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { tapScale } from './landing-motion';

/**
 * Shared landing primitives — light "Electric Blue" marketing theme (see
 * `#landing-root` in globals.css, plan: .planning/banani/landing-page-v2.md).
 * Reused across every section rebuilt from the Banani export: topbar, hero,
 * features, splits, onboarding, roles, pricing, faq, contact and footer all
 * share the same button / label-pill / icon-plate / section-head shapes.
 */

const MotionLink = motion.create(Link);

/** Banani `.btn-primary` / `.btn-light` / `.btn-ghost` — 44px, radius-md. */
const ctaBase =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-semibold';

const ctaVariant = {
  primary: cn(ctaBase, 'bg-primary text-primary-foreground'),
  /** For dark surfaces (hero, CTA band): translucent white glass. */
  light: cn(ctaBase, 'border border-white/15 bg-white/10 text-white'),
  /** For light surfaces (pricing): plain card with a border. */
  ghost: cn(ctaBase, 'border border-border bg-card text-foreground'),
} as const;

const ctaHoverShadow: Record<keyof typeof ctaVariant, string> = {
  primary: '0 16px 34px -8px rgba(37,99,235,0.55)',
  light: '0 14px 30px -8px rgba(0,0,0,0.35)',
  ghost: '0 14px 30px -10px rgba(15,23,42,0.25)',
};

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
  const classes = cn(ctaVariant[variant], className);
  const hover = { scale: 1.035, y: -2, boxShadow: ctaHoverShadow[variant] };
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

/** Banani `.soft-label` (light sections) / `.dark-label` (dark sections) —
 * small rounded pill above a section title, optional lucide icon. */
export function Kicker({
  icon: Icon,
  tone = 'soft',
  children,
}: {
  icon?: LucideIcon;
  tone?: 'soft' | 'dark';
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap',
        tone === 'soft'
          ? 'bg-secondary text-primary'
          : 'border border-white/[0.12] bg-white/10 text-white/[0.92]',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </div>
  );
}

/** Banani section header — `.soft-label`/`.dark-label` + `.section-title`
 * (46px/800/-1.5px) + `.section-subtitle`. `tone="dark"` for the sections
 * on a navy gradient (roles). */
export function SectionHead({
  icon,
  kicker,
  title,
  text,
  tone = 'light',
  centered = false,
  className,
}: {
  icon?: LucideIcon;
  kicker: string;
  title: ReactNode;
  text?: string;
  tone?: 'light' | 'dark';
  centered?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(centered && 'mx-auto text-center', className)}>
      <Kicker {...(icon ? { icon } : {})} tone={tone === 'dark' ? 'dark' : 'soft'}>
        {kicker}
      </Kicker>
      <h2
        className={cn(
          'mt-4 text-[30px] leading-[1.08] font-extrabold tracking-[-1px] sm:text-[38px] lg:text-[46px] lg:leading-[1.06] lg:tracking-[-1.5px]',
          tone === 'dark' ? 'text-white' : 'text-foreground',
        )}
      >
        {title}
      </h2>
      {text && (
        <p
          className={cn(
            'mt-4 max-w-[680px] text-[15px] leading-[1.75]',
            tone === 'dark' ? 'text-white/70' : 'text-muted-foreground',
            centered && 'mx-auto',
          )}
        >
          {text}
        </p>
      )}
    </div>
  );
}

/** Banani `.feature-icon` — 42px rounded-12 plate on `--secondary` with a
 * primary-colored lucide icon. `className` lets the dark highlight card
 * invert it (bg-white/10 + white icon). */
export function IconPlate({
  icon: Icon,
  className,
  iconClassName,
}: {
  icon: LucideIcon;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-secondary',
        className,
      )}
    >
      <Icon className={cn('h-5 w-5 text-primary', iconClassName)} aria-hidden="true" />
    </div>
  );
}

/** Local Storyset illustration (public/illustrations/*.svg, recolored to the
 * Electric Blue accent by scripts/recolor-illustrations.mjs). Rendered
 * unoptimized: they're already final SVGs, the optimizer adds nothing. */
export function Illustration({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={500}
      height={500}
      unoptimized
      className={cn('h-full w-full object-contain', className)}
    />
  );
}
