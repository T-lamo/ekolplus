# Permission Manager (RBAC école) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Des rôles personnalisés par école (Comptable, Secrétaire, …) avec une matrice module×action, appliqués automatiquement côté serveur (toutes les routes `/api/school/*`) et côté client (sidebar, pages, boutons) dès la connexion.

**Architecture:** Un registre de permissions typé partagé client/serveur (`lib/permissions.ts`), un modèle Prisma `StaffRole` (grants `String[]` de la forme `"module.action"`) assigné aux `OrganizationMember` MEMBER, un helper serveur `requireSchoolPermission` qui remplace `resolveMySchool` dans chaque route school, les permissions livrées au shell via le snapshot `/api/school/billing/plan` → `SchoolPlanContext`, et deux écrans Banani (`/settings/permissions` + modal Créer un rôle) traduits dans le design system SchoolGesti.

**Tech Stack:** Next.js 16 App Router, Prisma 5 + Neon, Tailwind v4, next-intl (fr/ht/en), Vitest. Zéro dépendance nouvelle (pas de Casbin/CASL — décision spec §2.2).

**Spec:** `docs/superpowers/specs/2026-09-01-permission-manager-design.md` (+ plans écrans : `.planning/banani/permission-manager.md`, `.planning/banani/create-role.md`)

## Global Constraints

