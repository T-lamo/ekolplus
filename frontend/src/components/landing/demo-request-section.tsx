'use client';

import { motion } from 'framer-motion';
import { ClipboardPenLine, Clock3, PanelTopOpen, ShieldCheck, type LucideIcon } from 'lucide-react';
import { DemoRequestForm } from './demo-request-form';
import { IconPlate, SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';

interface Point {
  icon: LucideIcon;
  title: string;
  text: string;
}

// `#demoZone .demo-copy` — verbatim Banani copy ("Démonstration sur rendez-vous").
const POINTS: Point[] = [
  {
    icon: Clock3,
    title: 'Retour rapide',
    text: 'Un expert vous recontacte avec un parcours adapté à votre structure et vos usages.',
  },
  {
    icon: PanelTopOpen,
    title: 'Scénarios concrets',
    text: 'Notes, finances, emplois du temps, bulletins et gestion administrative dans la même présentation.',
  },
  {
    icon: ShieldCheck,
    title: 'Confiance & accompagnement',
    text: 'Un onboarding cadré pour mettre votre équipe à l’aise dès les premiers jours.',
  },
];

export function DemoRequestSection() {
  return (
    <section id="contact-demo" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid grid-cols-1 items-center gap-9 lg:grid-cols-2">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={staggerContainer(0.1)}
            className="lg:pr-4"
          >
            <motion.div variants={fadeUp}>
              <SectionHead
                icon={ClipboardPenLine}
                kicker="Démonstration sur rendez-vous"
                title={
                  <>
                    Découvrez SchoolGesti
                    <br />
                    en action
                  </>
                }
                text="Une demande de démo transformée en objet physique : presse-papiers, texture, lumière et une promesse très concrète de clarté pour votre établissement."
              />
            </motion.div>
            <div className="mt-6 flex flex-col gap-4">
              {POINTS.map((point) => (
                <motion.div key={point.title} variants={fadeUp} className="flex items-start gap-3">
                  <IconPlate icon={point.icon} size="sm" />
                  <div>
                    <div className="text-sm font-bold text-foreground">{point.title}</div>
                    <div className="text-[13px] text-secondary-foreground">{point.text}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={fadeUp}
          >
            <DemoRequestForm />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
