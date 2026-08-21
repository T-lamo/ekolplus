'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  BookOpenCheck,
  BookUser,
  Building2,
  HeartHandshake,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { IconPlate, SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';

// Hosted locally (public/images/people.jpg) — see hero-section.tsx's
// DASHBOARD_MOCKUP_IMG comment for why this moved off the Banani
// storage.googleapis.com URL.
const ROLE_PHOTO_IMG = '/images/people.jpg';

interface Role {
  icon: LucideIcon;
  name: string;
  desc: string;
}

// `#rolesWrap` — kicker kept from Banani ("Une scène par rôle"); the
// section body text was Banani's own design rationale ("verre dépoli",
// "scène humaine crédible") describing the visual treatment, not
// user-facing copy — replaced with real content about the section.
const ROLES: Role[] = [
  {
    icon: Building2,
    name: 'Direction & administration',
    desc: 'Vision 360° sur les effectifs, les paiements, les résultats et les opérations sensibles.',
  },
  {
    icon: BookUser,
    name: 'Secrétariat & scolarité',
    desc: 'Inscriptions, édition de documents, organisation des classes et suivi des règlements.',
  },
  {
    icon: BookOpenCheck,
    name: 'Enseignants',
    desc: 'Saisie rapide des notes, présences, appréciations et programme annuel.',
  },
  {
    icon: HeartHandshake,
    name: 'Parents & élèves',
    desc: 'Consultation fluide des bulletins, des présences, des échéances et du parcours scolaire.',
  },
];

const KPIS = [
  { label: 'Élèves', value: '342' },
  { label: 'Paiements', value: '87%' },
  { label: 'Présences', value: '96%' },
];

export function RolesSection() {
  return (
    <section id="roles" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24 lg:px-10 lg:py-28">
      <div className="mx-auto max-w-[1280px]">
        <SectionHead
          icon={UsersRound}
          kicker="Une scène par rôle"
          title={
            <>
              Expérience sur-mesure
              <br />
              pour chaque rôle
            </>
          }
          text="Direction, secrétariat, enseignants, parents : chacun accède uniquement aux informations et outils utiles à son rôle, sans se perdre dans des fonctions qui ne le concernent pas."
        />

        <div className="mt-10 grid grid-cols-1 items-center gap-8 sm:mt-14 lg:grid-cols-2 lg:gap-11">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={staggerContainer(0.08)}
            className="order-2 rounded-[34px_22px_30px_20px] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(232,226,246,0.92))] p-5 text-[#1c1328] shadow-[0_26px_60px_rgba(0,0,0,0.16)] sm:p-6 lg:order-1"
          >
            <div className="flex flex-col gap-3">
              {ROLES.map((role, i) => (
                <motion.div
                  key={role.name}
                  variants={fadeUp}
                  whileHover={{ x: 6, scale: 1.015 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                  className={`flex items-start gap-3.5 rounded-[18px] border border-[rgba(20,15,30,0.08)] p-3.5 ${
                    i === 0
                      ? 'bg-[linear-gradient(135deg,rgba(155,107,255,0.18),rgba(199,167,255,0.12))]'
                      : 'bg-white/60'
                  }`}
                >
                  <IconPlate icon={role.icon} size="md" />
                  <div>
                    <div className="text-sm font-bold text-[#23182f]">{role.name}</div>
                    <div className="mt-0.5 text-xs text-[#5b526a]">{role.desc}</div>
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
            whileHover={{ scale: 1.015 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            className="relative order-1 h-[320px] sm:h-[420px] lg:order-2 lg:h-[520px]"
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-2 inset-y-6 rounded-[36%_64%_48%_52%/54%_46%_54%_46%] bg-[radial-gradient(circle_at_50%_50%,rgba(155,107,255,0.30),transparent_60%)] blur-xl"
            />
            <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-border bg-white/5 shadow-[0_34px_90px_rgba(0,0,0,0.28)] backdrop-blur-md sm:rotate-1 lg:rounded-[34px_54px_26px_38px] lg:p-[18px]">
              <div className="relative h-full w-full overflow-hidden rounded-[24px] lg:rounded-[24px_40px_22px_30px]">
                <Image
                  src={ROLE_PHOTO_IMG}
                  alt="Équipe pédagogique consultant SchoolGesti sur des tablettes, ambiance violette"
                  fill
                  sizes="(min-width: 1024px) 560px, 90vw"
                  className="object-cover"
                />
              </div>
              <div className="absolute right-4 bottom-4 left-4 rounded-[22px] border border-white/20 bg-white/[0.16] p-3.5 backdrop-blur-xl sm:right-8 sm:bottom-6 sm:left-8">
                <div className="grid grid-cols-3 gap-2.5">
                  {KPIS.map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rounded-[18px] border border-white/[0.14] bg-white/[0.12] p-2.5 sm:p-3"
                    >
                      <div className="text-[10px] text-white/80 sm:text-[11px]">{kpi.label}</div>
                      <div className="mt-1 text-base font-extrabold text-foreground sm:text-lg">
                        {kpi.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