- Toute nouvelle Route Handler exporte `export const runtime = 'nodejs';` (tripwire CI existant).
- Mutations : `verifyCsrf(req)` en tête de handler ; `requireAuth()` ; `withRequestContext`.
- Codes d'erreur stables (`PERMISSION_DENIED`, `ROLE_NAME_TAKEN`) — le frontend switch sur `ApiError.code`, jamais sur `message`.
- Aucun tiret cadratin (—) dans les textes affichés ; « · » pour les paires courtes (CLAUDE.md, Conventions).
- Pas de hex de marque en dur dans les composants — tokens du thème (`bg-secondary`, `text-primary`, …). Exception : les pastilles de modules du registre (couleurs de données, non thémées, comme les matières).
- i18n : parité des clés fr/en/ht (`locales.test.ts` échoue sinon) ; ht garde `_review`.
- Portails enseignant/élève (`/api/teacher/*`, `/espace-enseignant`) : interdits de modification dans ce plan, sauf la route `GET /api/school/timetable` (cas opt-in, Task 12).
- Fichiers protégés CLAUDE.md (auth.ts, middleware/index.ts, …) : ne pas toucher. Rien dans ce plan ne l'exige.
- **Avant chaque commit :** `pnpm format && pnpm lint && pnpm typecheck && pnpm test` (le hook pre-commit rejoue prettier/eslint/typecheck).
- Après `prisma generate` / migration : redémarrer le serveur dev si besoin de tester en live (client Prisma périmé → 500), et **ne pas tuer le process :3000 sans vérifier son propriétaire** (souvent le terminal de l'utilisateur).
- Arbre git partagé avec d'autres sessions : `git add` avec chemins explicites uniquement.

---

### Task 1: Registre de permissions partagé — `lib/permissions.ts`

**Files:**
- Create: `frontend/src/lib/permissions.ts`
- Test: `frontend/src/lib/permissions.test.ts`

**Interfaces:**
- Produces (consommé par toutes les tâches suivantes) :
  - `PERMISSION_ACTIONS: readonly ['view','create','edit','delete','export']`, type `PermissionAction`
  - `PERMISSION_MODULES: readonly PermissionModule[]` — `{ key, section, actions, icon, dotBg, dotFg }`
  - types `PermissionModuleKey`, `PermissionSection ('general'|'academic'|'finance'|'config')`, `PermissionGrant = \`${PermissionModuleKey}.${PermissionAction}\``
  - `isValidGrant(g: string): g is PermissionGrant` (clé module connue ET action applicable à ce module)
  - `sanitizeGrants(input: readonly string[]): PermissionGrant[]` (filtre + déduplique, ordre du registre)
  - `hasGrant(grants: 'ALL' | readonly string[] | ReadonlySet<string>, module: PermissionModuleKey, action: PermissionAction): boolean`
  - `allGrants(): PermissionGrant[]`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// frontend/src/lib/permissions.test.ts
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
```

- [ ] **Step 2: Vérifier l'échec** — `pnpm --filter frontend exec vitest run src/lib/permissions.test.ts` → FAIL (module inexistant).

- [ ] **Step 3: Implémenter**

```ts
// frontend/src/lib/permissions.ts
// Source unique de vérité du RBAC école (spec 2026-09-01-permission-manager).
// Module PUR, partagé client/serveur — pas de 'server-only', pas d'import React.
// Les couleurs dotBg/dotFg sont des couleurs de données (pastilles de la
// matrice), volontairement non thémées, comme les couleurs de matières.

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionSection = 'general' | 'academic' | 'finance' | 'config';

export interface PermissionModule {
  key: string;
  section: PermissionSection;
  actions: readonly PermissionAction[];
  /** Nom d'icône lucide — mappé vers le composant dans permission-icons.ts (client). */
  icon: string;
  dotBg: string;
  dotFg: string;
}

const ALL_ACTIONS = PERMISSION_ACTIONS;
const NO_EXPORT = ['view', 'create', 'edit', 'delete'] as const;

export const PERMISSION_MODULES = [
  { key: 'dashboard', section: 'general', actions: ['view', 'export'], icon: 'layout-dashboard', dotBg: '#EFEAFB', dotFg: '#6C2BD9' },
  { key: 'eleves', section: 'academic', actions: ALL_ACTIONS, icon: 'users', dotBg: '#EAF9F4', dotFg: '#16A34A' },
  { key: 'enseignants', section: 'academic', actions: ALL_ACTIONS, icon: 'user-check', dotBg: '#FFF5EA', dotFg: '#D97706' },
  { key: 'notes', section: 'academic', actions: ALL_ACTIONS, icon: 'notebook-pen', dotBg: '#FFF9E8', dotFg: '#CA8A04' },
  { key: 'appreciations', section: 'academic', actions: ALL_ACTIONS, icon: 'message-square-text', dotBg: '#FDF0F5', dotFg: '#DB2777' },
  { key: 'presences', section: 'academic', actions: ALL_ACTIONS, icon: 'calendar-check', dotBg: '#EEF8FF', dotFg: '#0284C7' },
  { key: 'emploiDuTemps', section: 'academic', actions: ALL_ACTIONS, icon: 'calendar-days', dotBg: '#FAF0FF', dotFg: '#C026D3' },
  { key: 'paiements', section: 'finance', actions: ALL_ACTIONS, icon: 'wallet', dotBg: '#E6F4F1', dotFg: '#0F766E' },
  { key: 'configuration', section: 'config', actions: NO_EXPORT, icon: 'settings-2', dotBg: '#F1F5F9', dotFg: '#475569' },
  { key: 'parametres', section: 'config', actions: NO_EXPORT, icon: 'sliders-horizontal', dotBg: '#F1F5F9', dotFg: '#475569' },
] as const satisfies readonly PermissionModule[];

export type PermissionModuleKey = (typeof PERMISSION_MODULES)[number]['key'];
export type PermissionGrant = `${PermissionModuleKey}.${PermissionAction}`;

const MODULE_BY_KEY = new Map<string, PermissionModule>(PERMISSION_MODULES.map((m) => [m.key, m]));

export function isValidGrant(g: string): g is PermissionGrant {
  const dot = g.indexOf('.');
  if (dot === -1) return false;
  const mod = MODULE_BY_KEY.get(g.slice(0, dot));
  if (!mod) return false;
  return (mod.actions as readonly string[]).includes(g.slice(dot + 1));
}

export function sanitizeGrants(input: readonly string[]): PermissionGrant[] {
  const wanted = new Set(input.filter(isValidGrant));
  return allGrants().filter((g) => wanted.has(g));
}

export function hasGrant(
  grants: 'ALL' | readonly string[] | ReadonlySet<string>,
  module: PermissionModuleKey,
  action: PermissionAction,
): boolean {
  if (grants === 'ALL') return true;
  const g: string = `${module}.${action}`;
  return grants instanceof Set ? grants.has(g) : (grants as readonly string[]).includes(g);
}

export function allGrants(): PermissionGrant[] {
  return PERMISSION_MODULES.flatMap((m) =>
    m.actions.map((a) => `${m.key}.${a}` as PermissionGrant),
  );
}
```

- [ ] **Step 4: Vérifier le pass** — même commande → PASS.
- [ ] **Step 5: Commit** — `git add frontend/src/lib/permissions.ts frontend/src/lib/permissions.test.ts && git commit -m "feat(permissions): typed module-action grant registry"`

---

### Task 2: Modèle Prisma `StaffRole` + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (modèle `StaffRole` nouveau ; `OrganizationMember` +2 lignes ; `School` +1 back-relation)

**Interfaces:**
- Produces : `prisma.staffRole` (client généré), `OrganizationMember.staffRoleId`/`.staffRole`.

- [ ] **Step 1: Éditer le schéma.** Ajouter après le modèle `OrganizationMember` :

```prisma
// Rôle personnalisé de staff école (RBAC — spec 2026-09-01-permission-manager).
// grants = permissions "module.action" du registre lib/permissions.ts.
// OWNER/ADMIN n'utilisent pas de StaffRole (accès total implicite).
model StaffRole {
  id          String   @id @default(cuid())
  schoolId    String
  school      School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  name        String
  description String?
  grants      String[] @default([])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  members     OrganizationMember[]

  @@unique([schoolId, name])
  @@index([schoolId])
}
```

Dans `model OrganizationMember`, ajouter avant `createdAt` :

```prisma
  staffRoleId String?
  staffRole   StaffRole? @relation(fields: [staffRoleId], references: [id], onDelete: SetNull)
```

Dans `model School`, ajouter à la liste des relations :

```prisma
  staffRoles StaffRole[]
```

- [ ] **Step 2: Migration.** Depuis la racine : `pnpm db:migrate:dev -- --name staff_roles`. Attendu : nouvelle migration `35_staff_roles` (ou numéro suivant), client régénéré. En cas d'erreur de shadow DB, s'arrêter et suivre la mémoire projet (ne JAMAIS passer la vraie DATABASE_URL en shadow).
- [ ] **Step 3: Vérifier** — `pnpm typecheck` → PASS (le client expose `prisma.staffRole`).
- [ ] **Step 4: Commit** — `git add frontend/prisma/schema.prisma frontend/prisma/migrations && git commit -m "feat(schema): StaffRole model and OrganizationMember.staffRoleId"`

---

### Task 3: Résolution serveur — `lib/server/school-permissions.ts`

**Files:**
- Create: `frontend/src/lib/server/school-permissions.ts`
- Test: `frontend/src/lib/server/school-permissions.test.ts`

**Interfaces:**
- Consumes : `resolveMySchool`, `MySchool` (`@/lib/server/school`) ; `hasGrant`, `sanitizeGrants` (Task 1).
- Produces :
  - `type MyGrants = 'ALL' | ReadonlySet<PermissionGrant>`
  - `resolveGrantsFor(mySchool: MySchool, userId: string): Promise<MyGrants>`
  - `resolveMyGrants(userId: string): Promise<{ mySchool: MySchool; grants: MyGrants } | null>`
  - `requireSchoolPermission(userId, module, action, requestId): Promise<{ ok: true; mySchool: MySchool } | { ok: false; response: NextResponse }>` — 404 `NO_SCHOOL` (même corps que l'existant) ou 403 `PERMISSION_DENIED`.

- [ ] **Step 1: Test qui échoue**

```ts
// frontend/src/lib/server/school-permissions.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});
import { resolveMySchool } from '@/lib/server/school';
import { requireSchoolPermission, resolveMyGrants } from './school-permissions';

const mockResolve = vi.mocked(resolveMySchool);
const school = { organizationId: 'org1', schoolId: 'sch1', role: 'MEMBER' as const };

beforeEach(() => vi.clearAllMocks());

describe('resolveMyGrants', () => {
  it('returns null when the caller has no school', async () => {
    mockResolve.mockResolvedValueOnce(null);
    expect(await resolveMyGrants('u1')).toBeNull();
  });
  it('OWNER and ADMIN get ALL without a member query', async () => {
    mockResolve.mockResolvedValueOnce({ ...school, role: 'ADMIN' });
    const r = await resolveMyGrants('u1');
    expect(r?.grants).toBe('ALL');
    expect(prismaMock.organizationMember.findFirst).not.toHaveBeenCalled();
  });
  it('MEMBER with a staff role gets its sanitized grants', async () => {
    mockResolve.mockResolvedValueOnce(school);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      staffRole: { grants: ['eleves.view', 'not-a-grant'] },
    } as never);
    const r = await resolveMyGrants('u1');
    expect(r?.grants).toEqual(new Set(['eleves.view']));
  });
  it('MEMBER without a staff role gets an empty set (deny by default)', async () => {
    mockResolve.mockResolvedValueOnce(school);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({ staffRole: null } as never);
    const r = await resolveMyGrants('u1');
    expect(r?.grants).toEqual(new Set());
  });
});

