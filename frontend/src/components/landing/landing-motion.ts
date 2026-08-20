import type { Variants } from 'framer-motion';

/** Shared framer-motion variants for the landing page's scroll-reveal
 * (replaces the old IntersectionObserver `.reveal-up` CSS class). Every
 * section wraps its content in `motion.div variants={fadeUp}` /
 * `staggerContainer()` with `whileInView="visible"` + `viewport={viewportOnce}`. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.5, 0, 0, 1] } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: [0.5, 0, 0, 1] } },
};

export function staggerContainer(stagger = 0.1, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren } },
  };
}

export const viewportOnce = { once: true, amount: 0.2 } as const;

export const tapScale = { scale: 0.97 };
