'use client';

import { motion } from 'framer-motion';
import { Rocket } from 'lucide-react';
import { SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';
import { useSpotlight } from './use-spotlight';

// `#stepsRibbon` — verbatim Banani copy ("Démarrage guidé").
const STEPS = [
  {
    n: 1,
    title: 'Demandez une démo',
    text: 'Nous découvrons votre structure, vos classes, vos contraintes administratives et votre organisation pédagogique.',
  },
  {
    n: 2,
    title: 'Nous préparons l’espace',
    text: 'Configuration des classes, des matières, des coefficients, des modèles et de la structure de scolarité.',
  },
  {
    n: 3,
    title: 'Votre établissement pilote',
    text: 'Direction, enseignants et familles travaillent dans un SIS fluide, premium et prêt pour le quotidien.',
  },
];

export function StepsSection() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
      <div className="mx-auto max-w-[1280px]">
        <SectionHead
          icon={Rocket}
          kicker="Démarrage guidé"
          title="Comment démarrer ?"
          text="Une mise en route simple, mise en scène dans un ruban lumineux plus immersif que des cartes rectangulaires standard."
          centered
          className="mx-auto"
        />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          className="relative mt-10 rounded-[28px_20px_26px_22px] border border-border bg-[linear-gradient(145deg,rgba(21,16,33,0.90),rgba(24,18,37,0.72))] p-6 shadow-[0_34px_86px_rgba(0,0,0,0.24)] sm:mt-14 sm:rounded-[42px_28px_36px_30px] sm:p-9"
        >
          <motion.div
            variants={staggerContainer(0.12)}
            className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-[18px]"
          >
            {STEPS.map((step) => (
              <StepCard key={step.n} step={step} />
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function StepCard({ step }: { step: (typeof STEPS)[number] }) {
  const { onMouseMove, background } = useSpotlight('rgba(199,167,255,0.20)');

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -6, scale: 1.02, borderColor: 'rgba(199,167,255,0.4)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      onMouseMove={onMouseMove}
      className="group relative overflow-hidden rounded-[24px_16px_24px_18px] border border-white/[0.08] bg-white/[0.04] p-[22px]"
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background }}
      />
      <div className="relative z-10">
        <motion.div
          whileHover={{ rotate: 12, scale: 1.1 }}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-extrabold text-primary-foreground shadow-[0_14px_30px_rgba(155,107,255,0.30)]"
        >
          {step.n}
        </motion.div>
        <h3 className="mt-[18px] text-lg font-bold text-foreground">{step.title}</h3>
        <p className="mt-2 text-[13px] text-secondary-foreground">{step.text}</p>
      </div>
    </motion.div>
  );
}
