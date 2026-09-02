import type { ReactNode } from 'react';
import { LandingHeader } from './landing-header';
import { LandingFooter } from './landing-footer';

/** Shared reading shell for /confidentialite and /cgu — same Electric Blue
 * backdrop and header/footer as the landing page, with a white card for
 * long-form text. `solid` on the header: these pages have no dark hero, so
 * the white-text glass pill would be invisible before the first scroll. */
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
      <LandingHeader solid />
      <main className="px-4 pt-32 pb-20 sm:px-6 sm:pt-36 lg:px-10">
        <div className="mx-auto max-w-[820px] rounded-[18px] border border-border bg-card p-6 text-foreground shadow-[0_24px_54px_rgba(15,23,42,0.10)] sm:p-10">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          <p className="mt-2 text-xs text-muted-foreground">Dernière mise à jour : {updated}</p>
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
      <h2 className="text-base font-bold text-foreground sm:text-lg">{heading}</h2>
      <div className="mt-2.5 space-y-3 text-[14px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
