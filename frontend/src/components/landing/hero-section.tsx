import { Zap, PlayCircle } from 'lucide-react';
import { CtaLink } from './landing-ui';

// Image locale (public/images) — plus aucune dépendance à une URL externe
// (les liens Google `lh3`/`aida` sont éphémères et cassent en prod).
const DASHBOARD_IMG = '/images/hero-dashboard.jpg';

export function HeroSection() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-16">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-md border border-violet-600/10 bg-violet-50 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-violet-600">
            <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Nouveau : IA Tuteur Intégrée
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-800 sm:text-5xl">
            La plateforme tout-en-un qui modernise la gestion scolaire.
          </h1>
          <p className="max-w-xl text-lg text-slate-500">
            Une solution nativement mobile et offline-first intégrant SIS, LMS et Finance pour une
            école sans limites de connectivité.
          </p>
          <div className="flex flex-wrap gap-4 pt-4">
            <CtaLink href="#contact-demo" className="px-10 py-4 text-base">
              Demander une démo
            </CtaLink>
            <CtaLink href="#contact-demo" variant="outline" className="px-10 py-4 text-base">
              <PlayCircle className="h-5 w-5" aria-hidden="true" /> Voir la démo
            </CtaLink>
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          {/* Drifting violet glow — CSS approximation of the reference WebGL shader. */}
          <div className="animate-drift pointer-events-none absolute inset-0 -z-10 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="animate-float w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <img
              alt="Tableau de bord Schoolgesti"
              className="h-auto w-full rounded-lg"
              src={DASHBOARD_IMG}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
