'use client';

import { type MouseEvent } from 'react';
import { useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

/** Cursor-tracked 3D tilt for landing cards: the card leans toward the
 * mouse (spring-eased, resets flat on leave). Pair the returned handlers
 * with `style` on a motion element — the transform values are motion
 * values, so there is no React re-render per mouse-move.
 *
 * One call per card instance (rules-of-hooks — never call inside a
 * `.map()` callback; extract a per-item component instead). Honors
 * prefers-reduced-motion by simply never moving off 0°. */
export function useTilt(maxDeg = 7) {
  const reduceMotion = useReducedMotion() ?? false;
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 260, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [0, 1], [maxDeg, -maxDeg]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-maxDeg, maxDeg]), spring);

  function onMouseMove(e: MouseEvent<HTMLElement>) {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  }

  function onMouseLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return {
    onMouseMove,
    onMouseLeave,
    style: { rotateX, rotateY, transformPerspective: 900 },
  };
}
