'use client';

import { motion } from 'framer-motion';
import { Building2, Check, Gift, Zap, type LucideIcon } from 'lucide-react';
import { IconPlate, SectionHead } from './landing-ui';
import { fadeUp, scaleIn, staggerContainer, tapScale, viewportOnce } from './landing-motion';
import { useSpotlight } from './use-spotlight';
import { useTilt } from './use-tilt';

/**
 * Banani `#pricing` — 3 plan cards on the tinted band. Plan names come from
 * the mock (Gratuit / Pro / Grande École) but the numbers are the app's
 * REAL pricing (src/lib/billing-plans.ts — mirrored by the JSON-LD in
 * app/page.tsx): the mock's placeholder limits ($0.50, 30 élèves, 500 Mo)
 * are not what checkout actually charges.
 *
 * Gold = the recommended paid plan (user instruction, overriding the
 * mock's green badge — mirrors the app's own "or = payant" convention,
 * e.g. SchoolPlanCard / ThemePicker gold tokens).
 */

interface Plan {
  icon: LucideIcon;
  name: string;
  pricePrefix?: string;
  price: string;
  priceSize?: 'sm';
  priceNote?: string;
  desc: string;
  features: string[];
  cta: string;
  recommended?: boolean;
}

const PLANS: Plan[] = [
  {
    icon: Gift,
    name: 'Gratuit',
    price: '$0',
    priceNote: '/ mois, pour toujours',
    desc: 'Pour découvrir SchoolGesti sur un petit effectif et tester les usages essentiels.',
    features: [
      "Jusqu'à 50 élèves",
      'Dossiers élèves, classes & enseignants',
      'Notes, bulletins PDF & présences',
      'Frais de scolarité, paiements & relances',
      'Portail parents & élèves',
    ],
    cta: 'Commencer gratuitement',
  },
  {
    icon: Zap,
    name: 'Pro',
    pricePrefix: 'À partir de',
    price: '0,40 $',
    priceNote: '/ élève / mois',
    desc: 'Le meilleur choix pour structurer votre gestion scolaire avec une équipe administrative plus sereine.',
    features: [
      'Tout du plan Gratuit',
      "Jusqu'à 1000 élèves",
      'Sièges facturés = effectifs réels',
      'Essai gratuit 30 jours',
      'Factures & reçus en ligne (Stripe)',
      'Support prioritaire',
    ],
    cta: 'Essai gratuit 30 jours',
    recommended: true,
  },
  {
    icon: Building2,
    name: 'Grande École',
    price: 'Sur devis',
    priceSize: 'sm',
    priceNote: 'à partir de 1000 élèves',
    desc: "Pour les établissements à fort effectif, multi-sites ou avec besoins d'intégrations avancées.",
    features: [
      'Tout du plan Pro',
      'Élèves illimités, tarif dégressif',
      'Multi-établissements (réseau)',
      'API & intégrations',
      'Onboarding dédié & support 24/7',
    ],
    cta: 'Contacter les ventes',
  },
];

function PlanCard({ plan }: { plan: Plan }) {
  const { onMouseMove, background } = useSpotlight(
    plan.recommended ? 'rgba(230,184,66,0.18)' : 'rgba(37,99,235,0.10)',
    300,
  );
  const tilt = useTilt(4);
  return (
    <motion.div
      variants={plan.recommended ? scaleIn : fadeUp}
      whileHover={{ y: -6, transition: { type: 'spring', stiffness: 260, damping: 20 } }}
      onMouseMove={(e) => {
        onMouseMove(e);
        tilt.onMouseMove(e);
      }}
      onMouseLeave={tilt.onMouseLeave}
      style={tilt.style}
      className={`group relative flex flex-col gap-[18px] overflow-visible rounded-[18px] border p-7 ${
        plan.recommended
          ? 'border-[rgba(230,184,66,0.35)] bg-foreground text-white shadow-[0_22px_56px_rgba(15,23,42,0.18),0_0_44px_rgba(230,184,66,0.16)]'
          : 'border-border bg-card text-foreground'
      }`}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background }}
      />
      {plan.recommended && (
        <motion.span
          animate={{
            boxShadow: [
              '0 0 0px rgba(230,184,66,0)',
              '0 0 18px rgba(230,184,66,0.55)',
              '0 0 0px rgba(230,184,66,0)',
            ],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-gradient-to-br from-gold-400 to-gold-300 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-[#3b2a00]"
        >
          Recommandé
        </motion.span>
      )}
      <div className="relative z-10 flex flex-1 flex-col gap-[18px]">
        <IconPlate
          icon={plan.icon}
          {...(plan.recommended
            ? { className: 'bg-white/10', iconClassName: 'text-gold-300' }
            : {})}
        />
        <div className="text-[19px] font-bold">{plan.name}</div>
        <div>
          {plan.pricePrefix && (
            <p
              className={`text-xs font-medium ${plan.recommended ? 'text-white/70' : 'text-muted-foreground'}`}
            >
              {plan.pricePrefix}
            </p>
          )}
          <span
            className={`leading-none font-extrabold tracking-[-1.2px] ${
              plan.priceSize === 'sm' ? 'text-2xl leading-[1.2]' : 'text-[38px]'
            } ${plan.recommended ? 'text-gold-300' : ''}`}
          >
            {plan.price}
          </span>{' '}
          {plan.priceNote && (
            <span
              className={`text-sm font-medium ${plan.recommended ? 'text-white/70' : 'text-muted-foreground'}`}
            >
              {plan.priceNote}
            </span>
          )}
        </div>
        <div
          className={`text-sm leading-[1.7] ${plan.recommended ? 'text-white/80' : 'text-muted-foreground'}`}
        >
          {plan.desc}
        </div>
        <div className="flex flex-col gap-2.5">
          {plan.features.map((f) => (
            <div key={f} className="flex items-start gap-2.5 text-sm leading-[1.6]">
              <span
                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
                  plan.recommended ? 'bg-white/10' : 'bg-secondary'
                }`}
              >
                <Check
                  className={`h-3 w-3 ${plan.recommended ? 'text-gold-300' : 'text-primary'}`}
                  aria-hidden="true"
                />
              </span>
              {f}
            </div>
          ))}
        </div>
        <motion.a
          href="#contact"
          whileHover={{ scale: 1.03 }}
          whileTap={tapScale}
          className={`mt-auto inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-semibold whitespace-nowrap ${
            plan.recommended
              ? 'bg-gradient-to-br from-gold-400 to-gold-300 text-[#3b2a00]'
              : 'border border-border bg-card text-foreground'
          }`}
        >
          {plan.cta}
        </motion.a>
      </div>
    </motion.div>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-24 bg-secondary px-6 py-16 lg:px-12 lg:py-[92px]">
      <div className="mx-auto max-w-[1280px]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
        >
          <SectionHead
            kicker="Tarification transparente"
            title="Un plan adapté à chaque école"
            text="Commencez gratuitement, puis évoluez selon votre taille et vos besoins. Tous les prix sont en USD."
            centered
          />
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer(0.1)}
          className="mt-10 grid grid-cols-1 items-start gap-5 lg:grid-cols-3"
        >
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
