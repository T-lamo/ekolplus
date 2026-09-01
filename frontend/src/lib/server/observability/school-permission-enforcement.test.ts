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
});
