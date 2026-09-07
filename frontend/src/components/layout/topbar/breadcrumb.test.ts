import { describe, expect, it } from 'vitest';
import { CreditCard, Settings, UserCheck, Users } from 'lucide-react';
import { getBreadcrumbTrail } from './breadcrumb';
import type { NavSection } from '../sidebar/types';

const SECTIONS: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Élèves', href: '/eleves', icon: Users },
      // Personnel module (2026-09-04): replaces the old Enseignants nav
      // entry at the same position, /enseignants now redirects here.
      { label: 'Personnel', href: '/personnel', icon: UserCheck },
    ],
  },
  {
    label: 'Compte',
    items: [
      { label: 'Abonnement', href: '/abonnement', icon: CreditCard },
      { label: 'Année scolaire', href: '/settings?tab=annee', icon: Settings },
      { label: 'Paramètres', href: '/settings', icon: Settings },
    ],
  },
];

describe('getBreadcrumbTrail', () => {
  it('derives [section, item] for a top-level nav route', () => {
    expect(getBreadcrumbTrail('/eleves', SECTIONS)).toEqual(['Principal', 'Élèves']);
  });

  it('appends an extra crumb for a sub-page not in the nav', () => {
    expect(getBreadcrumbTrail('/eleves/42', SECTIONS, { '/eleves/42': 'Fiche élève' })).toEqual([
      'Principal',
      'Élèves',
      'Fiche élève',
    ]);
  });

  it('returns an empty trail for an unknown route', () => {
    expect(getBreadcrumbTrail('/unknown-route', SECTIONS)).toEqual([]);
  });

  it('resolves the /settings query-collision to the plain Paramètres item', () => {
    expect(getBreadcrumbTrail('/settings', SECTIONS)).toEqual(['Compte', 'Paramètres']);
  });

  it('the checkout page under /abonnement stays under Compte › Abonnement', () => {
    expect(getBreadcrumbTrail('/abonnement/paiement', SECTIONS)).toEqual(['Compte', 'Abonnement']);
  });

  it('a Personnel fiche route stays under Principal › Personnel', () => {
    expect(getBreadcrumbTrail('/personnel/abc123', SECTIONS)).toEqual(['Principal', 'Personnel']);
  });
});
