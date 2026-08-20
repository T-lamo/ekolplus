'use client';

import { motion } from 'framer-motion';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';
import { useCountUp } from './use-count-up';

const STATS = [
  { prefix: '+', value: 98, suffix: '%', label: 'Précision des données académiques en temps réel' },
  {
    prefix: '',
    value: 100,
    suffix: '%',
    label: 'Processus de scolarité centralisés au même endroit',
  },
  {
    prefix: '-',
    value: 50,
    suffix: '%',
    label: 'Réduction des retards de paiement et relances manuelles',
  },
  {
    prefix: '',
    value: 24,
    suffix: '/7',
    label: 'Accès web pour la direction, les enseignants et les familles',
  },
];

function StatChip({ prefix, value, suffix, label }: (typeof STATS)[number]) {
  const { ref, value: shown } = useCountUp(value);
  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      whileHover={{ y: -6, scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className="rounded-[24px_16px_22px_18px] border border-[rgba(20,15,30,0.08)] bg-white/[0.58] p-[18px] sm:p-[22px]"
    >
      <div className="text-[32px] leading-none font-extrabold tracking-[-2px] text-[#291d3f] sm:text-[42px]">
        {prefix}
        {shown}
        {suffix}
      </div>
      <div className="mt-2 text-xs text-[#5b526a]">{label}</div>
    </motion.div>
  );
}

/** `#statsBand`/`#statsPaper` — the rotated "paper" card sitting on the dark
 * hero backdrop, 4-stat grid with a count-up on scroll-into-view. */
export function StatsBand() {
  return (
    <section id="statsBand" className="px-4 pt-8 sm:px-6 lg:px-10">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={staggerContainer(0.08)}
        className="relative mx-auto max-w-[1180px] rounded-[28px_24px_32px_22px] border border-white/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,235,250,0.94))] p-5 text-[#140f1e] shadow-[0_30px_80px_rgba(0,0,0,0.18)] sm:rotate-[-1deg] sm:rounded-[38px_34px_44px_30px] sm:p-7"
      >
        <div className="grid grid-cols-2 gap-3.5 sm:gap-[18px] lg:grid-cols-4">
          {STATS.map((stat) => (
            <StatChip key={stat.label} {...stat} />
          ))}
        </div>
      </motion.div>
    </section>
  );
}
