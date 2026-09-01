'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Mail, MapPinned, Phone, type LucideIcon } from 'lucide-react';
import { CtaLink, SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';
import { DemoRequestForm } from './demo-request-form';

/**
 * Banani `#contact` — section header, 2-column grid (contact-methods card +
 * the demo-request form) and the dark gradient CTA band underneath. The
 * band's gradient breathes slowly (authored motion — the export is static).
 */

interface ContactMethod {
  icon: LucideIcon;
  title: string;
  text: string;
}

const METHODS: ContactMethod[] = [
  {
    icon: Phone,
    title: 'Téléphone',
    text: 'Échange rapide pour comprendre votre taille, votre organisation et vos priorités.',
  },
  {
    icon: Mail,
    title: 'Email professionnel',
    text: 'Recevez une réponse structurée avec démonstration, devis ou ressources utiles.',
  },
  {
    icon: MapPinned,
    title: 'Accompagnement local',
    text: 'Un discours adapté au contexte des établissements haïtiens et francophones.',
  },
];

export function DemoRequestSection() {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <section id="contact" className="scroll-mt-24 px-6 py-16 lg:px-12 lg:py-[92px]">
      <div className="mx-auto max-w-[1280px]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
        >
          <SectionHead
            kicker="Prise de contact"
            title="Parlons de votre école et de vos besoins"
            text="Que vous cherchiez une démonstration, un devis ou une première discussion, notre équipe vous répond avec un cadrage clair et des recommandations adaptées."
          />
        </motion.div>

        <div className="mt-[38px] grid grid-cols-1 items-start gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={staggerContainer(0.1)}
            className="rounded-[18px] border border-border bg-card p-6 sm:p-[26px]"
          >
            <motion.h3 variants={fadeUp} className="text-[17px] font-extrabold text-foreground">
              Un accompagnement humain, dès le premier échange
            </motion.h3>
            <div className="mt-[18px] flex flex-col gap-3.5">
              {METHODS.map((method) => {
                const Icon = method.icon;
                return (
                  <motion.div
                    key={method.title}
                    variants={fadeUp}
                    className="flex items-start gap-3.5 rounded-[14px] bg-secondary p-4"
                  >
                    <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-card">
                      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-foreground">{method.title}</div>
                      <div className="mt-1 text-[13px] leading-[1.6] text-muted-foreground">
                        {method.text}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          <DemoRequestForm />
        </div>

        {/* CTA band (Banani `.cta-band`). */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          className="relative mt-6 overflow-hidden rounded-[22px] px-6 py-10 text-center sm:px-[26px]"
        >
          <motion.div
            aria-hidden="true"
            {...(reduceMotion ? {} : { animate: { opacity: [1, 0.75, 1] } })}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 bg-[linear-gradient(135deg,#0f172a_0%,#0f172a_60%,#2563eb_100%)]"
          />
          <div className="relative">
            <h2 className="text-[30px] leading-[1.08] font-extrabold tracking-[-1.2px] text-white sm:text-[38px] lg:text-[42px]">
              Prêt à moderniser
              <br />
              votre école ?
            </h2>
            <p className="mx-auto mt-3.5 max-w-[640px] text-[15px] leading-[1.7] text-white/[0.74]">
              Rejoignez les établissements qui utilisent déjà SchoolGesti pour centraliser leur
              gestion scolaire, simplifier le travail administratif et améliorer le suivi
              pédagogique.
            </p>
            <div className="mt-[26px] flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CtaLink href="#contact" className="w-full sm:w-auto">
                Demander une démo gratuite
              </CtaLink>
              <CtaLink href="#pricing" variant="light" className="w-full sm:w-auto">
                Voir les tarifs
              </CtaLink>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
