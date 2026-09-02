'use client';

// Student twin of teacher/TeacherMobileBottomNav — same phone-native bottom
// bar: Accueil, Mes notes, Mes présences, Emploi du temps and « Plus »
// (opens the sidebar drawer, where Mon profil, Bulletins, Appréciations,
// Paramètres and logout live). Five slots, like the teacher bar.
import {
  BarChart2,
  CalendarCheck,
  CalendarDays,
  LayoutDashboard,
  Menu,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveRoute } from '../sidebar/route-match';

interface BottomNavLink {
  key: 'home' | 'profile' | 'grades' | 'attendance' | 'timetable';
  href: string;
  icon: LucideIcon;
}

const LINK_DEFS: BottomNavLink[] = [
  { key: 'home', href: '/eleve', icon: LayoutDashboard },
  { key: 'grades', href: '/eleve/notes', icon: BarChart2 },
  { key: 'attendance', href: '/eleve/presences', icon: CalendarCheck },
  { key: 'timetable', href: '/eleve/emploi-du-temps', icon: CalendarDays },
];

// Icon-only: a label under each narrow tab made the row read unevenly on
// the teacher bar. The name still reaches screen readers via `aria-label`.
export function StudentMobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const t = useTranslations('ElevePortal.nav');
  const pathname = usePathname();
  const activeHref = LINK_DEFS.find((l) => isActiveRoute(pathname, l.href))?.href ?? null;
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
            aria-label={t(item.key)}
            className={`flex flex-1 items-center justify-center ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon size={24} strokeWidth={active ? 2.5 : 2} />
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        aria-label={t('moreAriaLabel')}
        className={`flex flex-1 items-center justify-center ${
          moreActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Menu size={24} strokeWidth={moreActive ? 2.5 : 2} />
      </button>
    </nav>
  );
}
