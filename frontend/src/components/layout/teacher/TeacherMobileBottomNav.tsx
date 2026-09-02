'use client';

// Teacher twin of mobile/MobileBottomNav — same phone-native bottom bar,
// curated to the teacher's four screens plus « Plus » opening the sidebar
// drawer (profile + logout live there via SidebarUserProfile).
import {
  CalendarDays,
  LayoutDashboard,
  Menu,
  NotebookPen,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveRoute } from '../sidebar/route-match';

interface BottomNavLink {
  key: 'home' | 'students' | 'gradebook' | 'timetable';
  href: string;
  icon: LucideIcon;
}

const LINK_DEFS: BottomNavLink[] = [
  { key: 'home', href: '/espace-enseignant', icon: LayoutDashboard },
  { key: 'students', href: '/espace-enseignant/eleves', icon: Users },
  { key: 'gradebook', href: '/espace-enseignant/carnet-de-notes', icon: NotebookPen },
  { key: 'timetable', href: '/espace-enseignant/emploi-du-temps', icon: CalendarDays },
];

// Icon-only: a label under each of 5 narrow tabs made the row read
// unevenly (one tab's label was much longer than the rest). The name still
// reaches screen readers via `aria-label` on each link/button.
export function TeacherMobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const t = useTranslations('TeacherPortal.nav');
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
