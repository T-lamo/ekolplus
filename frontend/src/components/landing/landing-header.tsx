'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { CtaLink } from './landing-ui';

// Schoolgesti is a SIS (student information system — the administrative
// record and the school career), not an LMS: the nav only points at what the
// app really does. « Frais & paiements » = the in-app « Frais & Scolarité »
// module (fee schedules, payments, reminders).
const NAV_LINKS: { href: string; label: string }[] = [
  { href: '#features', label: 'Fonctionnalités' },
  { href: '#frais-section', label: 'Frais & paiements' },
  { href: '#roles', label: 'Pour qui ?' },
  { href: '#pricing', label: 'Tarifs' },
];

/** Fixed floating glass-pill nav (Banani `#nav`/`#navShell`). Mobile-first: a
 * hamburger opens a full-width panel with the links; the pill gains a
 * stronger background once the page is scrolled. */
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {/* Scroll-blur veil: content sliding up under the pill fades into a
          soft frosted blur instead of clipping hard behind it. Sits below
          the header pill (z-40 < z-50) so the pill's own bg/blur is
          untouched. */}
      <div
        aria-hidden="true"
        className="landing-scroll-blur pointer-events-none fixed inset-x-0 top-0 z-40 h-36 backdrop-blur-lg sm:h-44 lg:h-52"
      />
      <header className="fixed inset-x-0 top-0 z-50 px-4 py-4 sm:px-6 sm:py-6 lg:px-10">
        <div
          className={`mx-auto flex max-w-[1280px] items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3 backdrop-blur-xl transition-colors duration-300 sm:px-[18px] ${
            scrolled || open
              ? 'bg-[#1b142a]/70 shadow-[0_10px_40px_rgba(0,0,0,0.25)]'
              : 'bg-[#1b142a]/34'
          }`}
        >
          <Link
            href="/"
            className="flex min-h-12 min-w-0 items-center gap-2.5"
            onClick={() => setOpen(false)}
          >
            <Image
              src="/logos/schoolgesti-lockup-blanc.svg"
              alt="Schoolgesti"
              width={140}
              height={38}
              className="h-6 w-auto sm:h-7"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="whitespace-nowrap text-[13px] text-secondary-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="hidden rounded-full border border-border bg-white/5 px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap text-foreground transition-colors hover:bg-white/10 sm:inline-block"
            >
              Connexion
            </Link>
            <span className="hidden sm:inline-block">
              <CtaLink href="#contact-demo" className="px-4 py-2.5 text-[13px]">
                Demander une démo
              </CtaLink>
            </span>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={open}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/10 lg:hidden"
            >
              {open ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mx-auto mt-2 max-w-[1280px] overflow-hidden rounded-2xl border border-border bg-[#1b142a]/95 backdrop-blur-xl lg:hidden"
            >
              <div className="flex flex-col px-5 py-2">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center border-b border-border text-[15px] font-semibold text-foreground last:border-b-0"
                  >
                    {link.label}
                  </a>
                ))}
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center border-b border-border text-[15px] font-semibold text-foreground sm:hidden"
                >
                  Connexion
                </Link>
                <div className="py-3 sm:hidden">
                  <CtaLink href="#contact-demo" className="w-full py-3.5 text-[15px]">
                    Demander une démo
                  </CtaLink>
                </div>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
