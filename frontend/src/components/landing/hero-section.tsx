import Image from 'next/image';
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
            <Zap className="h-3.5 w-3.5" aria-hidden="true" /> SIS, système d&apos;information
            scolaire
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-800 sm:text-5xl">
            Le dossier de scolarité de chaque élève, du premier jour au diplôme.
          </h1>
          <p className="max-w-xl text-lg text-slate-500">
            Inscriptions, notes et bulletins officiels, présences, emploi du temps, frais de
            scolarité. Schoolgesti centralise l&apos;administratif de votre établissement pour le
            secrétariat, la direction, les enseignants et les familles. Nativement mobile et hors
            connexion, pour une école sans limites de connectivité.
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
            <Image
              alt="Tableau de bord Schoolgesti"
              className="h-auto w-full rounded-lg"
              src={DASHBOARD_IMG}
              width={512}
              height={286}
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
