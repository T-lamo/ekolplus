'use client';

import { motion, type Variants } from 'framer-motion';
import { BadgeDollarSign, Check } from 'lucide-react';
import { SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, tapScale, viewportOnce } from './landing-motion';
import { useSpotlight } from './use-spotlight';

// The gold "Recommandé" card rests permanently 18px above its neighbors
// (Banani's own `.price-card.glass { transform: translateY(-18px) }`).
// framer-motion sets `transform` via inline style, which would silently
// override a static `-translate-y-[18px]` Tailwind class once the entrance
// animation settles — so the raise is baked into this variant's rest state
// instead of a CSS class, and the hover lift continues from -18 rather
// than snapping through 0.
const GOLD_REST_Y = -18;
const goldCardVariant: Variants = {
  hidden: { opacity: 0, y: GOLD_REST_Y + 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: GOLD_REST_Y,
    scale: 1,
    transition: { duration: 0.6, ease: [0.5, 0, 0, 1] },
  },
};

interface Plan {
  name: string;
  badge?: { label: string; tone: 'gold' | 'neutral' };
  pricePrefix?: string;
  price: string;
  priceSize?: 'lg' | 'sm';
  priceNote: string;
  features: string[];
  cta: string;
  material: 'violet' | 'gold' | 'carbone';
}

// Real plans (src/lib/billing-plans.ts) — kept as-is per product decision:
// Banani's mock used placeholder numbers (30 élèves / 0,50 $), this keeps
// the live pricing the rest of the app (checkout, JSON-LD, /abonnement) uses.
//
// Color language — user decision 2026-08-20: gold = the recommended paid
// plan (mirrors the app's own "or = plan payant" convention, e.g. the
// sidebar's SchoolPlanCard/ThemePicker gold tokens), violet = the free
// plan (the brand's default accent, no upsell weight). Enterprise stays a
// neutral dark "carbone" tier — never gold, so gold reads as Pro's alone.
const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: 'Gratuit',
    priceNote: 'pour toujours',
    features: [
      'Dossiers élèves, classes & enseignants',
      'Notes, appréciations & bulletins PDF',
      'Présences & emploi du temps',
      'Frais de scolarité, paiements & relances',
      'Portail parents & élèves',
      "Jusqu'à 50 élèves",
    ],
    cta: 'Commencer gratuitement',
    material: 'violet',
  },
  {
    name: 'Établissement Pro',
    badge: { label: 'Recommandé', tone: 'gold' },
    pricePrefix: 'À partir de',
    price: '0,60 $',
    priceNote: '/ élève / mois',
    features: [
      'Tout du plan Starter',
      "Jusqu'à 1000 élèves",
      'Sièges facturés = effectifs réels',
      'Sans engagement, résiliable à tout moment',
      'Essai gratuit 30 jours',
      'Factures & reçus en ligne (Stripe)',
      'Support prioritaire',
    ],
    cta: 'Essai gratuit 30 jours',
    material: 'gold',
  },
  {
    name: 'Enterprise',
    badge: { label: 'Sur mesure', tone: 'neutral' },
    price: 'Sur devis',
    priceSize: 'sm',
    priceNote: 'à partir de 1000 élèves',
    features: [
      'Tout du plan Pro',
      'Élèves illimités, tarif dégressif',
      'Multi-établissements (réseau)',
      'Tableau de bord réseau',
      'API & intégrations',
      'Onboarding dédié & support 24/7',
    ],
    cta: 'Contactez-nous',
    material: 'carbone',
  },
];

const MATERIAL_CLASSES: Record<Plan['material'], string> = {
  violet:
    'rounded-[24px_32px_28px_20px] border border-white/20 bg-[linear-gradient(180deg,rgba(248,245,255,0.98),rgba(224,210,250,0.95))] text-[#241a3d]',
  gold: 'rounded-[34px_24px_30px_26px] border border-[rgba(230,184,66,0.24)] bg-[linear-gradient(160deg,rgba(255,255,255,0.18),rgba(230,184,66,0.22),rgba(255,255,255,0.06)),rgba(21,16,33,0.76)] text-foreground shadow-[0_34px_82px_rgba(0,0,0,0.28),0_0_60px_rgba(230,184,66,0.22)]',
  carbone:
    'rounded-[26px_18px_34px_22px] border border-white/10 bg-[linear-gradient(180deg,rgba(35,30,45,0.98),rgba(16,13,21,0.98))] text-foreground',
};

