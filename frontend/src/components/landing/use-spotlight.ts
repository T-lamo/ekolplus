'use client';

import { type MouseEvent } from 'react';
import { useMotionTemplate, useMotionValue } from 'framer-motion';

/** Cursor-tracked radial glow for "premium SaaS" hover cards (Linear/
 * Stripe-style). Position is written straight into a CSS `background` via
 * `useMotionTemplate` — no React re-render per mouse-move, so it stays
 * smooth even on cards with a lot of children.
 *
 * One call per card instance (rules-of-hooks — never call this inside a
 * `.map()` callback; extract a per-item component instead). Consumers
 * spread `onMouseMove` onto the card element and pass `background` as the
 * `style` of an absolutely-positioned `inset-0` overlay that fades in via
 * `group-hover:opacity-100`. */
export function useSpotlight(color = 'rgba(199,167,255,0.16)', radius = 260) {
  const x = useMotionValue(-9999);
  const y = useMotionValue(-9999);

  function onMouseMove(e: MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
  }

  const background = useMotionTemplate`radial-gradient(${radius}px circle at ${x}px ${y}px, ${color}, transparent 70%)`;

  return { onMouseMove, background };
}
