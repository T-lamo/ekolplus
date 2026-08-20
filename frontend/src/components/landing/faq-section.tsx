'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { motion } from 'framer-motion';
import { MessageCircleQuestion, Plus } from 'lucide-react';
import { SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';

// Real product FAQ (kept from the pre-redesign FaqSection — richer and more
// accurate than Banani's 3 generic placeholder Q&As, per the "stay useful"
// call on content vs. chrome).
const FAQS = [
  {
    q: 'Ça marche même sans Internet ?',
    a: "Oui. Vous pouvez faire l'appel même sans connexion. Tout se met à jour automatiquement dès que le réseau revient, ce qui est utile là où Internet est instable.",
  },
  {
    q: 'Est-ce un LMS (cours en ligne) ?',
    a: "Non. SchoolGesti est un système d'information scolaire (SIS) : il gère le dossier administratif et le cursus (inscriptions, frais de scolarité, présences, notes et bulletins officiels), pas le contenu des cours. Il se combine très bien avec un LMS si vous en utilisez un.",
  },
  {
    q: 'Mes données sont-elles bien protégées ?',
    a: "Vos données sont protégées dans un environnement sécurisé. Même si notre solution est utilisée par plusieurs établissements, chaque école dispose de son propre espace privé. Les informations de votre établissement restent confidentielles et ne sont accessibles qu'aux personnes que vous avez autorisées.",
  },
  {
    q: 'Comment se passe la mise en route ?',
    a: "Nous créons votre établissement et son compte administrateur ; vous ajoutez ensuite classes, enseignants et élèves depuis l'application. Une démonstration guidée est proposée.",
  },
  {
    q: 'Tout est-il déjà disponible ?',
    a: "Toute la gestion administrative et pédagogique est prête dès aujourd'hui : dossiers élèves, classes, notes, appréciations, bulletins PDF, présences, emploi du temps, frais de scolarité, paiements et relances, passage d'année, et un espace pour les parents et les élèves.",
  },
];

export function FaqSection() {
  return (
    <section className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-[74px] lg:px-10">
      <div className="mx-auto max-w-[1280px]">
        <SectionHead
          icon={MessageCircleQuestion}
          kicker="Questions fréquentes"
          title="Vous avez des questions ?"
          text="Tout ce qu'il faut savoir avant de démarrer avec SchoolGesti."
          centered
          className="mx-auto"
        />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer(0.08)}
          className="mx-auto mt-9 flex max-w-[980px] flex-col gap-3.5 sm:mt-14"
        >
          <Accordion.Root type="multiple" className="flex flex-col gap-3.5">
            {FAQS.map((item) => (
              <motion.div key={item.q} variants={fadeUp}>
                <Accordion.Item
                  value={item.q}
                  className="group rounded-[24px_16px_24px_18px] border border-border bg-white/5 px-5 py-1 shadow-[0_16px_40px_rgba(0,0,0,0.16)] transition-colors duration-300 hover:border-white/25 hover:bg-white/[0.08] sm:px-[22px]"
                >
                  <Accordion.Header>
                    <Accordion.Trigger className="flex w-full items-center justify-between gap-3.5 py-[19px] text-left text-[15px] font-bold text-foreground">
                      {item.q}
                      <span className="inline-flex shrink-0 items-center justify-center text-muted-foreground">
                        <Plus
                          className="h-4 w-4 transition-transform duration-300 group-data-[state=open]:rotate-45"
                          aria-hidden="true"
                        />
                      </span>
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="accordion-content overflow-hidden">
                    <p className="pb-5 text-[13px] leading-relaxed text-secondary-foreground">
                      {item.a}
                    </p>
                  </Accordion.Content>
                </Accordion.Item>
              </motion.div>
            ))}
          </Accordion.Root>
        </motion.div>
      </div>
    </section>
  );
}
