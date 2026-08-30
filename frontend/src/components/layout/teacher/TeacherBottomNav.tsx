'use client';

// Teacher portal's own fixed bottom tab bar — deliberately not a reuse of
// the admin MobileBottomNav (that one's 4 links and "Plus" drawer are
// admin-shaped). Phase 2 ships 3 real destinations; Phase 3/4 extend
// LINK_DEFS with Notes/Appréciations/Présences per
// docs/superpowers/specs/2026-08-30-espace-enseignant-design.md's final
// 5-tab shell design.
import { Home, Users, CalendarDays, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveRoute } from '../sidebar/route-match';

interface TeacherNavLink {
  key: 'home' | 'classes' | 'timetable';
  href: string;
  icon: LucideIcon;
}

const LINK_DEFS: TeacherNavLink[] = [
  { key: 'home', href: '/espace-enseignant', icon: Home },
  { key: 'classes', href: '/espace-enseignant/classes', icon: Users },
  { key: 'timetable', href: '/espace-enseignant/emploi-du-temps', icon: CalendarDays },
];

export function TeacherBottomNav() {
  const t = useTranslations('TeacherPortal.nav');
  const pathname = usePathname();

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {LINK_DEFS.map((item) => {
        const active = isActiveRoute(pathname, item.href);
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
    </nav>
  );
}
