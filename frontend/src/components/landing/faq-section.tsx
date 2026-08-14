import { ChevronDown } from 'lucide-react';

// Accordéon natif (<details>/<summary>) — accessible, aucun JS requis.
const FAQS = [
  {
    q: 'Ça marche même sans Internet ?',
    a: "Oui. Vous pouvez faire l'appel même sans connexion : tout se met à jour automatiquement dès que le réseau revient — idéal là où Internet est instable.",
  },
  {
    q: 'Mes données sont-elles bien protégées ?',
    a: "Vos données sont protégées dans un environnement sécurisé. Même si notre solution est utilisée par plusieurs établissements, chaque école dispose de son propre espace privé. Les informations de votre établissement restent confidentielles et ne sont accessibles qu'aux personnes que vous avez autorisées.",
  },
  {
    q: 'Comment se passe la mise en route ?',
    a: "Nous créons votre établissement et son compte administrateur ; vous ajoutez ensuite classes, enseignants et élèves depuis l'application. Une démonstration guidée est proposée.",
  },
  {
    q: 'Tout est-il déjà disponible ?',
    a: "Toute la gestion scolaire est prête dès aujourd'hui : notes, bulletins, présences, et un espace pour les parents et les élèves. Les cours en ligne, le paiement en ligne et l'assistant intelligent arrivent bientôt.",
  },
];

export function FaqSection() {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="reveal-up mb-12 text-center text-3xl font-bold text-slate-800">
          Questions fréquentes
        </h2>
        <div className="space-y-4">
          {FAQS.map((item, i) => (
            <details
              key={item.q}
              className={`reveal-up stagger-${i + 1} group overflow-hidden rounded-xl border border-slate-200 bg-white`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-violet-600 transition-transform duration-300 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-6 pb-5 text-sm leading-relaxed text-slate-500">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
