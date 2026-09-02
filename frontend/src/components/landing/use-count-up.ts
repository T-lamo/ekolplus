'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

/** Counts from 0 to `target` once the returned `ref` scrolls into view —
 * used by the proof strip's 5 numbers. The low `amount` threshold starts
 * the count as soon as the number peeks into the viewport, and the
 * quadratic ease keeps digits visibly ticking through the whole duration
 * (a sharper ease finishes most of the movement before the eye catches
 * it). Honors prefers-reduced-motion (jumps straight to `target`). */
export function useCountUp(target: number, duration = 2400) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 2;
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduceMotion, target, duration]);

  return { ref, value };
}
