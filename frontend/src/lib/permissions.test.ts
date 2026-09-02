import { describe, expect, it } from 'vitest';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  allGrants,
  hasGrant,
  isValidGrant,
  sanitizeGrants,
} from './permissions';

describe('permission registry', () => {
  it('has 10 modules, unique keys, known sections and applicable actions only', () => {
    expect(PERMISSION_MODULES).toHaveLength(10);
    const keys = PERMISSION_MODULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of PERMISSION_MODULES) {
      expect(['general', 'academic', 'finance', 'config']).toContain(m.section);
      for (const a of m.actions) expect(PERMISSION_ACTIONS).toContain(a);
    }
    // dashboard n'a que view/export ; configuration et parametres n'ont pas export
    expect(PERMISSION_MODULES.find((m) => m.key === 'dashboard')?.actions).toEqual([
      'view',
      'export',
    ]);
    expect(PERMISSION_MODULES.find((m) => m.key === 'configuration')?.actions).toEqual([
      'view',
      'create',
      'edit',
      'delete',
    ]);
  });

  it('isValidGrant accepts applicable pairs and rejects everything else', () => {
    expect(isValidGrant('eleves.view')).toBe(true);
    expect(isValidGrant('dashboard.create')).toBe(false); // action non applicable
    expect(isValidGrant('inconnu.view')).toBe(false);
    expect(isValidGrant('eleves')).toBe(false);
  });

  it('sanitizeGrants drops unknown entries, dedupes, and orders by registry', () => {
    expect(sanitizeGrants(['zzz', 'eleves.view', 'eleves.view', 'dashboard.view'])).toEqual([
      'dashboard.view',
      'eleves.view',
    ]);
  });

  it('hasGrant handles ALL, arrays and Sets', () => {
    expect(hasGrant('ALL', 'paiements', 'delete')).toBe(true);
    expect(hasGrant(['eleves.view'], 'eleves', 'view')).toBe(true);
    expect(hasGrant(['eleves.view'], 'eleves', 'edit')).toBe(false);
    expect(hasGrant(new Set(['notes.export']), 'notes', 'export')).toBe(true);
  });

  it('allGrants covers exactly the applicable combinations', () => {
    const total = PERMISSION_MODULES.reduce((n, m) => n + m.actions.length, 0);
    expect(allGrants()).toHaveLength(total);
    expect(allGrants().every(isValidGrant)).toBe(true);
  });
});
