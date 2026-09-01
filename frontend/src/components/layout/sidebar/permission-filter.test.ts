import { describe, expect, it } from 'vitest';
import { CreditCard, LayoutDashboard, Settings, Users } from 'lucide-react';
import { filterSectionsByPermissions, type NavSection } from './types';

const SECTIONS: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
      { label: 'Élèves', href: '/eleves', icon: Users, module: 'eleves' },
    ],
  },
  {
    label: 'Compte',
    items: [
      { label: 'Abonnement', href: '/abonnement', icon: CreditCard, minRole: 'ADMIN' },
      { label: 'Paramètres', href: '/settings', icon: Settings },
    ],
  },
];

const labels = (sections: NavSection[]) =>
  sections.map((s) => [s.label, s.items.map((i) => i.label)] as const);

describe('filterSectionsByPermissions', () => {
  it('null permissions (loading): everything stays, same reference', () => {
    expect(filterSectionsByPermissions(SECTIONS, null)).toBe(SECTIONS);
  });

  it("'ALL' permissions: everything stays", () => {
    expect(labels(filterSectionsByPermissions(SECTIONS, 'ALL'))).toEqual([
      ['Principal', ['Tableau de bord', 'Élèves']],
      ['Compte', ['Abonnement', 'Paramètres']],
    ]);
  });

  it("['eleves.view']: only items without a module plus the 'eleves' item survive, empty section dropped", () => {
    expect(labels(filterSectionsByPermissions(SECTIONS, ['eleves.view']))).toEqual([
      ['Principal', ['Élèves']],
      ['Compte', ['Abonnement', 'Paramètres']],
    ]);
  });

  it('does not mutate the input', () => {
    filterSectionsByPermissions(SECTIONS, ['eleves.view']);
    expect(SECTIONS[0]!.items).toHaveLength(2);
  });
});
