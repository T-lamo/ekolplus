'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { btnPrimary } from './landing-ui';

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

/** Fixed top navigation for the marketing landing. Mobile-first: a hamburger
 * opens a full-width panel with the links; the bar gains a stronger blurred
 * background + shadow once the page is scrolled. */
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
    <header
      className={`fixed top-0 z-50 w-full border-b transition-all duration-300 ${
        scrolled || open
          ? 'border-slate-200 bg-white/95 shadow-md backdrop-blur-md'
          : 'border-transparent bg-white/70 backdrop-blur'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center" onClick={() => setOpen(false)}>
          <Image
            src="/logos/schoolgesti-lockup.svg"
            alt="Schoolgesti"
            width={164}
            height={44}
            className="h-9 w-auto"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center text-sm font-semibold text-slate-500 transition-colors hover:text-violet-600"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden px-4 py-2 text-sm font-semibold text-slate-500 transition-colors hover:text-violet-600 lg:block"
          >
            Connexion
          </Link>
          <span className="hidden sm:inline-block">
            <a href="#contact-demo" className={`${btnPrimary} px-4 py-2 text-sm`}>
              Demander une démo
            </a>
          </span>
          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 md:hidden"
          >
            {open ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {open && (
        <nav className="border-t border-slate-200 bg-white px-6 py-4 md:hidden">
          <div className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center border-b border-slate-100 py-3 text-base font-semibold text-slate-600 transition-colors hover:text-violet-600"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="border-b border-slate-100 py-3 text-base font-semibold text-slate-600 transition-colors hover:text-violet-600"
            >
              Connexion
            </Link>
            <a
              href="#contact-demo"
              onClick={() => setOpen(false)}
              className={`${btnPrimary} mt-4 w-full py-3 text-base`}
            >
              Demander une démo
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
