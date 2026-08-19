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
    title: 'Aide',
    links: [
      { label: 'Support', href: '#' },
      { label: 'API', href: '#' },
      { label: 'Blog', href: '#' },
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

export function LandingFooter() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-slate-900 py-16 text-slate-400">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="mb-6 flex items-center">
            <Image
              src="/logos/schoolgesti-lockup-blanc.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-9 w-auto"
            />
          </div>
          <p className="text-sm leading-relaxed text-slate-400">
            Le système d&apos;information scolaire des établissements qui veulent un dossier de
            scolarité fiable, du premier jour au diplôme.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="mb-6 text-xs font-bold uppercase tracking-widest text-white">
              {col.title}
            </h3>
            <ul className="space-y-2 text-sm text-slate-400">
              {col.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="transition-colors hover:text-violet-400">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-16 max-w-7xl border-t border-white/10 px-6 pt-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Schoolgesti. Tous droits réservés.
      </div>
    </footer>
  );
}
