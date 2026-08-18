import { Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CtaLink } from './landing-ui';

interface Plan {
  name: string;
  audience: string;
  pricePrefix?: string;
  price: string;
  priceNote?: string;
  features: { label: string; strong?: boolean; soon?: boolean }[];
  cta: string;
  featured?: boolean;
}

// Mirrors src/lib/billing-plans.ts PLAN_FEATURES (what the app really
// gates): every SIS module — incl. the parent/student portal (v1) — is on
// every plan; the tiers differ by the student cap, the billing model and
// support.
const PLANS: Plan[] = [
  {
    name: 'Starter',
    audience: 'Petites écoles',
    price: 'Gratuit',
    priceNote: "jusqu'à 50 élèves",
    features: [
      { label: 'Dossiers élèves, classes & enseignants' },
      { label: 'Notes, appréciations & bulletins PDF' },
      { label: 'Présences & emploi du temps' },
      { label: 'Frais de scolarité, paiements & relances' },
      { label: 'Portail parents & élèves' },
      { label: 'Passage d’année assisté' },
      { label: 'Sans carte bancaire' },
      { label: 'Support communauté' },
    ],
    cta: 'Commencer gratuitement',
  },
  {
    name: 'Établissement Pro',
    audience: 'Solution intégrale',
    pricePrefix: 'À partir de',
    price: '0,60 $',
    priceNote: '/élève /mois',
    features: [
      { label: 'Tout du plan Starter', strong: true },
      { label: "Jusqu'à 1000 élèves" },
      { label: 'Sièges facturés = effectifs réels' },
      { label: 'Sans engagement, résiliable à tout moment' },
      { label: 'Essai gratuit 30 jours' },
      { label: 'Factures & reçus en ligne (Stripe)' },
      { label: 'Support prioritaire' },
    ],
    cta: 'Essai gratuit 30 jours',
    featured: true,
  },
  {
    name: 'Enterprise',
    audience: 'Réseaux & grands établissements',
    price: 'Sur mesure',
    priceNote: 'à partir de 1000 élèves',
    features: [
      { label: 'Tout du plan Pro', strong: true },
      { label: 'Élèves illimités, tarif dégressif' },
      { label: 'Multi-établissements (réseau)' },
      { label: 'Tableau de bord réseau' },
      { label: 'API & intégrations' },
      { label: 'Onboarding dédié & support 24/7' },
    ],
    cta: 'Contactez-nous',
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-slate-100/40 py-16">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold text-slate-800">Tarification transparente</h2>
          <p className="text-lg text-slate-500">
            Moins de 1 $ par élève et par mois, toutes les fonctionnalités sur tous les plans : seul
            l&apos;effectif change.
          </p>
        </div>
        <div className="grid items-stretch gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'relative flex flex-col rounded-lg border bg-white p-6 shadow-sm',
                plan.featured
                  ? 'border-2 border-violet-600 shadow-lg md:-translate-y-2'
                  : 'border-slate-200',
              )}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded bg-violet-600 px-3 py-1 text-[10px] font-bold uppercase text-white">
                  Recommandé
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800">{plan.name}</h3>
                <p className="text-xs text-slate-500">{plan.audience}</p>
              </div>
              <div className="mb-6">
                {plan.pricePrefix && (
                  <p className="text-xs font-medium text-slate-500">{plan.pricePrefix}</p>
                )}
                <span className="text-3xl font-bold text-slate-800">{plan.price}</span>
                {plan.priceNote && (
                  <span className="text-xs text-slate-500"> {plan.priceNote}</span>
                )}
              </div>
              <ul className="mb-8 flex-grow space-y-3">
                {plan.features.map((f) => (
                  <li
                    key={f.label}
                    className={cn(
                      'flex items-center gap-2 text-sm',
                      f.soon
                        ? 'italic text-slate-400'
                        : f.strong
                          ? 'font-semibold text-slate-800'
                          : 'text-slate-500',
                    )}
                  >
                    {f.soon ? (
                      <Clock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
                    )}
                    {f.label}
                    {f.soon && (
                      <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase not-italic text-slate-500">
                        Bientôt
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <CtaLink
                href="#contact-demo"
                variant={plan.featured ? 'primary' : 'outline'}
                className="w-full py-2.5 text-sm"
              >
                {plan.cta}
              </CtaLink>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
