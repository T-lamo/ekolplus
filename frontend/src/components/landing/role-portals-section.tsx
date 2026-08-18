'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BarChart3, SquarePen, Users, GraduationCap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Role {
  key: string;
  tab: string;
  title: string;
  desc: string;
  features: string[];
  icon: LucideIcon;
}

const ROLES: Role[] = [
  {
    key: 'director',
    tab: 'Directeurs',
    title: 'Pilotage stratégique à 360°',
    desc: 'Supervisez la santé financière et académique depuis un tableau de bord unifié. Conçu pour la prise de décision rapide.',
    features: ['Analytique de performance consolidée', 'Gestion optimisée des effectifs'],
    icon: BarChart3,
  },
  {
    key: 'teacher',
    tab: 'Enseignants',
    title: 'Outils pédagogiques performants',
    desc: "Saisie de notes, cahier de texte et appréciation assistée par IA pour se concentrer sur l'essentiel : vos élèves.",
    features: ['Saisie rapide des notes', 'Gestion simplifiée des absences'],
    icon: SquarePen,
  },
  {
    key: 'parent',
    tab: 'Parents',
    title: 'Suivez le parcours de votre enfant',
    desc: "Accédez aux résultats, absences et paiements en temps réel depuis votre mobile. Gardez le contact avec l'école.",
    features: ['Notifications instantanées', 'Paiements sécurisés'],
    icon: Users,
  },
  {
    key: 'student',
    tab: 'Élèves',
    title: "Espace d'apprentissage numérique",
    desc: 'Retrouvez vos cours, rendez vos devoirs et interagissez avec votre école. Tout est centralisé pour votre réussite.',
    features: ['Accès aux ressources 24/7', 'Messagerie pédagogique'],
    icon: GraduationCap,
  },
];

// Image locale (public/images) — plus de dépendance à une URL externe.
const PORTAL_IMG = '/images/role-portal.jpg';

export function RolePortalsSection() {
  const [active, setActive] = useState(ROLES[0]!);
  const Icon = active.icon;

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-16 text-center">
        <h2 className="text-3xl font-bold text-slate-800">
          Expérience sur-mesure pour chaque rôle
        </h2>
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
