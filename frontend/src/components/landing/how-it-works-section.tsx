const STEPS = [
  {
    n: 1,
    title: 'Demandez une démo',
    desc: 'Un expert vous contacte pour comprendre les besoins de votre établissement.',
  },
  {
    n: 2,
    title: 'On configure votre établissement',
    desc: 'Nous paramétrons votre espace (classes, matières, comptes) — prêt à l’emploi.',
  },
  {
    n: 3,
    title: 'Vous gérez vos élèves',
    desc: '30 jours d’essai gratuit. Vous activez le plan Pro quand vous le souhaitez.',
  },
];

/** « Comment démarrer » — pose l'attente d'un onboarding accompagné (pas de
 * self-serve) : la landing génère un contact, l'équipe configure l'école. */
export function HowItWorksSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-16 text-center">
        <h2 className="text-3xl font-bold text-slate-800">Comment démarrer ?</h2>
        <p className="mt-2 text-lg text-slate-500">
          Trois étapes simples pour moderniser votre gestion scolaire.
        </p>
      </div>
      <div className="grid gap-10 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.n} className={`reveal-up stagger-${i + 1} space-y-4 text-center`}>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-2xl font-bold text-violet-600">
              {step.n}
            </div>
            <h3 className="text-xl font-semibold text-slate-800">{step.title}</h3>
            <p className="text-sm text-slate-500">{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
