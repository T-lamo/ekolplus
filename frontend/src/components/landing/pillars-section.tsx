import { Users, CreditCard, NotebookPen, Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Pillar {
  id?: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  features: string[];
  featured?: boolean;
}

// The three SIS pillars, mirroring the app's real modules (Élèves /
// Configuration · Scolarité · Pédagogie). No LMS card — everything listed
// here is part of v1.
const PILLARS: Pillar[] = [
  {
    icon: Users,
    title: 'Dossiers élèves & inscriptions',
    desc: 'Le dossier administratif complet de chaque élève, de l’inscription au passage d’année : identité, responsables, classe, historique de scolarité.',
    features: [
      'Fiche élève 360°',
      'Classes, niveaux, salles & enseignants',
      'Passage d’année assisté (promotions, redoublements)',
    ],
  },
  {
    id: 'frais-section',
    icon: CreditCard,
    title: 'Frais de scolarité & paiements',
    desc: 'Frais paramétrés par niveau, échéanciers, encaissements et soldes en temps réel, relances des retardataires. Le secrétariat sait toujours qui doit quoi.',
    features: ['Échéanciers & soldes par élève', 'Paiements & reçus', 'Relances des retards'],
    featured: true,
  },
  {
    icon: NotebookPen,
    title: 'Notes, bulletins & présences',
    desc: 'Carnet de notes, appréciations, bulletins officiels PDF sur votre propre modèle, appel quotidien même sans connexion et emploi du temps, sans double saisie.',
    features: [
      'Bulletins PDF personnalisables',
      'Appel hors-ligne, synchronisé au retour du réseau',
      'Emploi du temps & salles',
    ],
  },
];

export function PillarsSection() {
  return (
    <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-16">
      <div className="mb-16 text-center">
        <h2 className="mb-1 text-3xl font-bold text-slate-800">
          Tout le dossier de scolarité, au même endroit
        </h2>
        <p className="text-lg text-slate-500">
          Un système d&apos;information scolaire (SIS) : l&apos;administratif, la scolarité et les
          résultats dans une interface épurée.
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
              <h3 className="mb-4 text-lg font-bold text-slate-800">{p.title}</h3>
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
