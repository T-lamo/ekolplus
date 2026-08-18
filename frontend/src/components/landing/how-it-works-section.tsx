const STEPS = [
  {
    n: 1,
    title: 'Demandez une démo',
    desc: 'Un expert vous contacte pour comprendre les besoins de votre établissement.',
  },
  {
    n: 2,
    title: 'On configure votre établissement',
    desc: 'Nous paramétrons votre espace (classes, matières, comptes), prêt à l’emploi.',
  },
  {
    n: 3,
    title: 'Vous gérez vos élèves',
    desc: '30 jours d’essai gratuit. Vous activez le plan Pro quand vous le souhaitez.',
  },
];

/** « Comment démarrer » — pose l'attente d'un onboarding accompagné (pas de
 * self-serve) : la landing génère un contact, l'équipe configure l'école.
 * Full-width dark band (the rhythm the former AI section gave the page — a
 * white-only landing reads flat): slate-800 ground, violet accents.
 *
 * No per-card `reveal-up`: this whole section is already wrapped in one by
 * page.tsx (a single fade-in for the section), so nesting a second,
 * independently-triggered reveal on each card risks a capture tool (a
 * full-page screenshot, a PDF export) freezing the page mid-transition —
 * text still at opacity 0 over a dark background reads as blank. */
export function HowItWorksSection() {
  return (
    <section className="relative overflow-hidden bg-slate-800 py-16 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-0 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl"
      />
      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold text-white">Comment démarrer ?</h2>
          <p className="mt-2 text-lg text-white/70">
            Trois étapes simples pour moderniser votre gestion scolaire.
          </p>
        </div>
        <div className="grid gap-10 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-8 text-center"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/20 text-2xl font-bold text-violet-300">
                {step.n}
              </div>
              <h3 className="text-xl font-semibold text-white">{step.title}</h3>
              <p className="text-sm text-white/60">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
