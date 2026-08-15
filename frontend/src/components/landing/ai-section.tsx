import { Sparkles } from 'lucide-react';

// Image locale (public/images) — plus de dépendance à une URL externe.
const AI_IMG = '/images/ai-illustration.jpg';

export function AiSection() {
  return (
    <section
      id="ai"
      className="relative scroll-mt-20 overflow-hidden bg-slate-800 py-16 text-white"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-1 text-2xs font-semibold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Schoolgesti AI
            </div>
            <h2 className="text-4xl font-bold leading-tight sm:text-5xl">
              L&apos;intelligence au service de la pédagogie
            </h2>
            <span className="inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-2xs font-bold uppercase tracking-widest text-white/70">
              Bientôt disponible
            </span>
            <p className="text-lg text-white/70">
              Notre moteur IA assiste chaque acteur pour libérer du temps administratif et se
              concentrer sur l&apos;enseignement.
            </p>
            <div className="grid gap-4 pt-6 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <h3 className="mb-1 font-bold text-violet-300">Assistant Enseignant</h3>
                <p className="text-xs text-white/50">Plans de cours et quiz en un clic.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <h3 className="mb-1 font-bold text-violet-300">Détection Décrochage</h3>
                <p className="text-xs text-white/50">Alertes basées sur l&apos;assiduité.</p>
              </div>
            </div>
          </div>
          <div className="relative flex justify-center">
            <div className="absolute inset-0 -z-10 scale-125 rounded-full bg-violet-500/20 blur-3xl" />
            <img
              alt="Intelligence artificielle au service de la pédagogie"
              className="w-full max-w-md rounded-2xl border border-white/10 shadow-2xl"
              src={AI_IMG}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
