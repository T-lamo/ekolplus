import { CalendarCheck, CheckCircle2 } from 'lucide-react';
import { DemoRequestForm } from './demo-request-form';

/** Final CTA turned into a demo-request form (replaces the plain CTA block). */
export function DemoRequestSection() {
  return (
    <section id="contact-demo" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-16">
      <div className="rounded-2xl bg-violet-600 p-6 text-white shadow-xl md:p-16">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-6 text-left">
            <span className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-1 text-2xs font-semibold uppercase tracking-wider">
              <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" /> Démo gratuite
            </span>
            <h2 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              Découvrez Schoolgesti en action
            </h2>
            <p className="text-lg text-white/80">
              Remplissez le formulaire et un expert en gestion scolaire vous recontactera sous 24h
              pour une présentation personnalisée de la plateforme.
            </p>
            <ul className="space-y-3 pt-4">
              <li className="flex items-center gap-3 text-sm text-white/90">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
                Démonstration sur-mesure de 20 min
              </li>
              <li className="flex items-center gap-3 text-sm text-white/90">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
                Réponses à toutes vos questions techniques et tarifs
              </li>
            </ul>
          </div>

          <DemoRequestForm />
        </div>
      </div>
    </section>
  );
}
