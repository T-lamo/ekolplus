'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { CtaLink } from './landing-ui';

// Banani `#topbar` nav links. Absolute-to-`/` (not bare `#anchor`): this
// header also renders on /confidentialite and /cgu (via LegalArticle),
// which don't have these section ids — a bare hash would just sit on the
// current page doing nothing. `/#anchor` always returns to the landing
// page and scrolls, while staying a same-document scroll (no reload) when
// already on `/`.
const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/#features', label: 'Fonctionnalités' },
  { href: '/#pricing', label: 'Tarifs' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/#contact', label: 'Contact' },
];

/** Fixed glass-pill topbar (Banani `#topbar`). It floats over the dark hero
 * gradient at the top (translucent white glass, white text); once the page
 * scrolls it switches to a solid navy pill so the white links stay legible
 * over the light sections below. `solid` forces the navy pill from the
 * start — for pages with no dark hero (/confidentialite, /cgu), where the
 * white-on-glass text would be invisible. Mobile: hamburger opens a
 * full-width navy panel with the links. */
export function LandingHeader({ solid = false }: { solid?: boolean }) {
  const [scrolled, setScrolled] = useState(solid);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (solid) return;
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [solid]);

  return (
    <>
      {/* Scroll-blur veil: content sliding up under the pill fades into a
          soft frosted blur instead of clipping hard behind it. Sits below
          the header pill (z-40 < z-50) so the pill's own bg/blur is
          untouched. */}
      <div
        aria-hidden="true"
        className="landing-scroll-blur pointer-events-none fixed inset-x-0 top-0 z-40 h-24 backdrop-blur-md sm:h-28 lg:h-32"
      />
      <header className="fixed inset-x-0 top-0 z-50 px-4 py-4 sm:px-6 lg:px-12">
        <div
          className={`mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 rounded-[18px] border px-4 backdrop-blur-[10px] transition-colors duration-300 sm:h-[64px] sm:px-5 ${
            scrolled || open
              ? 'border-white/[0.14] bg-[#0f172a]/90 shadow-[0_10px_40px_rgba(15,23,42,0.30)]'
              : 'border-white/10 bg-white/[0.08]'
          }`}
        >
          <Link
            href="/"
            className="flex min-h-12 min-w-0 items-center gap-2.5"
            onClick={() => setOpen(false)}
          >
            <Image
              src="/logos/schoolgesti-lockup-blanc.svg"
              alt="SchoolGesti"
              width={140}
              height={38}
              className="h-6 w-auto sm:h-7"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-7 lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm whitespace-nowrap text-white/[0.78] transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="hidden h-10 items-center rounded-md border border-white/[0.14] bg-white/10 px-4 text-[13px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-white/15 sm:inline-flex"
            >
              Se connecter
            </Link>
            <span className="hidden sm:inline-block">
              <CtaLink href="/#contact" className="h-10 text-[13px]">
                Demander une démo
              </CtaLink>
            </span>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={open}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10 lg:hidden"
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
              className="mx-auto mt-2 max-w-[1280px] overflow-hidden rounded-[18px] border border-white/[0.14] bg-[#0f172a]/95 backdrop-blur-xl lg:hidden"
            >
              <div className="flex flex-col px-5 py-2">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center border-b border-white/10 text-[15px] font-semibold text-white last:border-b-0"
                  >
                    {link.label}
                  </a>
                ))}
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center border-b border-white/10 text-[15px] font-semibold text-white sm:hidden"
                >
                  Se connecter
                </Link>
                <div className="py-3 sm:hidden">
                  <CtaLink href="/#contact" className="w-full text-[15px]">
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