const CHECK_TONE: Record<Plan['material'], string> = {
  violet: 'text-[#6c2bd9]',
  gold: 'text-[#f2cf6b]',
  carbone: 'text-white/70',
};

const CTA_CLASSES: Record<Plan['material'], string> = {
  violet: 'bg-[rgba(199,167,255,0.22)] text-[#3d2568] border border-[rgba(108,43,217,0.18)]',
  gold: 'bg-gradient-to-br from-[#e6b842] to-[#f2cf6b] text-[#3b2a00]',
  carbone: 'bg-white/10 text-foreground border border-white/[0.12]',
};

const BADGE_CLASSES: Record<NonNullable<Plan['badge']>['tone'], string> = {
  gold: 'bg-[rgba(230,184,66,0.18)] text-[#f2cf6b]',
  neutral: 'bg-white/10 text-foreground border border-white/15',
};

const SPOTLIGHT_COLOR: Record<Plan['material'], string> = {
  violet: 'rgba(108,43,217,0.14)',
  gold: 'rgba(230,184,66,0.24)',
  carbone: 'rgba(255,255,255,0.10)',
};

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="scroll-mt-24 px-4 pt-14 pb-16 sm:px-6 sm:pb-24 lg:px-10 lg:pt-[72px] lg:pb-28"
    >
      <div className="mx-auto max-w-[1280px]">
        <SectionHead
          icon={BadgeDollarSign}
          kicker="Tarification transparente"
          title="Trois niveaux, une seule suite"
          text="Toutes les fonctionnalités sur tous les plans : seul l'effectif change."
          centered
          className="mx-auto"
        />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer(0.1)}
          className="mt-10 grid grid-cols-1 gap-5 sm:mt-14 lg:grid-cols-3 lg:gap-[22px]"
        >
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const { onMouseMove, background } = useSpotlight(SPOTLIGHT_COLOR[plan.material], 300);

  return (
    <motion.div
      variants={plan.material === 'gold' ? goldCardVariant : fadeUp}
      whileHover={{
        y: (plan.material === 'gold' ? GOLD_REST_Y : 0) - 8,
        scale: 1.02,
        transition: { type: 'spring', stiffness: 260, damping: 20 },
      }}
      onMouseMove={onMouseMove}
      className={`group relative flex min-h-[430px] flex-col gap-3.5 overflow-hidden p-6 shadow-[0_28px_64px_rgba(0,0,0,0.18)] ${MATERIAL_CLASSES[plan.material]}`}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background }}
      />
      <div className="relative z-10 flex flex-1 flex-col gap-3.5">
        {plan.badge && (
          <motion.span
            animate={
              plan.badge.tone === 'gold'
                ? {
                    boxShadow: [
                      '0 0 0px rgba(230,184,66,0.0)',
                      '0 0 18px rgba(230,184,66,0.55)',
                      '0 0 0px rgba(230,184,66,0.0)',
                    ],
                  }
                : { boxShadow: '0 0 0px rgba(0,0,0,0)' }
            }
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-1.5 text-[11px] font-bold ${BADGE_CLASSES[plan.badge.tone]}`}
          >
            {plan.badge.label}
          </motion.span>
        )}
        <div className="text-xl font-extrabold">{plan.name}</div>
        <div>
          {plan.pricePrefix && <p className="text-xs font-medium opacity-80">{plan.pricePrefix}</p>}
          <span
            className={`font-extrabold tracking-[-2px] ${plan.priceSize === 'sm' ? 'text-[28px]' : 'text-[36px] sm:text-[40px]'}`}
          >
            {plan.price}
          </span>
          <p className="mt-0.5 text-[13px] opacity-75">{plan.priceNote}</p>
        </div>
        <div className="mt-1.5 flex flex-col gap-2.5">
          {plan.features.map((f) => (
            <div key={f} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
              <Check
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${CHECK_TONE[plan.material]}`}
                aria-hidden="true"
              />
              {f}
            </div>
          ))}
        </div>
        <motion.a
          href="#contact-demo"
          whileHover={{ scale: 1.03 }}
          whileTap={tapScale}
          className={`mt-auto flex w-full items-center justify-center rounded-full py-3 text-[13px] font-bold whitespace-nowrap ${CTA_CLASSES[plan.material]}`}
        >
          {plan.cta}
        </motion.a>
      </div>
    </motion.div>
  );
}
