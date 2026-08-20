'use client';

import { motion } from 'framer-motion';
import {
  Bookmark,
  Check,
  FileBadge2,
  FolderOpen,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { IconPlate, SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';
import { useSpotlight } from './use-spotlight';

interface Feature {
  id?: string;
  icon: LucideIcon;
  name: string;
  body: string;
  items: string[];
  rotate: string;
  translate?: string;
}

// `#featureTags` — verbatim Banani copy ("Expérience matière & lumière").
const FEATURES: Feature[] = [
  {
    icon: FolderOpen,
    name: 'Dossiers élèves & inscriptions',
    body: 'Toutes les informations d’identité, le parcours scolaire, les documents et le suivi administratif dans une seule vue lisible.',
    items: ['Fiche élève 360°', 'Historique académique complet', 'Promotion et passage d’année'],
    rotate: 'lg:-rotate-[5deg]',
  },
  {
    id: 'frais-section',
    icon: WalletCards,
    name: 'Paiements & scolarité',
    body: 'Plans par classe, tranches configurables, reçus et suivi des soldes dans une logique claire pour l’administration.',
    items: ['Configuration par classe', 'Historique des règlements', 'Relances et impayés'],
    rotate: 'lg:-rotate-[2deg]',
    translate: 'lg:-translate-y-5',
  },
  {
    icon: FileBadge2,
    name: 'Notes, bulletins & présences',
    body: 'Saisie rapide, appréciations, bulletins annuels, absences et retards dans une interface cohérente et élégante.',
    items: [
      'Bulletins PDF personnalisables',
      'Carnet de notes moderne',
      'Appel et suivi quotidien',
    ],
    rotate: 'lg:rotate-[5deg]',
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24 lg:px-10 lg:py-28">
      <div className="mx-auto max-w-[1280px]">
        <SectionHead
          icon={Bookmark}
          kicker="Expérience matière & lumière"
          title={
            <>
              Tout le dossier de scolarité,
              <br />
              au même endroit
            </>
          }
          text="Une suite SIS complète présentée comme une collection de pièces tangibles reliées entre elles par une énergie douce et premium."
          centered
          className="mx-auto"
        />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer(0.12)}
          className="relative mt-10 grid grid-cols-1 gap-5 sm:mt-14 lg:grid-cols-3 lg:gap-[22px]"
        >
          {/* Dashed connector between cards — desktop only, matches `.connector`. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[30%] top-[130px] hidden h-[90px] border-t border-dashed border-[rgba(199,167,255,0.42)] [filter:drop-shadow(0_0_18px_rgba(155,107,255,0.36))] lg:block"
          />
          {FEATURES.map((f) => (
            <FeatureCard key={f.name} f={f} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FeatureCard({ f }: { f: Feature }) {
  const { onMouseMove, background } = useSpotlight('rgba(155,107,255,0.16)');

  return (
    <motion.div
      id={f.id}
      variants={fadeUp}
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onMouseMove={onMouseMove}
      className={`group relative min-h-[260px] scroll-mt-24 overflow-hidden rounded-[28px_18px_28px_20px] border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(235,230,246,0.92))] p-6 text-[#1c1328] shadow-[0_24px_56px_rgba(0,0,0,0.16)] ${f.rotate} ${f.translate ?? ''}`}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background }}
      />
      <div
        aria-hidden="true"
        className="absolute top-[-18px] left-[46px] hidden h-[34px] w-[92px] rounded-full border-t-2 border-[rgba(199,167,255,0.80)] lg:block"
      />
      <div className="relative z-10">
        <IconPlate icon={f.icon} />
        <h3 className="mt-[18px] text-xl leading-tight font-extrabold">{f.name}</h3>
        <p className="mt-2.5 text-sm text-[#5b526a]">{f.body}</p>
        <div className="mt-[18px] flex flex-col gap-2">
          {f.items.map((item) => (
            <div key={item} className="flex items-start gap-2.5 text-[13px] text-[#2d223c]">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
