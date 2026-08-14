import { FileText, CreditCard, BookOpen, Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Pillar {
  id?: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  features: string[];
  featured?: boolean;
  soon?: boolean;
}

const PILLARS: Pillar[] = [
  {
    icon: FileText,
    title: 'Gestion & Présence Offline',
    desc: 'Dossiers numériques et prise de présence sans connexion. Synchronisation intelligente.',
    features: ['Dossiers élèves 360°', 'Bulletins instantanés'],
  },
  {
    id: 'finance-section',
    icon: CreditCard,
    title: 'Paiements & Échéanciers',
    desc: 'Suivi des balances en temps réel et rappels WhatsApp automatiques pour les frais de scolarité.',
    features: ['Rappels automatisés', 'Échéanciers flexibles'],
    featured: true,
    soon: true,
  },
  {
    id: 'lms-section',
    icon: BookOpen,
    title: 'Plateforme LMS Intégrée',
    desc: 'Partage de ressources, devoirs en ligne et cahiers de textes interactifs pour profs et élèves.',
    features: ['Cahier de texte numérique', 'Examens sécurisés'],
    soon: true,
  },
];

export function PillarsSection() {
  return (
    <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-16">
      <div className="mb-16 text-center">
        <h2 className="mb-1 text-3xl font-bold text-slate-800">
          Infrastructure moderne pour l&apos;éducation
        </h2>
        <p className="text-lg text-slate-500">
          Centralisez tout dans une interface épurée et performante.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.title}
              id={p.id}
              className={cn(
                'group rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-violet-600/30',
                p.id && 'scroll-mt-20',
                p.featured && 'border-t-2 border-t-violet-600',
              )}
            >
              <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mb-4 flex flex-wrap items-center gap-2 text-lg font-bold text-slate-800">
                {p.title}
                {p.soon && (
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                    Bientôt
                  </span>
                )}
              </h3>
              <p className="mb-6 text-sm text-slate-500">{p.desc}</p>
              <ul className="space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-500">
                    <Check className="h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
