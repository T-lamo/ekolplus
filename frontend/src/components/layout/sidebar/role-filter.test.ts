import { describe, expect, it } from 'vitest';
import { CreditCard, LayoutDashboard, Settings } from 'lucide-react';
import { filterSectionsByRole, type NavSection } from './types';

const SECTIONS: NavSection[] = [
  {
    label: 'Principal',
    items: [{ label: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Compte',
    items: [
      { label: 'Abonnement', href: '/abonnement', icon: CreditCard, minRole: 'ADMIN' },
      { label: 'Paramètres', href: '/settings', icon: Settings },
    ],
  },
  {
    label: 'Propriétaire',
    items: [{ label: 'Transfert', href: '/transfert', icon: Settings, minRole: 'OWNER' }],
  },
];

const labels = (sections: NavSection[]) =>
  sections.map((s) => [s.label, s.items.map((i) => i.label)] as const);

describe('filterSectionsByRole', () => {
  it('unknown role (loading / no school): everything stays', () => {
    expect(filterSectionsByRole(SECTIONS, null)).toBe(SECTIONS);
  });
  it('OWNER sees every entry', () => {
    expect(labels(filterSectionsByRole(SECTIONS, 'OWNER'))).toEqual([
      ['Principal', ['Tableau de bord']],
      ['Compte', ['Abonnement', 'Paramètres']],
      ['Propriétaire', ['Transfert']],
    ]);
  });
  it('ADMIN sees ADMIN-gated entries but not OWNER-only ones (empty section dropped)', () => {
    expect(labels(filterSectionsByRole(SECTIONS, 'ADMIN'))).toEqual([
      ['Principal', ['Tableau de bord']],
      ['Compte', ['Abonnement', 'Paramètres']],
    ]);
  });
  it('MEMBER: « Abonnement » hidden, the rest of « Compte » stays', () => {
    expect(labels(filterSectionsByRole(SECTIONS, 'MEMBER'))).toEqual([
      ['Principal', ['Tableau de bord']],
      ['Compte', ['Paramètres']],
    ]);
  });
  it('does not mutate the input', () => {
    filterSectionsByRole(SECTIONS, 'MEMBER');
    expect(SECTIONS[1]!.items).toHaveLength(2);
  });
});
