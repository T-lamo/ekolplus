import { describe, expect, it } from 'vitest';
import { LayoutDashboard, School, Settings, UserPlus } from 'lucide-react';
import { isActiveRoute, findActiveItem, findActiveSection } from './route-match';
import type { NavSection } from './types';

const SECTIONS: NavSection[] = [
  {
    label: 'Vue globale',
    items: [{ label: 'Tableau de bord', href: '/admin', icon: LayoutDashboard }],
  },
  {
    label: 'Clients',
    items: [
      { label: 'Écoles', href: '/admin/schools', icon: School },
      { label: 'Créer une école', href: '/admin/schools/new', icon: UserPlus },
    ],
  },
  {
    label: 'Compte',
    items: [
      { label: 'Abonnement', href: '/abonnement', icon: Settings },
      // Query-bearing shortcut into a page another item owns (mechanism kept).
      { label: 'Année scolaire', href: '/settings?tab=annee', icon: Settings },
      { label: 'Paramètres', href: '/settings', icon: Settings },
    ],
  },
];

describe('isActiveRoute', () => {
  it('matches nested/dynamic routes via prefix', () => {
    expect(isActiveRoute('/eleves/123', '/eleves')).toBe(true);
  });

  it('does not match a route that merely shares a text prefix', () => {
    expect(isActiveRoute('/eleves-archive', '/eleves')).toBe(false);
  });

  it('treats /admin as an exact-only root (would otherwise match every admin sub-route)', () => {
    expect(isActiveRoute('/admin/schools', '/admin')).toBe(false);
    expect(isActiveRoute('/admin', '/admin')).toBe(true);
  });

  it('treats /dashboard as an exact-only root', () => {
    expect(isActiveRoute('/dashboard', '/dashboard')).toBe(true);
    expect(isActiveRoute('/dashboard/foo', '/dashboard')).toBe(false);
  });
});

describe('findActiveItem', () => {
  it('resolves prefix collisions to the most specific (longest) href', () => {
    const active = findActiveItem('/admin/schools/new', SECTIONS);
    expect(active?.href).toBe('/admin/schools/new');
  });

  it('prefers the query-less sibling when hrefs collide on stripped path', () => {
    const active = findActiveItem('/settings', SECTIONS);
    expect(active?.href).toBe('/settings');
    expect(active?.label).toBe('Paramètres');
  });

  it('a nested page of a top-level item highlights that item (/abonnement/paiement → Abonnement)', () => {
    expect(findActiveItem('/abonnement/paiement', SECTIONS)?.label).toBe('Abonnement');
    expect(findActiveItem('/abonnement', SECTIONS)?.label).toBe('Abonnement');
  });

  it('returns null when nothing matches', () => {
    expect(findActiveItem('/nowhere', SECTIONS)).toBeNull();
  });
});

describe('findActiveSection', () => {
  it('returns the label of the section containing the active item', () => {
    expect(findActiveSection('/admin/schools/new', SECTIONS)).toBe('Clients');
  });

  it('returns null when nothing matches', () => {
    expect(findActiveSection('/nowhere', SECTIONS)).toBeNull();
  });
});
