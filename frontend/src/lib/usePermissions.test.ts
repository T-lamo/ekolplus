// usePermissions()'s decision logic, tested via the exported pure
// `computeCan` (no @testing-library/react in this project — see the
// permission-manager spec's Task 6 controller ruling).
import { describe, it, expect } from 'vitest';
import { computeCan } from './usePermissions';

describe('computeCan', () => {
  it('permissions === null (snapshot not yet loaded) => everything visible, anti-flicker', () => {
    expect(computeCan(null, 'eleves', 'view')).toBe(true);
    expect(computeCan(null, 'eleves', 'edit')).toBe(true);
    expect(computeCan(null, 'configuration', 'delete')).toBe(true);
  });

  it("permissions === 'ALL' (OWNER/ADMIN) => every module.action allowed", () => {
    expect(computeCan('ALL', 'eleves', 'view')).toBe(true);
    expect(computeCan('ALL', 'eleves', 'edit')).toBe(true);
    expect(computeCan('ALL', 'configuration', 'delete')).toBe(true);
  });

  it('a grant list only allows the listed module.action pairs', () => {
    const permissions = ['eleves.view'];
    expect(computeCan(permissions, 'eleves', 'view')).toBe(true);
    expect(computeCan(permissions, 'eleves', 'edit')).toBe(false);
    expect(computeCan(permissions, 'notes', 'view')).toBe(false);
  });

  it('an empty grant list denies everything', () => {
    expect(computeCan([], 'eleves', 'view')).toBe(false);
  });
});
