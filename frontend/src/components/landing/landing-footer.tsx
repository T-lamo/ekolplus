import Image from 'next/image';

const COLUMNS = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalités', href: '#features' },
      { label: 'Frais & paiements', href: '#frais-section' },
      { label: 'Tarifs', href: '#pricing' },
    ],
  },
  {
    title: 'Entreprise',
    links: [
      { label: 'Démo', href: '#contact-demo' },
      { label: 'Contact', href: '#contact-demo' },
      { label: 'Support', href: '#' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: 'Confidentialité', href: '#' },
      { label: 'CGU', href: '#' },
    ],
  },
];

/** `#footer`/`#footerShell` — brand block + 3 link columns in a rounded
 * glass panel, matching the nav pill's material. */
export function LandingFooter() {
  return (
    <footer className="px-4 pt-8 pb-11 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1280px] rounded-[24px_18px_28px_20px] border border-border bg-white/[0.04] p-6 sm:rounded-[32px_22px_34px_24px] sm:p-7">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr_1fr] lg:gap-7">
          <div>
            <Image
              src="/logos/schoolgesti-lockup-blanc.svg"
              alt="Schoolgesti"
              width={118}
              height={32}
              className="h-6 w-auto"
            />
            <p className="mt-3 max-w-[280px] text-[13px] text-secondary-foreground">
              Le SIS premium pour piloter dossiers élèves, notes, finances, présences et bulletins
              dans une seule expérience mémorable.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="mb-3 text-[11px] font-bold whitespace-nowrap text-accent">
                {col.title}
              </div>
              {col.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="mb-2.5 block text-[13px] whitespace-nowrap text-secondary-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-4 flex max-w-[1280px] flex-col items-center gap-2 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
        <span>© {new Date().getFullYear()} SchoolGesti. Tous droits réservés.</span>
        <span>Conçu pour une gestion scolaire claire, premium et moderne.</span>
      </div>
    </footer>
  );
}
