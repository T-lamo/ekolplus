'use client';

import { motion } from 'framer-motion';
import { BookOpenCheck, Building2, Calculator, GraduationCap, type LucideIcon } from 'lucide-react';
import { SectionHead } from './landing-ui';
import { fadeUp, staggerContainer, viewportOnce } from './landing-motion';

/**
 * Banani `#roles` — 4 glass cards on the same navy→blue gradient as the
 * hero. The mock's AI-generated placeholder avatars are replaced by icon
 * plates (user decision, consistent with the app's own visual language).
 */

interface Role {
  icon: LucideIcon;
  title: string;
  sub: string;
  desc: string;
  pills: string[];
}

const ROLES: Role[] = [
  {
    icon: Building2,
    title: 'Direction & administration',
    sub: "Vision globale de l'établissement",
    desc: 'Suivez les effectifs, les performances, les finances et les opérations clés depuis un tableau de bord unifié.',
    pills: ['Dashboard', 'Rapports', 'Année scolaire'],
  },
  {
    icon: BookOpenCheck,
    title: 'Corps enseignant',
    sub: 'Usage simple au quotidien',
    desc: 'Saisissez les notes, prenez les présences et gérez le programme annuel sans surcharge inutile.',
    pills: ['Notes', 'Présences', 'Programme'],
  },
  {
    icon: GraduationCap,
    title: 'Élèves & apprenants',
    sub: 'Repères clairs pour le parcours',
    desc: 'Consultez les emplois du temps, les notes, les bulletins et les informations clés du parcours scolaire depuis un espace lisible.',
    pills: ['Emploi du temps', 'Résultats', 'Bulletins'],
  },
  {
    icon: Calculator,
    title: 'Secrétariat & comptabilité',
    sub: 'Gestion rapide des opérations',
    desc: 'Gérez les inscriptions, les paiements, les reçus et les relances dans des écrans pensés pour aller vite.',
    pills: ['Paiements', 'Inscriptions', 'Relances'],
  },
];

export function RolesSection() {
  return (
    <section
      id="roles"
      className="scroll-mt-24 bg-[linear-gradient(135deg,#0f172a_0%,#0f172a_65%,#2563eb_100%)] px-6 py-16 lg:px-12 lg:py-[92px]"
    >
      <div className="mx-auto max-w-[1280px]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
        >
          <SectionHead
            kicker="Conçu pour toute l'équipe"
            tone="dark"
            title={
              <>
                Une plateforme,
                <br className="hidden sm:block" /> tous les acteurs de l'école
              </>
            }
            text="Direction, enseignants, élèves, familles et comptabilité travaillent avec la même base d'information, chacun avec des accès clairs et adaptés à son rôle."
            centered
          />
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer(0.08)}
          className="mt-9 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4"
        >
          {ROLES.map((role) => {
            const Icon = role.icon;
            return (
              <motion.div
                key={role.title}
                variants={fadeUp}
                whileHover={{ y: -5, transition: { type: 'spring', stiffness: 300, damping: 22 } }}
                className="flex flex-col rounded-[18px] border border-white/[0.12] bg-white/[0.07] p-6"
              >
                <div className="mb-3.5 flex items-center gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <Icon className="h-6 w-6 text-white" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-bold text-white">{role.title}</div>
                    <div className="mt-1 text-[13px] text-white/[0.64]">{role.sub}</div>
                  </div>
                </div>
                <div className="text-sm leading-[1.7] text-white/[0.76]">{role.desc}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {role.pills.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full bg-white/10 px-2.5 py-1.5 text-xs whitespace-nowrap text-white/[0.78]"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
