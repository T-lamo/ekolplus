'use client';

import { motion } from 'framer-motion';
import { SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';
import { useSpotlight } from './use-spotlight';
import { useTilt } from './use-tilt';

/**
 * Banani `#onboarding` — the 3-step "ruban lumineux": a 32px-radius glass
 * shell holding 3 glow blobs, a horizontal gradient line (drawn in on
 * scroll) and 3 numbered step cards, the middle one resting 24px lower
 * (via margin, not transform — framer-motion's inline transform would
 * silently override a CSS translate once the entrance animation runs).
 * The mock's subtitle was Banani's own design rationale, replaced with
 * real product copy (same call as v1's roles section).
 */

const STEPS = [
  {
    number: '1',
    numberClass: 'bg-foreground text-white',
    title: 'Demandez une démo',
    text: 'Nous découvrons votre structure, vos classes, vos contraintes administratives et votre organisation pédagogique.',
    featured: false,
  },
  {
    number: '2',
    numberClass: 'bg-primary text-primary-foreground',
    title: "Nous préparons l'espace",
    text: 'Configuration des classes, des matières, des coefficients, des modèles et de la structure de scolarité.',
    featured: true,
  },
  {
    number: '3',
    numberClass: 'bg-[#10b981] text-white',
    title: 'Votre établissement pilote',
    text: 'Direction, enseignants et familles travaillent dans un SIS fluide, premium et prêt pour le quotidien.',
    featured: false,
  },
];

function StepCard({ step }: { step: (typeof STEPS)[number] }) {
  const { onMouseMove, background } = useSpotlight('rgba(37,99,235,0.10)', 260);
  const tilt = useTilt(6);
  return (
    <div className={step.featured ? 'lg:mt-6' : ''}>
      <motion.div
        variants={fadeUp}
        whileHover={{ y: -5, transition: { type: 'spring', stiffness: 300, damping: 22 } }}
        onMouseMove={(e) => {
          onMouseMove(e);
          tilt.onMouseMove(e);
        }}
        onMouseLeave={tilt.onMouseLeave}
        style={tilt.style}
        className={`group relative min-h-[224px] overflow-hidden rounded-3xl border p-6 backdrop-blur-[10px] ${
          step.featured
            ? 'border-[rgba(220,228,240,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(248,250,252,0.86)_100%)] shadow-[0_20px_44px_rgba(37,99,235,0.12)]'
            : 'border-[rgba(220,228,240,0.92)] bg-white/[0.76] shadow-[0_16px_34px_rgba(15,23,42,0.06)]'
        }`}
      >
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background }}
        />
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <div
              className={`flex h-[46px] w-[46px] items-center justify-center rounded-2xl text-xl font-extrabold ${step.numberClass}`}
            >
              {step.number}
            </div>
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={viewportOnce}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.3 }}
              className="h-4 w-4 shrink-0 rounded-full bg-[rgba(37,99,235,0.16)] shadow-[0_0_0_8px_rgba(37,99,235,0.06)]"
              aria-hidden="true"
            />
          </div>
          <div className="mt-[18px] text-[22px] leading-[1.15] font-extrabold tracking-[-0.7px] text-foreground">
            {step.title}
          </div>
          <div className="mt-3 text-sm leading-[1.75] text-muted-foreground">{step.text}</div>
        </div>
      </motion.div>
    </div>
  );
}

export function StepsSection() {
  return (
    <section
      id="onboarding"
      className="scroll-mt-24 bg-[linear-gradient(180deg,#f1f5f9_0%,#f8fafc_100%)] px-6 py-16 lg:px-12 lg:py-[92px]"
    >
      <div className="mx-auto max-w-[1280px]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
        >
          <SectionHead
            kicker="Démarrage guidé"
            title="Comment démarrer ?"
            text="Une mise en route simple, en trois étapes, avec notre équipe à vos côtés du premier échange jusqu'au lancement."
            centered
            className="max-w-[760px]"
          />
        </motion.div>

        <div className="relative mt-10 overflow-hidden rounded-[32px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.82)_56%,rgba(241,245,249,0.96)_100%)] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:px-[34px] sm:py-10">
          {/* Glow blobs (Banani #onboarding-glow-a/b/c). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-6 left-[4%] h-[260px] w-[260px] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.18),rgba(37,99,235,0))] blur-[10px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[76px] right-[10%] h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.12),rgba(37,99,235,0))] blur-[10px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-10 left-[34%] h-[180px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(167,243,208,0.46),rgba(167,243,208,0))] blur-[10px]"
          />
          {/* Gradient ribbon line, drawn in on scroll (desktop only — it runs
              behind the cards, invisible in the single-column stack). */}
          <motion.div
            aria-hidden="true"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={viewportOnce}
            transition={{ duration: 0.9, ease: [0.5, 0, 0, 1] }}
            className="absolute inset-x-[7%] top-1/2 hidden h-2.5 origin-left -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,rgba(37,99,235,0.08)_0%,rgba(37,99,235,0.45)_24%,rgba(167,243,208,0.75)_50%,rgba(37,99,235,0.45)_76%,rgba(37,99,235,0.08)_100%)] shadow-[0_0_32px_rgba(37,99,235,0.20)] lg:block"
          />

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={staggerContainer(0.12)}
            className="relative z-[2] grid grid-cols-1 items-start gap-5 lg:grid-cols-3"
          >
            {STEPS.map((step) => (
              <StepCard key={step.number} step={step} />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
