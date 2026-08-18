'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BarChart3, ClipboardList, SquarePen, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Role {
  key: string;
  tab: string;
  title: string;
  desc: string;
  features: string[];
  icon: LucideIcon;
}

// The SIS audiences: direction · secrétariat/scolarité · enseignants, plus
// the family-facing read of the same record (parents & élèves).
const ROLES: Role[] = [
  {
    key: 'director',
    tab: 'Direction',
    title: 'Pilotage à 360°',
    desc: 'Effectifs, résultats, assiduité et encaissements sur un tableau de bord unifié : décidez avec des chiffres à jour, pas avec des classeurs.',
    features: [
      'Tableau de bord effectifs & paiements',
      'Passage d’année et historique de scolarité',
    ],
    icon: BarChart3,
  },
  {
    key: 'registrar',
    tab: 'Secrétariat & scolarité',
    title: 'Le dossier administratif, sans paperasse',
    desc: 'Inscriptions, fiches élèves, frais et reçus, relances des retardataires : tout le quotidien du secrétariat en quelques clics, avec un historique fiable.',
    features: ['Inscriptions & fiches élèves', 'Frais, paiements, reçus & relances'],
    icon: ClipboardList,
  },
  {
    key: 'teacher',
    tab: 'Enseignants',
    title: 'Notes et présences en un clin d’œil',
    desc: 'Carnet de notes, appréciations, appel quotidien et emploi du temps sans double saisie : les bulletins se remplissent tout seuls.',
    features: ['Saisie rapide des notes & appréciations', 'Appel & suivi des absences'],
    icon: SquarePen,
  },
  {
    key: 'family',
    tab: 'Parents & élèves',
    title: 'Suivre la scolarité depuis un mobile',
    desc: 'Résultats, absences et situation des frais consultables en temps réel par les familles, avec la même donnée que l’école, sans appel au secrétariat.',
    features: ['Bulletins & notes en ligne', 'Situation des frais de scolarité'],
    icon: Users,
  },
];

// Image locale (public/images) — plus de dépendance à une URL externe.
const PORTAL_IMG = '/images/role-portal.jpg';

export function RolePortalsSection() {
  const [active, setActive] = useState(ROLES[0]!);
  const Icon = active.icon;

  return (
    <section id="roles" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-16">
      <div className="mb-16 text-center">
        <h2 className="text-3xl font-bold text-slate-800">
          Expérience sur-mesure pour chaque rôle
        </h2>
        <p className="mt-2 text-lg text-slate-500">
          Secrétariat, direction, enseignants et familles lisent le même dossier.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-100/50 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ROLES.map((role) => (
            <button
              key={role.key}
              type="button"
              onClick={() => setActive(role)}
              className={cn(
                'whitespace-nowrap px-8 py-4 text-sm font-semibold transition-colors',
                active.key === role.key
                  ? 'border-b-2 border-violet-600 bg-white text-violet-600'
                  : 'text-slate-500 hover:text-violet-600',
              )}
            >
              {role.tab}
            </button>
          ))}
        </div>

        <div className="grid items-center gap-10 p-6 sm:p-16 lg:grid-cols-2 lg:gap-16">
          <div>
            <h3 className="mb-6 text-3xl font-bold text-slate-800">{active.title}</h3>
            <p className="mb-6 text-base text-slate-500">{active.desc}</p>
            <ul className="space-y-4">
              {active.features.map((f) => (
                <li key={f} className="flex items-start gap-4">
                  <Icon className="h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{f}</h4>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-200">
            <Image
              className="object-cover"
              alt=""
              src={PORTAL_IMG}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
