// RBAC-01 — toute route /api/school/* doit passer par requireSchoolPermission
// (ou être en liste blanche explicite). Miroir de runtime-enforcement.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', 'app', 'api', 'school');
const WHITELIST = [
  'route.ts', // bootstrap GET/DELETE (PUT utilise requireSchoolPermission)
  'billing/',
  'export/route.ts',
  'roles/',
  'members/',
  'timetable/route.ts', // GET opt-in enseignant : garde manuelle documentée
  'accounts/', // résolution de compte (requireAccountAccess) : rang de rôle + resolveSchoolAccount, pas un grant unique — module Personnel §7
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : name === 'route.ts' ? [p] : [];
  });
}

describe('school routes enforce staff permissions (RBAC-01)', () => {
  it('every non-whitelisted school route uses requireSchoolPermission', () => {
    const offenders = walk(ROOT)
      .filter((p) => {
        const rel = p.slice(ROOT.length + 1).replaceAll('\\', '/');
        return !WHITELIST.some((w) => rel === w || rel.startsWith(w));
      })
      .filter((p) => !readFileSync(p, 'utf8').includes('requireSchoolPermission('));
    expect(offenders).toEqual([]);
  });

  // Witness for the `accounts/` whitelist exemption (module Personnel §7):
  // these two routes deliberately authorize via role-rank +
  // `resolveSchoolAccount`/`requireAccountAccess`, not a single
  // `requireSchoolPermission` grant — same exemption reasoning as
  // `members/`. If either route starts calling requireSchoolPermission,
  // this test should be revisited (the whitelist entry would then be
  // stale) rather than silently passing.
  it('accounts/[userId] routes do NOT call requireSchoolPermission (documented exemption)', () => {
    const accountsRoot = join(ROOT, 'accounts');
    const files = walk(accountsRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toContain('requireSchoolPermission(');
    }
  });
});
