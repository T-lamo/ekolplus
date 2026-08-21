// Real product FAQ (kept from the pre-redesign FaqSection — richer and more
// accurate than Banani's 3 generic placeholder Q&As, per the "stay useful"
// call on content vs. chrome).
//
// Plain module (no 'use client') so the server-rendered FAQPage JSON-LD in
// app/page.tsx can import this same array directly — Next.js treats every
// export of a 'use client' file as a client-only reference, so a server
// component can render <FaqSection/> but can't read a value out of it.
export const FAQS = [
  {
    q: 'Ça marche même sans Internet ?',
    a: "Oui. Vous pouvez faire l'appel même sans connexion. Tout se met à jour automatiquement dès que le réseau revient, ce qui est utile là où Internet est instable — une réalité fréquente dans de nombreux établissements en Haïti et en Afrique.",
  },
  {
    q: 'Est-ce un LMS (cours en ligne) ?',
    a: "Non. SchoolGesti est un logiciel de gestion scolaire, plus précisément un système d'information scolaire (SIS) : il gère le dossier administratif et le cursus (inscriptions, frais de scolarité, présences, notes et bulletins officiels), pas le contenu des cours. Il se combine très bien avec un LMS si vous en utilisez un.",
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
    a: "Toute la gestion administrative et pédagogique est prête dès aujourd'hui : dossiers élèves, classes, notes, appréciations, bulletins PDF, présences, emploi du temps, frais de scolarité, paiements et relances, passage d'année, et un espace pour les parents et les élèves — avec support multi-devises (HTG, USD, XOF, XAF, EUR).",
  },
];
