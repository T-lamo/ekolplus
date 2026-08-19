'use client';

// Phone-native bottom tab bar — replaces the topbar hamburger below `lg`
// (matches the sidebar's own `hidden lg:flex` cutoff). Curated to the 4
// screens staff reach for most on a phone; everything else (Enseignants,
// Présences, Emploi du temps, Bulletins, Appréciations, Configuration,
// Abonnement, Paramètres) stays one tap away behind « Plus », which opens
// the same drawer the sidebar used to reach via the hamburger.
import { LayoutDashboard, Menu, NotebookPen, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveRoute } from '../sidebar/route-match';

interface BottomNavLink {
  key: 'home' | 'students' | 'grades' | 'tuition';
  href: string;
  icon: LucideIcon;
}

const LINK_DEFS: BottomNavLink[] = [
  { key: 'home', href: '/dashboard', icon: LayoutDashboard },
  { key: 'students', href: '/eleves', icon: Users },
  { key: 'grades', href: '/pedagogie/carnet-de-notes', icon: NotebookPen },
  { key: 'tuition', href: '/scolarite', icon: Wallet },
];

export function MobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const t = useTranslations('Shell.mobileNav');
  const pathname = usePathname();
  const activeHref = LINK_DEFS.find((l) => isActiveRoute(pathname, l.href))?.href ?? null;
  // Nothing in the curated 4 matched — user is in one of the "Plus" screens,
  // so the More tab reads as active too (always somewhere highlighted).
  const moreActive = activeHref === null;

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch bg-sidebar-light pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(26,26,46,0.08)] lg:hidden"
    >
      {LINK_DEFS.map((item) => {
        const active = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 2} />
            <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>
              {t(item.key)}
            </span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        aria-label={t('moreAriaLabel')}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
          moreActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Menu size={22} strokeWidth={moreActive ? 2.5 : 2} />
        <span className={`text-[10px] ${moreActive ? 'font-semibold' : 'font-medium'}`}>
          {t('more')}
        </span>
      </button>
    </nav>
  );
}
