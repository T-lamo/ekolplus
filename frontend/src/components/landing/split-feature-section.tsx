'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Illustration, Kicker } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';
import { useTilt } from './use-tilt';

/**
 * Banani `#attendance` / `#finance` — the two mirrored split sections:
 * a visual panel (illustration card + floating metric badge) on one side,
 * kicker + title + checklist on the other. `reverse` renders the finance
 * variant (copy left, visual right, badge on the right edge).
 */
export interface SplitFeatureProps {
  id: string;
  kicker: string;
  title: ReactNode;
  text: string;
  checks: string[];
  illustration: string;
  illustrationAlt: string;
  badge: { title: string; big: string; small: string };
  reverse?: boolean;
  tinted?: boolean;
}

export function SplitFeatureSection({
  id,
  kicker,
  title,
  text,
  checks,
  illustration,
  illustrationAlt,
  badge,
  reverse = false,
  tinted = false,
}: SplitFeatureProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const visualFrom = reduceMotion ? 0 : reverse ? 40 : -40;
  const tilt = useTilt(3);

  const visual = (
    <div className="relative flex min-h-[320px] items-center justify-center lg:min-h-[380px]">
      <motion.div
        initial={{ opacity: 0, x: visualFrom }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={viewportOnce}
        transition={{ duration: 0.65, ease: [0.5, 0, 0, 1] }}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        style={tilt.style}
        className="relative w-full max-w-[480px] rounded-3xl border border-border bg-card p-5 shadow-[0_24px_54px_rgba(15,23,42,0.10)]"
      >
        <div className="flex h-[240px] items-center justify-center overflow-hidden rounded-[18px] bg-[linear-gradient(180deg,#f8fbff_0%,#eff7ff_100%)] sm:h-[300px]">
          <Illustration src={illustration} alt={illustrationAlt} className="p-3.5" />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={viewportOnce}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.35 }}
          className={`absolute top-7 w-[184px] rounded-2xl border border-border bg-card px-3.5 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.10)] ${
            reverse ? '-right-2 lg:-right-4' : '-left-2 lg:-left-5'
          }`}
        >
          <div className="text-[11px] text-muted-foreground">{badge.title}</div>
          <div className="mt-[5px] text-2xl leading-none font-extrabold tracking-[-0.8px] text-foreground">
            {badge.big}
          </div>
          <div className="mt-1 text-xs text-[#10b981]">{badge.small}</div>
        </motion.div>
      </motion.div>
    </div>
  );

  const copy = (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      variants={staggerContainer(0.08)}
    >
      <motion.div variants={fadeUp}>
        <Kicker>{kicker}</Kicker>
      </motion.div>
      <motion.h2
        variants={fadeUp}
        className="mt-4 text-[30px] leading-[1.08] font-extrabold tracking-[-1px] text-foreground sm:text-[38px] lg:text-[46px] lg:leading-[1.06] lg:tracking-[-1.5px]"
      >
        {title}
      </motion.h2>
      <motion.p
        variants={fadeUp}
        className="mt-4 max-w-[680px] text-[15px] leading-[1.75] text-muted-foreground"
      >
        {text}
      </motion.p>
      <div className="mt-[26px] flex flex-col gap-3">
        {checks.map((check) => (
          <motion.div key={check} variants={fadeUp} className="flex items-start gap-3">
            <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent">
              <Check className="h-3.5 w-3.5 text-accent-foreground" aria-hidden="true" />
            </span>
            <span className="text-sm leading-[1.65] text-muted-foreground">{check}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );

  return (
    <section
      id={id}
      className={`scroll-mt-24 px-6 py-16 lg:px-12 lg:py-[92px] ${tinted ? 'bg-secondary' : ''}`}
    >
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        {reverse ? (
          <>
            {copy}
            {visual}
          </>
        ) : (
          <>
            {visual}
            {copy}
          </>
        )}
      </div>
    </section>
  );
}
