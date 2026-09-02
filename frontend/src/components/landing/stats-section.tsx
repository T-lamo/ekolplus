'use client';

import { motion } from 'framer-motion';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';
import { useCountUp } from './use-count-up';

/**
 * Banani `#proof-strip` — white stat band under the hero. 5 marketing
 * figures (same illustrative-copy decision as v1), each counting up once
 * scrolled into view. `decimals` handles the "99.9%" uptime figure (the
 * hook animates integers, so the target is stored ×10 and rendered /10).
 */
interface Stat {
  target: number;
  decimals?: boolean;
  suffix: string;
  label: string;
}

const STATS: Stat[] = [
  { target: 10, suffix: '', label: 'Écoles accompagnées' },
  { target: 3, suffix: 'k+', label: 'Dossiers élèves gérés' },
  { target: 98, suffix: '%', label: 'Taux de satisfaction' },
  { target: 3, suffix: 'x', label: 'Moins de tâches manuelles' },
  { target: 999, decimals: true, suffix: '%', label: 'Temps de disponibilité' },
];

function StatCard({ stat }: { stat: Stat }) {
  const { ref, value } = useCountUp(stat.target);
  const display = stat.decimals ? (value / 10).toFixed(1) : String(value);
  return (
    <motion.div ref={ref} variants={fadeUp} className="px-4 py-6 text-center lg:px-[18px]">
      <div className="text-[28px] font-extrabold tracking-[-0.8px] text-foreground">
        {display}
        {stat.suffix}
      </div>
      <div className="mt-1 text-[13px] text-muted-foreground">{stat.label}</div>
    </motion.div>
  );
}

export function StatsBand() {
  return (
    <section className="border-b border-border bg-card">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={staggerContainer(0.08)}
        className="mx-auto grid max-w-[1280px] grid-cols-2 px-6 sm:grid-cols-3 lg:grid-cols-5 lg:px-12"
      >
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className={i === STATS.length - 1 ? 'col-span-2 sm:col-span-1' : ''}
          >
            <StatCard stat={stat} />
          </div>
        ))}
      </motion.div>
    </section>
  );
}
