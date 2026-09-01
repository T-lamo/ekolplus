'use client';

import { motion } from 'framer-motion';
import {
  BadgeCheck,
  CalendarDays,
  ChartColumn,
  FileBadge2,
  FolderKanban,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { IconPlate, Illustration, SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';
import { useSpotlight } from './use-spotlight';
import { useTilt } from './use-tilt';

/**
 * Banani `#features` — 6 feature cards (3×2) each headed by a recolored
 * local Storyset illustration, plus the nested `#gallery-grid` of 4
 * illustration thumbnails. Reworked per user feedback: no "En savoir
 * plus" links, and the Bulletins card keeps the same background as its
 * neighbors (the mock's dark `.highlight` treatment is dropped). Every
 * card carries a cursor spotlight + 3D tilt.
 */

interface Feature {
  icon: LucideIcon;
  illustration: string;
  alt: string;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  {
    icon: FolderKanban,
    illustration: '/illustrations/thesis.svg',
    alt: 'Dossiers élèves',
    title: 'Dossiers élèves centralisés',
    desc: 'Identité, inscriptions, documents, responsables, historique scolaire et suivi administratif dans un profil unique.',
  },
  {
    icon: WalletCards,
    illustration: '/illustrations/printing-invoices.svg',
    alt: 'Paiements et finance',
    title: 'Paiements & frais de scolarité',
    desc: 'Configurez les frais par classe, suivez le recouvrement en pourcentage et gardez les reçus organisés.',
  },
  {
    icon: FileBadge2,
    illustration: '/illustrations/exams.svg',
    alt: 'Bulletins et contenus',
    title: 'Bulletins & relevés de notes',
    desc: 'Éditez des bulletins clairs, lisibles et prêts à être partagés aux familles et à la direction.',
  },
  {
    icon: CalendarDays,
    illustration: '/illustrations/course-app-pana.svg',
    alt: 'Emploi du temps mobile',
    title: 'Emploi du temps interactif',
    desc: 'Planifiez par classe, enseignant, salle ou matière avec une vue lisible et des créneaux maîtrisés.',
  },
  {
    icon: BadgeCheck,
    illustration: '/illustrations/confirmed-attendance.svg',
    alt: 'Présences confirmées',
    title: 'Émargement & présences',
    desc: 'Les présences sont confirmées rapidement et remontent dans le dossier élève sans double saisie.',
  },
  {
    icon: ChartColumn,
    illustration: '/illustrations/data-analysis.svg',
    alt: 'Analyse et dashboard',
    title: 'Tableaux de bord & analytics',
    desc: "Mesurez les effectifs, la réussite, l'assiduité et la santé financière avec des visuels compréhensibles.",
  },
];

const GALLERY = [
  {
    illustration: '/illustrations/call-center.svg',
    alt: 'Support',
    title: 'Support & accompagnement',
    text: "Un produit qui parle autant à l'équipe qu'aux familles.",
  },
  {
    illustration: '/illustrations/course-app.svg',
    alt: 'Cours mobiles',
    title: 'Usage multi-écran',
    text: "De l'administration centrale jusqu'au mobile des enseignants.",
  },
  {
    illustration: '/illustrations/certification.svg',
    alt: 'Certificat',
    title: 'Documents officiels',
    text: 'Certificats, bulletins et pièces académiques mieux valorisés.',
  },
  {
    illustration: '/illustrations/learning.svg',
    alt: 'Apprentissage',
    title: 'Expérience académique',
    text: 'Une plateforme structurée pour le travail pédagogique quotidien.',
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  const { onMouseMove, background } = useSpotlight('rgba(37,99,235,0.10)', 280);
  const tilt = useTilt(6);
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -6, transition: { type: 'spring', stiffness: 300, damping: 22 } }}
      onMouseMove={(e) => {
        onMouseMove(e);
        tilt.onMouseMove(e);
      }}
      onMouseLeave={tilt.onMouseLeave}
      style={tilt.style}
      className="group relative flex flex-col gap-3.5 overflow-hidden rounded-[18px] border border-border bg-card p-[22px] text-foreground"
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background }}
      />
      <div className="relative z-10 flex flex-1 flex-col gap-3.5">
        <div className="flex h-[172px] items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)]">
          <Illustration
            src={feature.illustration}
            alt={feature.alt}
            className="p-3 transition-transform duration-500 group-hover:scale-[1.06]"
          />
        </div>
        <IconPlate icon={feature.icon} />
        <div className="text-[17px] leading-[1.35] font-bold">{feature.title}</div>
        <div className="text-sm leading-[1.7] text-muted-foreground">{feature.desc}</div>
      </div>
    </motion.div>
  );
}

function GalleryCard({ item }: { item: (typeof GALLERY)[number] }) {
  const { onMouseMove, background } = useSpotlight('rgba(37,99,235,0.08)', 220);
  const tilt = useTilt(7);
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 22 } }}
      onMouseMove={(e) => {
        onMouseMove(e);
        tilt.onMouseMove(e);
      }}
      onMouseLeave={tilt.onMouseLeave}
      style={tilt.style}
      className="group relative overflow-hidden rounded-[18px] border border-border bg-card p-4"
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background }}
      />
      <div className="relative z-10">
        <div className="flex h-40 items-center justify-center overflow-hidden rounded-[14px] bg-[linear-gradient(180deg,#f8fbff_0%,#edf4ff_100%)] sm:h-[220px]">
          <Illustration
            src={item.illustration}
            alt={item.alt}
            className="p-4 transition-transform duration-500 group-hover:scale-[1.06]"
          />
        </div>
        <div className="mt-3 text-sm font-bold text-foreground">{item.title}</div>
        <div className="mt-1 text-xs leading-[1.6] text-muted-foreground">{item.text}</div>
      </div>
    </motion.div>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-24 px-6 py-16 lg:px-12 lg:py-[92px]">
      <div className="mx-auto max-w-[1280px]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
        >
          <SectionHead
            kicker="Fonctionnalités essentielles"
            title={
              <>
                Tout ce dont votre école a besoin,
                <br className="hidden sm:block" /> réuni en un seul endroit
              </>
            }
            text="Une interface claire pour la direction, la comptabilité, les enseignants et les familles, avec des modules pensés pour le travail réel de l'établissement."
          />
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer(0.08)}
          className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer(0.07)}
          className="mt-[38px] grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5"
        >
          {GALLERY.map((item) => (
            <GalleryCard key={item.title} item={item} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