describe('requireSchoolPermission', () => {
  it('404 NO_SCHOOL when resolveMySchool is null', async () => {
    mockResolve.mockResolvedValueOnce(null);
    const r = await requireSchoolPermission('u1', 'eleves', 'view', 'req1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response).toBeInstanceOf(NextResponse);
      expect(r.response.status).toBe(404);
      expect((await r.response.json()).error).toBe('NO_SCHOOL');
    }
  });
  it('403 PERMISSION_DENIED for a MEMBER without the grant', async () => {
    mockResolve.mockResolvedValueOnce(school);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({ staffRole: { grants: ['notes.view'] } } as never);
    const r = await requireSchoolPermission('u1', 'eleves', 'view', 'req1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect((await r.response.json()).error).toBe('PERMISSION_DENIED');
    }
  });
  it('passes through for a MEMBER holding the grant', async () => {
    mockResolve.mockResolvedValueOnce(school);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({ staffRole: { grants: ['eleves.view'] } } as never);
    const r = await requireSchoolPermission('u1', 'eleves', 'view', 'req1');
    expect(r).toEqual({ ok: true, mySchool: school });
  });
  it('passes through for OWNER regardless of grants', async () => {
    mockResolve.mockResolvedValueOnce({ ...school, role: 'OWNER' });
    const r = await requireSchoolPermission('u1', 'paiements', 'delete', 'req1');
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `pnpm --filter frontend exec vitest run src/lib/server/school-permissions.test.ts` → FAIL.
- [ ] **Step 3: Implémenter**

```ts
// frontend/src/lib/server/school-permissions.ts
// Application serveur du RBAC école (spec 2026-09-01-permission-manager) :
// remplace resolveMySchool() dans les routes /api/school/* pour porter la
// vérification module.action. OWNER/ADMIN passent toujours ; MEMBER passe
// par les grants de son StaffRole ; sans rôle = refus (deny by default).
import 'server-only';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { resolveMySchool, type MySchool } from './school';
import {
  hasGrant,
  sanitizeGrants,
  type PermissionAction,
  type PermissionGrant,
  type PermissionModuleKey,
} from '@/lib/permissions';

export type MyGrants = 'ALL' | ReadonlySet<PermissionGrant>;

export async function resolveGrantsFor(mySchool: MySchool, userId: string): Promise<MyGrants> {
  if (mySchool.role !== 'MEMBER') return 'ALL';
  const member = await prisma.organizationMember.findFirst({
    where: { userId, organizationId: mySchool.organizationId },
    select: { staffRole: { select: { grants: true } } },
  });
  return new Set(sanitizeGrants(member?.staffRole?.grants ?? []));
}

export async function resolveMyGrants(
  userId: string,
): Promise<{ mySchool: MySchool; grants: MyGrants } | null> {
  const mySchool = await resolveMySchool(userId);
  if (!mySchool) return null;
  return { mySchool, grants: await resolveGrantsFor(mySchool, userId) };
}

export type SchoolPermissionResult =
  | { ok: true; mySchool: MySchool }
  | { ok: false; response: NextResponse };

export async function requireSchoolPermission(
  userId: string,
  module: PermissionModuleKey,
  action: PermissionAction,
  requestId: string,
): Promise<SchoolPermissionResult> {
  const resolved = await resolveMyGrants(userId);
  if (!resolved) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': requestId } },
      ),
    };
  }
  if (!hasGrant(resolved.grants, module, action)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'PERMISSION_DENIED', message: 'You do not have permission to perform this action.' },
        { status: 403, headers: { 'x-request-id': requestId } },
      ),
    };
  }
  return { ok: true, mySchool: resolved.mySchool };
}
```

- [ ] **Step 4: Vérifier le pass**, puis **Step 5: Commit** — `git add frontend/src/lib/server/school-permissions.ts frontend/src/lib/server/school-permissions.test.ts && git commit -m "feat(permissions): server-side grant resolution and route guard"`

---

### Task 4: API CRUD des rôles — `/api/school/roles`

**Files:**
- Create: `frontend/src/app/api/school/roles/route.ts` (GET, POST)
- Create: `frontend/src/app/api/school/roles/[id]/route.ts` (PATCH, DELETE)
- Test: `frontend/src/app/api/school/roles/route.test.ts`

**Interfaces:**
- Consumes : `sanitizeGrants` (Task 1), `prisma.staffRole` (Task 2), `hasMinRole`/`resolveMySchool` (existants).
- Produces (consommé par Tasks 8–10) :
  - `GET` → `{ roles: [{ id, name, description, grants, memberCount, updatedAt }], systemCounts: { owners: number, admins: number } }` (rôles triés par nom)
  - `POST { name, description?, grants? }` → 201 `{ role }` ; 409 `{ error: 'ROLE_NAME_TAKEN' }`
  - `PATCH /[id] { name?, description?, grants? }` → `{ role }` ; 404 anti-fuite cross-école ; 409 `ROLE_NAME_TAKEN`
  - `DELETE /[id]` → `{ ok: true }` (membres → `staffRoleId: null` via SetNull)

- [ ] **Step 1: Test qui échoue.** Mocks selon la convention de `src/app/api/school/grade-levels/route.test.ts` (prismaMock d'abord, puis `vi.mock` de `@/lib/server/middleware` pour `requireAuth`, de `@/lib/server/auth` pour `verifyCsrf`, de `@/lib/server/school` pour `resolveMySchool`). Cas à couvrir, chacun en `it` séparé :

```ts
// frontend/src/app/api/school/roles/route.test.ts — squelette des cas
// (reprendre à l'identique le bloc de mocks de grade-levels/route.test.ts)
// 1. GET: 401 si requireAuth renvoie une NextResponse.
// 2. GET: 404 NO_SCHOOL si resolveMySchool → null.
// 3. GET: 403 si role MEMBER (hasMinRole('ADMIN') échoue) — corps { error: 'FORBIDDEN' }.
// 4. GET: 200 — prismaMock.staffRole.findMany avec { where: { schoolId }, orderBy: { name: 'asc' },
//    include: { _count: { select: { members: true } } } } ; memberCount mappé depuis _count.members ;
//    systemCounts via prismaMock.organizationMember.count appelé 2 fois (role OWNER puis ADMIN).
// 5. POST: 403 CSRF si verifyCsrf renvoie une NextResponse.
// 6. POST: 400 VALIDATION_FAILED si name vide/absent (zod).
// 7. POST: 201 — création avec grants passés par sanitizeGrants (envoyer ['eleves.view','bogus']
//    et vérifier que prismaMock.staffRole.create reçoit ['eleves.view']).
// 8. POST: 409 ROLE_NAME_TAKEN quand create rejette avec { code: 'P2002' } (duck-typé).
// 9. PATCH: 404 quand le rôle n'appartient pas à l'école du caller
//    (prismaMock.staffRole.findFirst → null).
// 10. PATCH: 200 — grants re-sanitisés, name/description mis à jour.
// 11. DELETE: 200 — prismaMock.staffRole.delete appelé avec l'id ; 404 anti-fuite comme PATCH.
```

Écrire ces 11 cas en entier (pas de squelette dans le fichier réel) en copiant la mécanique de mocks + helpers `makeReq` de `grade-levels/route.test.ts`.

- [ ] **Step 2: Vérifier l'échec.**
- [ ] **Step 3: Implémenter les 2 fichiers routes.**

```ts
// frontend/src/app/api/school/roles/route.ts
// GET (liste) + POST (création) des rôles staff — OWNER/ADMIN uniquement.
// Spec 2026-09-01-permission-manager §8.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { sanitizeGrants } from '@/lib/permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
  grants: z.array(z.string()).optional(),
});

function forbidden(requestId: string) {
  return NextResponse.json(
    { error: 'FORBIDDEN', message: 'Admin role required.' },
    { status: 403, headers: { 'x-request-id': requestId } },
  );
}
function noSchool(requestId: string) {
  return NextResponse.json(
    { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) return noSchool(ctx.requestId);
    if (!hasMinRole(mySchool.role, 'ADMIN')) return forbidden(ctx.requestId);

    const [roles, owners, admins] = await Promise.all([
      prisma.staffRole.findMany({
        where: { schoolId: mySchool.schoolId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { members: true } } },
      }),
      prisma.organizationMember.count({
        where: { organizationId: mySchool.organizationId, role: 'OWNER' },
      }),
      prisma.organizationMember.count({
        where: { organizationId: mySchool.organizationId, role: 'ADMIN' },
      }),
    ]);
    return NextResponse.json(
      {
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          grants: r.grants,
          memberCount: r._count.members,
          updatedAt: r.updatedAt.toISOString(),
        })),
        systemCounts: { owners, admins },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = verifyCsrf(req);
    if (csrf) return csrf;
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) return noSchool(ctx.requestId);
    if (!hasMinRole(mySchool.role, 'ADMIN')) return forbidden(ctx.requestId);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid role payload.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    try {
      const role = await prisma.staffRole.create({
        data: {
          schoolId: mySchool.schoolId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          grants: sanitizeGrants(parsed.data.grants ?? []),
        },
      });
      return NextResponse.json(
        { role: { ...role, updatedAt: role.updatedAt.toISOString(), createdAt: role.createdAt.toISOString() } },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
        return NextResponse.json(
          { error: 'ROLE_NAME_TAKEN', message: 'A role with this name already exists.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}
```

```ts
// frontend/src/app/api/school/roles/[id]/route.ts
// PATCH (renommage/description/grants) + DELETE d'un rôle staff.
// 404 anti-fuite quand le rôle n'appartient pas à l'école du caller.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { sanitizeGrants } from '@/lib/permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  grants: z.array(z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = verifyCsrf(req);
    if (csrf) return csrf;
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { id } = await params;
    const existing = await prisma.staffRole.findFirst({
      where: { id, schoolId: mySchool.schoolId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid role payload.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    try {
      const role = await prisma.staffRole.update({
        where: { id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
          ...(parsed.data.grants !== undefined ? { grants: sanitizeGrants(parsed.data.grants) } : {}),
        },
      });
      return NextResponse.json(
        { role: { ...role, updatedAt: role.updatedAt.toISOString(), createdAt: role.createdAt.toISOString() } },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
        return NextResponse.json(
          { error: 'ROLE_NAME_TAKEN', message: 'A role with this name already exists.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = verifyCsrf(req);
    if (csrf) return csrf;
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { id } = await params;
    const existing = await prisma.staffRole.findFirst({
      where: { id, schoolId: mySchool.schoolId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    await prisma.staffRole.delete({ where: { id } });
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Vérifier le pass** (`vitest run src/app/api/school/roles/route.test.ts`), **Step 5: Commit** — `feat(permissions): staff roles CRUD API`.

---

### Task 5: Attribution — `PATCH /api/school/members/[userId]` + `staffRoleId` dans `GET /api/school`

**Files:**
- Create: `frontend/src/app/api/school/members/[userId]/route.ts` (PATCH)
- Modify: `frontend/src/app/api/school/route.ts` — le `members.map` du GET ajoute `staffRoleId: m.staffRoleId` (le `findMany` des membres doit sélectionner `staffRoleId`)
- Modify: `frontend/src/app/(school)/settings/types.ts` — `MemberData` gagne `staffRoleId: string | null`
- Test: `frontend/src/app/api/school/members/route.test.ts`

**Interfaces:**
- Produces : `PATCH { staffRoleId: string | null }` → `{ ok: true }` ; 400 `NOT_A_MEMBER` si la cible est OWNER/ADMIN ; 404 anti-fuite si la cible n'est pas de l'école ou si le `staffRoleId` fourni n'est pas un rôle de l'école ; min-role ADMIN.

- [ ] **Step 1: Test qui échoue** (mêmes mocks que Task 4). Cas : CSRF 403 ; 404 NO_SCHOOL ; 404 caller MEMBER ; 404 cible inexistante dans l'org ; 400 `NOT_A_MEMBER` pour cible OWNER ; 404 rôle d'une autre école (`prismaMock.staffRole.findFirst` → null) ; 200 assignation (`organizationMember.update` reçoit `{ staffRoleId }`) ; 200 désassignation (`staffRoleId: null` sans lookup de rôle).
- [ ] **Step 2: Vérifier l'échec.**
- [ ] **Step 3: Implémenter** — même squelette que Task 4 (`verifyCsrf` → `requireAuth` → `resolveMySchool` + `hasMinRole('ADMIN')` sinon 404) puis :

```ts
    const { userId: targetUserId } = await params;
    const target = await prisma.organizationMember.findFirst({
      where: { organizationId: mySchool.organizationId, userId: targetUserId },
      select: { id: true, role: true },
    });
    if (!target) return notFound(ctx.requestId);
    if (target.role !== 'MEMBER') {
      return NextResponse.json(
        { error: 'NOT_A_MEMBER', message: 'Staff roles only apply to MEMBER accounts.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const parsed = z.object({ staffRoleId: z.string().nullable() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationFailed(ctx.requestId);
    if (parsed.data.staffRoleId !== null) {
      const role = await prisma.staffRole.findFirst({
        where: { id: parsed.data.staffRoleId, schoolId: mySchool.schoolId },
        select: { id: true },
      });
      if (!role) return notFound(ctx.requestId);
    }
    await prisma.organizationMember.update({
      where: { id: target.id },
      data: { staffRoleId: parsed.data.staffRoleId },
    });
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
```

(`notFound`/`validationFailed` : mêmes petits helpers locaux que Task 4.)

- [ ] **Step 4: GET /api/school** — dans le `findMany` des membres, ajouter `staffRoleId: true` au select, et `staffRoleId: m.staffRoleId` au map ; mettre à jour `MemberData`.
- [ ] **Step 5: Vérifier le pass + typecheck**, **Step 6: Commit** — `feat(permissions): member staff-role assignment API`.

---

### Task 6: Permissions dans le snapshot du shell + `usePermissions()`

**Files:**
- Modify: `frontend/src/app/api/school/billing/plan/route.ts` — les 2 réponses (`MEMBER` early-return et branche ADMIN+) ajoutent `permissions: 'ALL' | string[]`
- Modify: `frontend/src/contexts/SchoolPlanContext.tsx` — l'état et le contexte exposent `permissions: 'ALL' | string[] | null` (null = pas encore chargé)
- Create: `frontend/src/lib/usePermissions.ts`
- Test: `frontend/src/lib/usePermissions.test.ts`

**Interfaces:**
- Consumes : `hasGrant` (Task 1), `resolveGrantsFor` (Task 3), `useSchoolPlan()` (existant).
- Produces : `usePermissions(): { permissions, can(module, action), canSee(module), loaded: boolean }` — `can` renvoie `true` tant que `permissions === null` (même convention anti-flicker que `filterSectionsByRole(role=null)`).

- [ ] **Step 1: Route.** Lire la forme de `requireSchoolBilling` dans `frontend/src/lib/server/billing/route-guards.ts` pour récupérer l'id utilisateur du guard (il enveloppe requireAuth). Dans la branche MEMBER : `const grants = await resolveGrantsFor(guard.mySchool, <userIdDuGuard>);` puis `permissions: [...grants]` (un Set) ; dans la branche ADMIN+ : `permissions: 'ALL'`. Réponses finales : `{ plan, role, permissions }`.
- [ ] **Step 2: Contexte.** Dans `SchoolPlanContext.tsx` : le type de réponse du fetch gagne `permissions`, l'état la stocke, la valeur du contexte l'expose (défaut `null`). Suivre le pattern exact du champ `role` existant (mêmes endroits, même reset).
- [ ] **Step 3: Hook + test.**

```ts
// frontend/src/lib/usePermissions.ts
'use client';
// Lecture client du RBAC école — s'appuie sur le snapshot déjà chargé par
// SchoolPlanProvider (zéro requête en plus). permissions === null (encore
// en chargement) => tout est visible, même convention anti-flicker que
// filterSectionsByRole ; le serveur reste l'autorité (403 PERMISSION_DENIED).
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { hasGrant, type PermissionAction, type PermissionModuleKey } from '@/lib/permissions';

export function usePermissions() {
  const { permissions } = useSchoolPlan();
  function can(module: PermissionModuleKey, action: PermissionAction): boolean {
    if (permissions === null) return true;
    return hasGrant(permissions, module, action);
  }
  return {
    permissions,
    loaded: permissions !== null,
    can,
    canSee: (module: PermissionModuleKey) => can(module, 'view'),
  };
}
```

Test (`usePermissions.test.ts`, jsdom + `renderHook` de `@testing-library/react` si présent, sinon test direct de la logique extraite) : `null` → can=true ; `'ALL'` → true ; `['eleves.view']` → canSee('eleves')=true, can('eleves','edit')=false.

- [ ] **Step 4: gate + commit** — `feat(permissions): expose grants through the shell plan snapshot`.

---

### Task 7: i18n — namespace `permissions`

**Files:**
- Create: `frontend/src/messages/fr/permissions.json`, `frontend/src/messages/en/permissions.json`, `frontend/src/messages/ht/permissions.json`
- Modify: `frontend/src/lib/locales.ts` (`MESSAGE_NAMESPACES` + `'permissions'`), `frontend/src/i18n/request.ts` (import + entrée `Permissions`), `frontend/src/types/next-intl.d.ts` (même clé)

Contenu fr (en/ht : mêmes clés, traduites — en anglais standard ; ht best-effort avec `_review` en première clé comme les autres fichiers ht) :

```json
{
  "title": "Gestion des permissions",
  "subtitle": "Définissez les droits d'accès par rôle pour chaque module de l'application.",
  "rolesLabel": "Rôles",
  "newRole": "Nouveau rôle",
  "duplicateRole": "Dupliquer le rôle",
  "duplicateSuffix": "(copie)",
  "systemBadge": "Système",
  "usersCount": { "one": "{count} utilisateur", "other": "{count} utilisateurs" },
  "note": { "title": "Note", "body": "Les modifications s'appliquent immédiatement aux utilisateurs ayant ce rôle." },
  "systemRoleHint": "Rôle système : accès complet, non modifiable.",
  "ownerRole": "Propriétaire",
  "adminRole": "Administrateur",
  "modifiedOn": "Modifié le {date}",
  "edit": "Modifier",
  "delete": "Supprimer",
  "matrix": { "module": "Module", "view": "Voir", "create": "Créer", "editAction": "Modifier", "deleteAction": "Supprimer", "export": "Exporter" },
  "sections": { "general": "Général", "academic": "Académique", "finance": "Finance", "config": "Configuration" },
  "modules": {
    "dashboard": { "label": "Tableau de bord", "sub": "Accueil & Vue d'ensemble" },
    "eleves": { "label": "Élèves", "sub": "Dossiers & Inscriptions" },
    "enseignants": { "label": "Enseignants", "sub": "Personnel & Affectations" },
    "notes": { "label": "Notes & Bulletins", "sub": "Évaluations & Résultats" },
    "appreciations": { "label": "Appréciations", "sub": "Commentaires de bulletin" },
    "presences": { "label": "Présences", "sub": "Absences & Retards" },
    "emploiDuTemps": { "label": "Emploi du temps", "sub": "Planning & Séances" },
    "paiements": { "label": "Paiements", "sub": "Frais & Encaissements" },
    "configuration": { "label": "Configuration", "sub": "Classes, matières, salles" },
    "parametres": { "label": "Paramètres établissement", "sub": "Année scolaire & Périodes" }
  },
  "footer": { "meta": "Rôle : {name} · {count} utilisateurs concernés · Dernière mise à jour le {date}", "deleteRole": "Supprimer ce rôle", "cancel": "Annuler", "save": "Enregistrer" },
  "toasts": { "saved": "Permissions enregistrées.", "created": "Rôle créé. Configurez maintenant ses permissions.", "updated": "Rôle mis à jour.", "deleted": "Rôle supprimé.", "duplicated": "Rôle dupliqué." },
  "deleteConfirm": { "one": "Supprimer le rôle « {name} » ? {count} utilisateur perdra tout accès jusqu'à l'attribution d'un nouveau rôle.", "other": "Supprimer le rôle « {name} » ? {count} utilisateurs perdront tout accès jusqu'à l'attribution d'un nouveau rôle.", "zero": "Supprimer le rôle « {name} » ? Aucun utilisateur ne l'utilise actuellement." },
  "unsaved": "Modifications non enregistrées",
  "unsavedSwitchConfirm": "Des modifications ne sont pas enregistrées. Changer de rôle sans enregistrer ?",
  "emptyRoles": "Aucun rôle personnalisé pour l'instant. Créez le premier pour déléguer des accès.",
  "loadError": "Impossible de charger les rôles.",
  "form": {
    "createTitle": "Créer un nouveau rôle",
    "editTitle": "Modifier le rôle",
    "createSubtitle": "Définissez d'abord les informations de base du rôle. Les permissions détaillées se configurent dans la matrice après l'enregistrement.",
    "badgeNew": "Nouveau rôle",
    "badgeStep": "Étape 1/2",
    "nameLabel": "Nom du rôle",
    "nameHint": "Exemples : Comptable, Surveillant, Secrétaire.",
    "descriptionLabel": "Description",
    "descriptionPlaceholder": "Décrivez brièvement l'usage de ce rôle dans l'établissement.",
    "descriptionHint": "Optionnel. Vous pourrez configurer les permissions dans l'écran suivant.",
    "previewTitle": "Aperçu du rôle",
    "previewBody": "Le rôle sera créé immédiatement puis complété avec ses permissions détaillées.",
    "previewBadgePending": "Permissions à définir plus tard",
    "previewBadgeActive": "Actif",
    "footerNote": "La gestion des permissions se fait dans la matrice après la création du rôle.",
    "cancel": "Annuler",
    "submitCreate": "Créer le rôle",
    "submitEdit": "Enregistrer",
    "nameTaken": "Un rôle porte déjà ce nom.",
    "nameRequired": "Le nom du rôle est requis."
  },
  "accessDenied": { "title": "Accès non autorisé", "body": "Votre rôle ne permet pas d'accéder à cette page. Contactez un administrateur de l'établissement si vous pensez qu'il s'agit d'une erreur." },
  "adminsTab": { "roleColumn": "Rôle", "fullAccess": "Accès complet", "noRole": "Aucun rôle (aucun accès)", "roleUpdated": "Rôle mis à jour.", "manageLink": "Gérer les rôles et permissions" }
}
```

- [ ] **Step 1: fr, en, ht + enregistrement** dans les 3 fichiers de registre. **Step 2:** `pnpm --filter frontend exec vitest run src/lib/locales.test.ts` → PASS. **Step 3: Commit** — `feat(i18n): permissions namespace (fr/en/ht)`.

---

### Task 8: `RoleFormModal` (créer / modifier un rôle)

**Files:**
- Create: `frontend/src/app/(school)/settings/permissions/RoleFormModal.tsx`

**Interfaces:**
- Consumes : `Modal`, `Button`, `Badge` (`@/components/ui/`), `api`/`ApiError` (`@/lib/api`), `useToast`, namespace `permissions.form`.
- Produces : `<RoleFormModal mode="create" onSaved={(role) => …} onClose={…} />` et `mode="edit"` avec `role={{ id, name, description }}` ; `onSaved` reçoit le rôle renvoyé par l'API (`{ id, name, description, grants, … }`).

- [ ] **Step 1: Implémenter** selon `.planning/banani/create-role.md` : header (icône `Briefcase` 44px fond `bg-secondary` `text-primary`, badges `form.badgeNew`/`form.badgeStep` en mode create seulement, titre, sous-titre), panneau formulaire (input nom requis + hint ; textarea description + hint), carte aperçu (`ShieldUser`/`Shield` lucide, badges) en mode create seulement, footer (note `ShieldCheck` + Annuler/`form.submitCreate|submitEdit`). Soumission : `api('/api/school/roles', { method: 'POST', body })` ou `PATCH /api/school/roles/{id}` ; `ApiError.code === 'ROLE_NAME_TAKEN'` → erreur inline `form.nameTaken` sous le champ nom ; nom vide → `form.nameRequired` sans appel réseau. Mobile-first : le `Modal` existant gère le plein écran ; footer en `flex-wrap`.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → PASS. **Step 3: Commit** — `feat(permissions): role create/edit modal`.

---

### Task 9: Composants matrice — `RolesPanel`, `RoleSummaryCard`, `PermissionMatrix`

**Files:**
- Create: `frontend/src/app/(school)/settings/permissions/permission-icons.ts` — map `icon`(string du registre) → composant lucide : `{ 'layout-dashboard': LayoutDashboard, users: Users, 'user-check': UserCheck, 'notebook-pen': NotebookPen, 'message-square-text': MessageSquareText, 'calendar-check': CalendarCheck, 'calendar-days': CalendarDays, wallet: Wallet, 'settings-2': Settings2, 'sliders-horizontal': SlidersHorizontal }`
- Create: `frontend/src/app/(school)/settings/permissions/RolesPanel.tsx`
- Create: `frontend/src/app/(school)/settings/permissions/RoleSummaryCard.tsx`
- Create: `frontend/src/app/(school)/settings/permissions/PermissionMatrix.tsx`

**Interfaces:**
- `RolesPanel` props : `{ roles: RoleRow[], systemCounts: { owners: number; admins: number }, selectedId: string, onSelect(id: string): void, onAddRole(): void }` où `RoleRow = { id, name, memberCount }` ; ids système sentinelles exportées : `SYSTEM_OWNER_ID = '__owner__'`, `SYSTEM_ADMIN_ID = '__admin__'`. Desktop : colonne 240px (cartes 34px + compteur pill, active = `bg-secondary` + `text-primary`, note info en bas) ; mobile (`lg:hidden`) : `FilterSelect` pleine largeur.
- `RoleSummaryCard` props : `{ name, description, memberCount, updatedAt, readOnly, onEdit(), onDelete() }` — icône 42px `bg-secondary`, badge utilisateurs, date via `Intl.DateTimeFormat(bcp47)`, boutons masqués si `readOnly` (remplacés par `systemRoleHint`).
- `PermissionMatrix` props : `{ grants: ReadonlySet<string>, readOnly: boolean, onToggle(grant: string, next: boolean): void }` — table pilotée par `PERMISSION_MODULES` groupés par `section` (ordre : general, academic, finance, config), thead 5 colonnes d'action (icônes `Eye/PlusCircle/Pencil/Trash2/Download` + labels `matrix.*`), lignes de section uppercase, pastille module (`dotBg`/`dotFg` en style inline — couleurs de données), `Switch` par cellule applicable, cellule vide sinon ; conteneur `TABLE_SCROLL` + `STICKY_THEAD` (`min-w-[560px]`).

- [ ] **Step 1: Implémenter les 4 fichiers.** Suivre `.planning/banani/permission-manager.md` (structure, mesures, tokens). Réutiliser le composant `Switch` de l'app (mêmes props que dans `AnneeScolaireTab` : `checked`, `onChange`, `label` — passer un label accessible « {module} · {action} »).
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → PASS. **Step 3: Commit** — `feat(permissions): roles panel, summary card and permission matrix components`.

---

### Task 10: Page `/settings/permissions`

**Files:**
- Create: `frontend/src/app/(school)/settings/permissions/page.tsx`

**Interfaces:**
- Consumes : Tasks 4, 6, 8, 9. Gate : `useSchoolPlan().role` — si `role !== null && role === 'MEMBER'`, rendre l'état `accessDenied` du namespace (pas de redirect) ; le serveur refuse déjà (403).

- [ ] **Step 1: Implémenter.** Client page (`'use client'`). Données : `useApi<RolesResponse>('/api/school/roles')`. État local : `selectedId` (défaut : premier rôle personnalisé, sinon `SYSTEM_OWNER_ID`), `draftGrants: Set<string>` (initialisé aux grants du rôle sélectionné, réinitialisé à chaque sélection), `dirty` (draft ≠ grants du rôle). Layout : header (titre/sous-titre + boutons Dupliquer/Nouveau rôle) ; `lg:flex` panneau + détails ; rôles système → `RoleSummaryCard readOnly` + `PermissionMatrix readOnly grants={new Set(allGrants())}` ; rôle personnalisé → matrice éditable ; footer bar (méta `footer.meta`, Supprimer via `useConfirm()` + `deleteConfirm.{zero|one|other}` selon memberCount, Annuler (reset draft), Enregistrer → `PATCH /api/school/roles/{id}` `{ grants: [...draftGrants] }` → toast `toasts.saved` + refetch). Garde anti-perte : changer de rôle avec `dirty` → `confirm(unsavedSwitchConfirm)`. « Nouveau rôle » / « + » → `RoleFormModal mode="create"`, `onSaved` → refetch + sélection du nouveau rôle + toast `toasts.created`. « Dupliquer » (désactivé sur rôle système) → `POST /api/school/roles` `{ name: name + ' ' + duplicateSuffix, description, grants: [...] }` → sélection + toast. Modifier → `RoleFormModal mode="edit"`. États : skeletons, `loadError`, `emptyRoles` (si 0 rôles personnalisés, bandeau sous le header). Breadcrumb/topbar : automatiques via le shell.
- [ ] **Step 2: Vérification navigateur** (dev server) : 375px (panneau→select, matrice scrollable sans scroll horizontal de page), 768px, 1280px (fidèle au mock). **Step 3:** gate complet + **Commit** — `feat(permissions): permission manager screen`.

---

### Task 11: Onglet Administrateurs — colonne « Rôle » + lien

**Files:**
- Modify: `frontend/src/app/(school)/settings/AdministrateursTab.tsx`
- Modify: `frontend/src/app/(school)/settings/page.tsx` (passer `myRole` au tab s'il ne l'a pas déjà)
- Modify: `frontend/src/messages/{fr,en,ht}/settings.json` si le titre de l'onglet doit mentionner les rôles — sinon aucun changement settings.json (les nouvelles clés vivent dans `permissions.adminsTab`)

- [ ] **Step 1: Implémenter.** Le tab reçoit `members` (avec `staffRoleId` depuis Task 5). Charger les rôles via `useApi('/api/school/roles')` (seulement si `myRole` ADMIN+). Colonne « Rôle » (`adminsTab.roleColumn`) : OWNER/ADMIN → texte `adminsTab.fullAccess` ; MEMBER → `FilterSelect` (options : `adminsTab.noRole` + chaque rôle) → `api(\`/api/school/members/${userId}\`, { method: 'PATCH', body: { staffRoleId } })` → toast `adminsTab.roleUpdated`. Sous le tableau : lien `adminsTab.manageLink` → `/settings/permissions` (visible ADMIN+).
- [ ] **Step 2:** gate + **Commit** — `feat(permissions): staff-role column in the Administrateurs tab`.

---

### Task 12: Enforcement serveur — bascule de toutes les routes school + tripwire

**Files:**
- Modify: tous les `route.ts` du tableau ci-dessous
- Create: `frontend/src/lib/server/observability/school-permission-enforcement.test.ts` (tripwire)
- Create: `frontend/src/app/api/school/students/route.test.ts` (famille témoin)

**Pattern mécanique** (à appliquer par handler) — avant :

```ts
const mySchool = await resolveMySchool(auth.user.sub);
if (!mySchool) {
  return NextResponse.json({ error: 'NO_SCHOOL', ... }, { status: 404, ... });
}
```

après :

```ts
const perm = await requireSchoolPermission(auth.user.sub, '<module>', '<action>', ctx.requestId);
if (!perm.ok) return perm.response;
const mySchool = perm.mySchool;
```

(import : `import { requireSchoolPermission } from '@/lib/server/school-permissions';` ; retirer `resolveMySchool` de l'import s'il n'est plus utilisé ; **conserver** les `hasMinRole(...)` existants — ils s'additionnent.)

**Mapping exhaustif** (module, action par handler ; GET→view, POST→create, PATCH/PUT→edit, DELETE→delete sauf mention) :

| Fichier route | Handlers → (module, action) |
|---|---|
| `students/route.ts` | GET→(eleves,view) POST→(eleves,create) |
| `students/[id]/route.ts` | GET→(eleves,view) PATCH→(eleves,edit) DELETE→(eleves,delete) |
| `students/[id]/invite/route.ts` | POST→(eleves,edit) |
| `students/[id]/results/route.ts` | GET→(notes,view) |
| `students/[id]/goals/route.ts` | GET→(notes,view) PUT→(notes,edit) |
| `students/[id]/bulletin/route.ts` + `bulletin/pdf/route.ts` + `bulletins/route.ts` | GET→(notes,view) |
| `students/[id]/appreciations/route.ts` | GET→(appreciations,view) PUT→(appreciations,edit) DELETE→(appreciations,delete) |
| `students/[id]/attendance/route.ts` | GET→(presences,view) |
| `teachers/route.ts` | GET→(enseignants,view) POST→(enseignants,create) |
| `teachers/[id]/route.ts` | GET→(enseignants,view) PATCH→(enseignants,edit) DELETE→(enseignants,delete) |
| `teachers/[id]/invite/route.ts` + `send-whatsapp/route.ts` | POST→(enseignants,edit) |
| `evaluations/route.ts` | GET→(notes,view) POST→(notes,create) |
| `evaluations/[id]/route.ts` | GET→(notes,view) PATCH→(notes,edit) DELETE→(notes,delete) |
| `evaluations/[id]/grades/route.ts` | PUT→(notes,edit) |
| `bulletin-templates/route.ts` | GET→(notes,view) |
| `bulletin-templates/[id]/route.ts` | GET→(notes,view) PATCH→(notes,edit) DELETE→(notes,delete) |
| `bulletin-templates/[id]/fork/route.ts` + `preview-pdf/route.ts` | POST→(notes,create) / POST→(notes,view) |
| `classes/[id]/bulletins/route.ts` + `classes/[id]/notebook/route.ts` | GET→(notes,view) |
| `classes/[id]/appreciations/route.ts` | GET→(appreciations,view) |
| `class-subjects/[id]/notebook/route.ts` | GET→(notes,view) |
| `attendance/route.ts` | GET→(presences,view) PATCH→(presences,edit) DELETE→(presences,delete) |
| `attendance/stats/route.ts` | GET→(presences,view) |
| `timetable/route.ts` | POST→(emploiDuTemps,create) ; **GET : cas spécial ci-dessous** |
| `timetable/[id]/route.ts` | PATCH→(emploiDuTemps,edit) DELETE→(emploiDuTemps,delete) |
| `fees/overview/route.ts`, `fees/overdue/route.ts`, `fees/structures/route.ts`, `fees/structures/[classId]/route.ts` GET, `fees/students/[id]/history/route.ts`, `fees/automation-settings/route.ts` GET | GET→(paiements,view) |
| `fees/payments/route.ts`, `fees/disputes/route.ts`, `fees/structures/[classId]/copy-from/route.ts`, `fees/students/[id]/send-whatsapp/route.ts` | POST→(paiements,create) |
| `fees/disputes/[id]/route.ts`, `fees/automation-settings/route.ts` PATCH, `fees/structures/[classId]/route.ts` PUT | PATCH/PUT→(paiements,edit) |
| `classes/route.ts`, `classes/[id]/route.ts`, `class-subjects/route.ts`, `class-subjects/[id]/route.ts`, `grade-levels/*`, `rooms/*`, `subjects/*` (chapters inclus) | (configuration, selon méthode) — `grade-levels/reorder` POST→(configuration,edit), `subjects/[id]/chapters/reorder` PUT→(configuration,edit) |
| `academic-year/route.ts`, `academic-year-rollover/route.ts` (+ `confirm`), `terms/route.ts`, `terms/[id]/route.ts`, `reset-year/route.ts` | (parametres, selon méthode ; `reset-year` POST→(parametres,delete) ; rollover GET→view, POST/confirm→create, PATCH→edit, DELETE→delete) |
| `dashboard/route.ts`, `activity/route.ts` | GET→(dashboard,view) |
| **Liste blanche (ne pas toucher)** | `route.ts` (bootstrap GET/PUT/DELETE — PUT passe à (parametres,edit), DELETE reste OWNER-only tel quel, GET whitelisted), `billing/*`, `export/route.ts`, `roles/*`, `members/*` |

Correction : `route.ts` (le bootstrap) — SEUL le PUT bascule sur `(parametres, edit)` ; GET et DELETE restent tels quels.

**Cas spécial `GET /api/school/timetable`** : il utilise `resolveMySchoolIncludingTeacher` + scoping enseignant. Ne pas remplacer le résolveur. Après le scoping existant, ajouter : si le caller n'est **pas** teacher-linked (`resolveMyTeacherProfile` → null) et `mySchool.role === 'MEMBER'`, vérifier `emploiDuTemps.view` via `resolveGrantsFor(mySchool, auth.user.sub)` + `hasGrant`, sinon 403 `PERMISSION_DENIED`. Les enseignants liés gardent leur accès scopé intact.

- [ ] **Step 1: Tripwire d'abord** :

```ts
// frontend/src/lib/server/observability/school-permission-enforcement.test.ts
// RBAC-01 — toute route /api/school/* doit passer par requireSchoolPermission
// (ou être en liste blanche explicite). Miroir de runtime-enforcement.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', 'app', 'api', 'school');
const WHITELIST = [
  'route.ts', // bootstrap GET/DELETE (PUT utilise requireSchoolPermission)
  'billing/', 'export/route.ts', 'roles/', 'members/',
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
```

- [ ] **Step 2: Vérifier l'échec** (toutes les routes sont offenders). **Step 3:** appliquer le pattern à chaque fichier du tableau, par groupes (un commit par groupe) : (a) students+teachers, (b) notes+appreciations+presences, (c) timetable (avec le cas spécial), (d) fees, (e) configuration+parametres+dashboard. Après chaque groupe : `pnpm test` (les tests existants de ces routes moquent `resolveMySchool` — les adapter en moquant `@/lib/server/school-permissions` de la même façon : `vi.mock('@/lib/server/school-permissions', ...)` avec `requireSchoolPermission` renvoyant `{ ok: true, mySchool }` par défaut).
- [ ] **Step 4: Famille témoin** — créer `students/route.test.ts` : MEMBER sans grant → 403 `PERMISSION_DENIED` (mock réel de la logique : moquer school.ts, pas school-permissions), MEMBER avec `eleves.view` → 200, OWNER → 200. **Step 5:** tripwire PASS + gate complet. **Step 6: Commit final** — `feat(permissions): enforce staff grants across school API routes`.

---

### Task 13: Filtrage client — sidebar, garde de pages, boutons

**Files:**
- Modify: `frontend/src/components/layout/sidebar/types.ts` — `NavItem` + `module?: PermissionModuleKey` ; nouvelle fonction `filterSectionsByPermissions(sections, permissions: 'ALL' | string[] | null)` (null → tout garder ; item sans `module` → toujours gardé ; sinon `hasGrant(permissions, module, 'view')` ; sections vides supprimées)
- Modify: `frontend/src/components/layout/SchoolSidebar.tsx` — annoter chaque item (`dashboard`→dashboard, `eleves`→eleves, `enseignants`→enseignants, timetable→emploiDuTemps, attendance→presences, gradebook→notes, reportCards→notes, assessments→appreciations, tuition→paiements, les 5 items configuration→configuration ; `Abonnement`/`Paramètres` : pas de module) ; appliquer `filterSectionsByPermissions(filterSectionsByRole(sections, role), permissions)`
- Create: `frontend/src/components/ui/AccessDenied.tsx` — carte centrée (icône `ShieldAlert`, `permissions.accessDenied.title/body`)
- Modify: les pages top-level par module (garde `canSee`) : `dashboard/page.tsx` + `dashboard/activites/page.tsx` (dashboard), `eleves/page.tsx` + `eleves/[id]/page.tsx` (eleves), `enseignants/page.tsx` + `[id]` (enseignants), `pedagogie/carnet-de-notes/page.tsx` (notes), `bulletins/page.tsx` (notes), `pedagogie/appreciations/page.tsx` (appreciations), `pedagogie/presences/page.tsx` (presences), `pedagogie/emploi-du-temps/page.tsx` (emploiDuTemps), `scolarite/page.tsx` + `paiements` + `relances` + `configuration` (paiements), `configuration/{classes,matieres,niveaux,salles,modele-bulletin,affectations,coefficients}/page.tsx` (configuration)
- Test: Modify `frontend/src/components/layout/sidebar/role-filter.test.ts` (ou fichier voisin `permission-filter.test.ts`)

- [ ] **Step 1: Test qui échoue** (`permission-filter.test.ts`) : null → inchangé ; 'ALL' → inchangé ; `['eleves.view']` → seuls les items sans module + eleves restent ; sections vides retirées.
- [ ] **Step 2: Implémenter types.ts + sidebar.** **Step 3: `AccessDenied` + garde de pages** — pattern par page (2 lignes + un early return juste après les hooks) :

```tsx
const { canSee } = usePermissions();
if (!canSee('eleves')) return <AccessDenied />;
```

- [ ] **Step 4: Boutons des écrans de liste** — sur chaque page de liste ci-dessus, conditionner le bouton principal de création (`can(module,'create')`) et le bouton Exporter (`can(module,'export')`). Ne pas descendre dans les menus par-ligne en v1 (le serveur refuse déjà ; noté comme suite possible).
- [ ] **Step 5:** gate + vérification navigateur (compte MEMBER avec un rôle « eleves.view seul » : sidebar réduite, URL directe → Accès non autorisé, bouton Ajouter masqué). **Step 6: Commit** — `feat(permissions): permission-aware sidebar, page guards and action buttons`.

---

### Task 14: Documentation, STATUS, vérification finale

**Files:**
- Modify: `CLAUDE.md` (racine) — dans « High-level architecture », court paragraphe : registre `lib/permissions.ts`, `StaffRole`, `requireSchoolPermission` obligatoire pour toute nouvelle route `/api/school/*` (tripwire RBAC-01), permissions livrées par le snapshot billing/plan, écrans sous `/settings/permissions`.
- Modify: `.planning/banani/STATUS.md` — passer `permission-manager` et `create-role` en Done (avec commits).
- Modify: `docs/superpowers/specs/2026-09-01-permission-manager-design.md` — statut « implémenté ».

- [ ] **Step 1: Docs.** **Step 2: Gate complet** `pnpm format && pnpm lint && pnpm typecheck && pnpm test`. **Step 3: E2E manuel** (dev server, compte seedé) : créer un rôle Comptable (paiements.\* + dashboard.view), l'assigner à un MEMBER, se connecter avec ce compte → sidebar réduite à Tableau de bord + Scolarité, URL directe `/eleves` → Accès non autorisé, appel API direct → 403. **Step 4: Commit** — `docs: permission manager shipped`.

---

## Self-review (fait à la rédaction)

- **Couverture spec** : §3→T2, §4→T1, §5→T3+T12, §6→T6+T13, §7.1→T9+T10, §7.2→T8, §7.3→T11, §8→T4+T5, §9→T7, §10→tests de chaque task + tripwire T12, §11→T2+T14. Pas d'écart détecté.
- **Types cohérents** : `requireSchoolPermission(userId, module, action, requestId)` identique T3/T12 ; `RoleRow`/sentinelles T9↔T10 ; `permissions: 'ALL' | string[] | null` T6↔T13.
- **Placeholders** : aucun TBD ; le squelette commenté de T4 Step 1 est accompagné de l'instruction explicite d'écrire les 11 cas complets sur le modèle nommé (`grade-levels/route.test.ts`).
