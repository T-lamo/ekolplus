import Image from 'next/image';

// Absolute-to-`/` (not bare `#anchor`): this footer also renders on
// /confidentialite and /cgu (via LegalArticle) — see the same note in
// landing-header.tsx. The mock's placeholder links (Centre d'aide,
// Tutoriels, Partenaires, …) are replaced by destinations that actually
// exist; layout and column count stay Banani's.
const COLUMNS = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalités', href: '/#features' },
      { label: 'Tarifs', href: '/#pricing' },
      { label: 'Présence', href: '/#attendance' },
      { label: 'Démonstration', href: '/#contact' },
    ],
  },
  {
    title: 'Ressources',
    links: [
      { label: 'FAQ', href: '/#faq' },
      { label: 'Support', href: '/#contact' },
      { label: 'Se connecter', href: '/login' },
    ],
  },
  {
    title: 'Entreprise',
    links: [
      { label: 'Contact', href: '/#contact' },
      { label: 'Confidentialité', href: '/confidentialite' },
      { label: 'CGU', href: '/cgu' },
    ],
  },
];

/** Banani `#footer` — full-bleed navy footer: brand column + 3 link
 * columns, then a bottom bar split by a hairline. */
export function LandingFooter() {
  return (
    <footer className="bg-[#0f172a] px-6 pt-8 pb-[46px] lg:px-12">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid grid-cols-1 gap-8 pt-[18px] sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] lg:gap-7">
          <div>
            <Image
              src="/logos/schoolgesti-lockup-blanc.svg"
              alt="SchoolGesti"
              width={140}
              height={38}
              className="h-6 w-auto"
            />
            <p className="mt-3 max-w-[280px] text-[13px] leading-[1.7] text-white/[0.62]">
              La plateforme de gestion scolaire conçue pour les établissements haïtiens et
              francophones.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="mb-3.5 text-[13px] font-bold whitespace-nowrap text-white">
                {col.title}
              </div>
              <div className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="text-[13px] leading-[1.7] whitespace-nowrap text-white/[0.62] transition-colors hover:text-white"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-[26px] flex flex-col gap-2 border-t border-white/10 pt-5 text-[13px] text-white/[0.62] sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} SchoolGesti. Tous droits réservés.</span>
          <span>Pensé pour l'administration scolaire moderne.</span>
        </div>
      </div>
    </footer>
  );
}
