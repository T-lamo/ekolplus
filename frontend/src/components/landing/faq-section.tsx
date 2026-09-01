'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Illustration, SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';
import { useTilt } from './use-tilt';
import { FAQS } from './faq-data';

/**
 * Banani `#faq`, reworked per user feedback: the section header (kicker +
 * title) spans the full width ABOVE the 2-column grid, so the
 * illustration (left) and the accordion (right) start at the same height.
 * The mock ships static markup (only the first answer expanded); this is
 * a real Radix accordion with independent toggles, reusing the FAQS array
 * the FAQPage JSON-LD in app/page.tsx also reads (content kept from v1 —
 * real product answers over the mock's placeholder Q&As).
 */
export function FaqSection() {
  const tilt = useTilt(4);
  return (
    <section id="faq" className="scroll-mt-24 px-6 py-16 lg:px-12 lg:py-[92px]">
      <div className="mx-auto max-w-[1280px]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
        >
          <SectionHead
            kicker="FAQ & choix"
            title={
              <>
                Vous avez des questions ?<br />
                Nous avons des réponses.
              </>
            }
          />
        </motion.div>

        <div className="mt-10 grid grid-cols-1 items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={fadeUp}
            onMouseMove={tilt.onMouseMove}
            onMouseLeave={tilt.onMouseLeave}
            style={tilt.style}
            className="rounded-[18px] border border-border bg-secondary p-5"
          >
            <div className="flex h-56 items-center justify-center overflow-hidden rounded-[14px] sm:h-72">
              <Illustration src="/illustrations/yes-or-no.svg" alt="Illustration FAQ SchoolGesti" />
            </div>
            <div className="mt-4 rounded-[14px] bg-[rgba(16,185,129,0.10)] p-4 text-accent-foreground">
              <p className="text-sm font-bold">Vous hésitez encore ?</p>
              <p className="mt-1 text-[13px] leading-[1.6]">
                Nous vous aidons à choisir le bon plan selon vos effectifs, vos priorités et votre
                organisation interne.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={staggerContainer(0.07)}
          >
            <Accordion.Root type="multiple" className="flex flex-col">
              {FAQS.map((item, i) => (
                <motion.div key={item.q} variants={fadeUp}>
                  <Accordion.Item
                    value={item.q}
                    className={`group border-b border-border py-1 ${i === 0 ? 'border-t' : ''}`}
                  >
                    <Accordion.Header>
                      <Accordion.Trigger className="flex min-h-12 w-full items-center justify-between gap-4 py-4 text-left text-[15px] leading-[1.45] font-semibold text-foreground">
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
                      <p className="pb-5 text-sm leading-[1.7] text-muted-foreground">{item.a}</p>
                    </Accordion.Content>
                  </Accordion.Item>
                </motion.div>
              ))}
            </Accordion.Root>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
