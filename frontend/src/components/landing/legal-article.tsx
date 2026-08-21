import type { ReactNode } from 'react';
import { LandingHeader } from './landing-header';
import { LandingFooter } from './landing-footer';

/** Shared reading shell for /confidentialite and /cgu — same dark
 * "Lavande Douce" backdrop and header/footer as the landing page, with a
 * light paper card for long-form text (matches the card treatment already
 * used in RolesSection/PricingSection rather than introducing a new style). */
export function LegalArticle({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div
      id="landing-root"
      className="min-h-screen overflow-x-hidden bg-background text-foreground antialiased"
    >
      <LandingHeader />
      <main className="px-4 pt-32 pb-20 sm:px-6 sm:pt-36 lg:px-10">
        <div className="mx-auto max-w-[820px] rounded-[28px_20px_28px_20px] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(232,226,246,0.94))] p-6 text-[#1c1328] shadow-[0_26px_60px_rgba(0,0,0,0.16)] sm:p-10">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          <p className="mt-2 text-xs text-[#5b526a]">Dernière mise à jour : {updated}</p>
          <div className="mt-8 space-y-8">{children}</div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-[#1c1328] sm:text-lg">{heading}</h2>
      <div className="mt-2.5 space-y-3 text-[14px] leading-relaxed text-[#2c2138]">{children}</div>
    </section>
  );
}
