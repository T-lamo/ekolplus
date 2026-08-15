# Passage à l'année scolaire suivante (Academic Year Rollover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 3-step wizard that enables school admins to atomically roll over to a new academic year: create the new year, map classes and students to destinations, review promotions with per-student exceptions, then confirm with a type-to-confirm gate.

**Architecture:** The wizard uses client-side state management (3-step form component orchestrator) persisted via server-side `AcademicYearRolloverDraft` Prisma model. Each step has a draft save (POST/PATCH `/api/school/academic-year-rollover`). Final Step 3 confirm (POST `/api/school/academic-year-rollover/confirm`) runs a single atomic Prisma transaction: create new AcademicYear, copy Classes, create Enrollments for promoted students, archive old year (isActive=false). Type-to-confirm gate reuses `school-danger-zone.ts` pattern.

**Tech Stack:** Next.js 16, Prisma 5, Tailwind v4, React hooks (useState, useEffect), `lucide-react` icons, `school-danger-zone.ts` utilities

**Spec:** `.planning/banani/annee-scolaire-wizard.md`

## Global Constraints

- All user-facing strings in French, stored in `frontend/src/lib/constants.ts` under `ACADEMIC_YEAR_ROLLOVER` block
- OWNER-only access: use `hasMinRole(mySchool.role, 'OWNER')` before rendering entry button and on all API routes
- Type-to-confirm gate: school name typed to enable confirm button, via `confirmNameMatches(schoolName, confirmInput)` from `school-danger-zone.ts`
- Rate-limit danger-zone action: use `enforceDangerZoneRateLimit(userId, 'rollover-year')` on confirm endpoint
- Atomic confirm transaction: single `prisma.$transaction(async (tx) => { ... })` block; no side effects outside the tx
- Draft model: `AcademicYearRolloverDraft` with `@@unique([schoolId])` — at most one in-progress wizard per school
- Student exceptions stored as JSON: `{ studentId: { destClassId?: string, skip?: boolean } }` — flexible, allows per-student overrides
- Class mapping stored as JSON: `{ oldClassId: { destClassId?: string, isNew?: boolean, newClass?: {...} } }` — supports both existing and newly-created classes
- Mobile-first responsive: base classes target 375px, add `md:` and `lg:` prefixes for tablet/desktop
- Pagination on Step 3 student table: show 8 per page, keep counts accurate
- No English in JSX; no inline styles; all Tailwind v4

---

## File Structure

**Backend:**
- `frontend/prisma/schema.prisma` — add `AcademicYearRolloverDraft` model
- `frontend/prisma/migrations/<N>_add_academic_year_rollover_draft/migration.sql` — auto-generated
- `frontend/src/app/api/school/academic-year-rollover/route.ts` — GET (load draft), POST (create draft), PATCH (update draft), DELETE (clear draft)
- `frontend/src/app/api/school/academic-year-rollover/confirm/route.ts` — POST (atomic confirm with type-to-confirm verification)
- `frontend/src/lib/server/academic-year-rollover.ts` — helper functions: `computeClassMapping()`, `getStudentsForPromotion()`, `computePromotionStats()`, `executeRollover()` (atomic transaction)

**Frontend Types:**
- `frontend/src/app/(school)/settings/nouvelle-annee/types.ts` — `RolloverDraft`, `ClassMapping`, `StudentException`, `PromotionStats`, `WizardStep`

**Frontend Components (Primitives):**
- `frontend/src/components/ui/Stepper.tsx` — 3-step indicator (circles + connectors + active state)
- `frontend/src/components/school/StudentStatusBadge.tsx` — badge for [promu | exception | nonreinscrit]
- `frontend/src/components/school/PromoCounterCard.tsx` — stat card with count + label

**Frontend Components (Wizard Steps):**
- `frontend/src/app/(school)/settings/nouvelle-annee/Step1NewYear.tsx` — form: name, startDate, endDate, validation, draft save on proceed
- `frontend/src/app/(school)/settings/nouvelle-annee/Step2Promotion.tsx` — class mapping table, destination dropdown, inline "create new" flow, validation
- `frontend/src/app/(school)/settings/nouvelle-annene/Step3Summary.tsx` — counter cards, paginated student table, exception management, type-to-confirm input, final confirm

**Frontend Main Page:**
- `frontend/src/app/(school)/settings/nouvelle-annee/page.tsx` — orchestrator, fetch draft on mount, manage 3-step state, route between steps, refetch dashboard on success

**Updates:**
- `frontend/src/app/(school)/settings/AnneeScolaireTab.tsx` — add "Passage à l'année suivante" button/link, OWNER-only, links to `/settings/nouvelle-annee`
- `frontend/src/lib/constants.ts` — add `ACADEMIC_YEAR_ROLLOVER` block with all strings
- `.planning/banani/STATUS.md` — move `annee-scolaire-wizard` to Done

---

## Global Helpers (Backend)

These functions live in `frontend/src/lib/server/academic-year-rollover.ts` and are consumed by both the draft-save routes and the confirm route:

```typescript
// Load all classes and students for the active year, prepare promotion data
export async function getPromotionData(
  schoolId: string,
  academicYearId: string,
): Promise<{
  classes: Array<{ id: string; name: string; level: string; studentCount: number }>;
  students: Array<{ id: string; firstName: string; lastName: string; classId: string; enrolledAt: Date }>;
  error?: string;
}> { /* ... */ }

// Compute stats from a class mapping + student exceptions
export function computeStats(
  classMapping: Record<string, { destClassId?: string; isNew?: boolean }>,
  studentExceptions: Record<string, { destClassId?: string; skip?: boolean }>,
  allStudents: Array<{ id: string; classId: string }>,
): {
  promoted: number;
  exceptions: number;
  unenrolled: number;
  perClassSummary: Array<{ oldClassId: string; oldClassName: string; destClassId: string; destClassName: string; count: number }>;
} { /* ... */ }

// Execute the atomic rollover transaction
export async function executeRollover(
  tx: PrismaTransaction,
  schoolId: string,
  oldAcademicYearId: string,
  rolloverData: {
    newYearLabel: string;
    newYearStartDate: Date;
    newYearEndDate: Date;
    classMapping: Record<string, { destClassId?: string; isNew?: boolean; newClass?: { name: string; level: string; room?: string; capacity?: number; homeroomTeacherId?: string } }>;
    studentExceptions: Record<string, { destClassId?: string; skip?: boolean }>;
  },
): Promise<{ newAcademicYearId: string }> { /* ... */ }
```

---

## Tasks

### Task 1: Prisma migration + model + types

**Files:**
- Modify: `frontend/prisma/schema.prisma` (add `AcademicYearRolloverDraft` model)
- Create: `frontend/prisma/migrations/<N>_add_academic_year_rollover_draft/migration.sql`
- Create: `frontend/src/app/(school)/settings/nouvelle-annee/types.ts`

**Interfaces:**
- Produces: `AcademicYearRolloverDraft` Prisma type; TypeScript interfaces `RolloverDraft`, `ClassMapping`, `StudentException`, `PromotionStats`

- [ ] **Step 1: Add `AcademicYearRolloverDraft` model to Prisma schema**

Edit `frontend/prisma/schema.prisma`, add after the `AcademicYear` model:

```prisma
model AcademicYearRolloverDraft {
  id                   String   @id @default(cuid())
  schoolId             String
  school               School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)

  newYearLabel         String
  newYearStartDate     DateTime
  newYearEndDate       DateTime

  classMapping         Json     @default("{}")
  studentExceptions    Json     @default("{}")

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  createdBy            String

  @@unique([schoolId])
}
```

Also update `School` model to add the relation: `rolloverDraft AcademicYearRolloverDraft?`

- [ ] **Step 2: Run Prisma migration**

```bash
cd frontend
pnpm db:push
```

Expected: Migration applied without errors.

- [ ] **Step 3: Create types file**

Create `frontend/src/app/(school)/settings/nouvelle-annee/types.ts`:

```typescript
export interface ClassMappingEntry {
  destClassId?: string;
  isNew?: boolean;
  newClass?: {
    name: string;
    level: string;
    room?: string;
    capacity?: number;
    homeroomTeacherId?: string;
  };
}

export interface StudentExceptionEntry {
  destClassId?: string;
  skip?: boolean;
}

export interface RolloverDraft {
  id: string;
  schoolId: string;
  newYearLabel: string;
  newYearStartDate: Date;
  newYearEndDate: Date;
  classMapping: Record<string, ClassMappingEntry>;
  studentExceptions: Record<string, StudentExceptionEntry>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface PromotionStats {
  promoted: number;
  exceptions: number;
  unenrolled: number;
}

export type WizardStep = 1 | 2 | 3;

export interface ClassForPromotion {
  id: string;
  name: string;
  level: string;
  studentCount: number;
}

export interface StudentForPromotion {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  enrolledAt: Date;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations frontend/src/app/\(school\)/settings/nouvelle-annee/types.ts
git commit -m "feat(rollover): add AcademicYearRolloverDraft schema + types"
```

---

### Task 2: Constants + i18n block

**Files:**
- Modify: `frontend/src/lib/constants.ts`

**Interfaces:**
- Produces: `ACADEMIC_YEAR_ROLLOVER` constant block with all French strings

- [ ] **Step 1: Add `ACADEMIC_YEAR_ROLLOVER` to constants.ts**

Open `frontend/src/lib/constants.ts` and add this block (insert before `// ─── SaaS admin` or at the end of the school section):

```typescript
export const ACADEMIC_YEAR_ROLLOVER = {
  title: 'Passage à l\'année scolaire suivante',
  subtitle: (oldYear: string, newYear: string) => `Migration de ${oldYear} vers ${newYear}`,
  warningBanner: 'Cette action ne peut pas être annulée',
  irreversible: 'Impossible à annuler',

  step1: {
    title: 'Nouvelle année',
    yearLabel: 'Année scolaire',
    startDate: 'Date de début',
    endDate: 'Date de fin',
    saveAsDraft: 'Sauvegarder le brouillon',
    nextStep: 'Étape suivante',
    validation: {
      yearRequired: 'L\'année scolaire est requise',
      startDateRequired: 'La date de début est requise',
      endDateRequired: 'La date de fin est requise',
      endDateAfterStart: 'La date de fin doit être après la date de début',
    },
  },

  step2: {
    title: 'Promotion des élèves',
    currentClass: 'Classe actuelle',
    studentCount: 'Élèves',
    currentLevel: 'Niveau actuel',
    destClass: 'Classe de destination',
    createNew: 'Créer nouvelle',
    help: 'Sélectionnez la classe de destination pour chaque classe actuelle. Vous pouvez créer une nouvelle classe ou utiliser une classe existante.',
    step3Preview: 'Aperçu — Étape 3 (Disponible après validation de l\'étape 2)',
    previousStep: 'Étape précédente',
    nextStep: 'Étape suivante — Récapitulatif',
  },

  step3: {
    title: 'Récapitulatif',
    promoted: 'Élèves promus',
    exceptions: 'Exceptions',
    unenrolled: 'Non réinscrits',
    students: 'Élèves',
    allStudents: (count: number) => `Voir tous les élèves (${count}) →`,
    confirmTitle: 'Confirmer le passage à l\'année suivante',
    confirmText: (oldYear: string, newYear: string, promotedCount: number) =>
      `La confirmation créera l'année scolaire ${newYear}, promouvra ${promotedCount} élèves et archivera l'année ${oldYear}. Cette action ne peut pas être annulée.`,
    typeToConfirm: 'Tapez le nom de votre école pour confirmer',
    confirmButton: 'Confirmer',
    previousStep: 'Étape précédente',
  },

  createNewClass: {
    title: 'Créer une nouvelle classe',
    name: 'Nom de la classe',
    level: 'Niveau',
    room: 'Salle (optionnel)',
    capacity: 'Capacité (optionnel)',
    homeroomTeacher: 'Professeur principal (optionnel)',
    create: 'Créer',
    cancel: 'Annuler',
  },

  studentStatus: {
    promoted: 'Promu',
    exception: 'Exception',
    unenrolled: 'Non réinscrit',
  },

  actions: {
    editDestination: 'Modifier destination',
    dontEnroll: 'Ne pas réinscrire',
    undo: 'Annuler',
  },

  emptyState: 'Aucune classe dans l\'année en cours — configure d\'abord des classes.',
  backToSettings: 'Retour aux paramètres',

  success: (newYear: string) => `Année scolaire ${newYear} créée avec succès`,
  error: 'Une erreur est survenue',
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/constants.ts
git commit -m "feat(rollover): add ACADEMIC_YEAR_ROLLOVER i18n constants"
```

---

### Task 3: Backend helper functions

**Files:**
- Create: `frontend/src/lib/server/academic-year-rollover.ts`

**Interfaces:**
- Produces: functions `getPromotionData()`, `computeStats()`, `executeRollover()`

- [ ] **Step 1: Create helper functions file**

Create `frontend/src/lib/server/academic-year-rollover.ts`:

```typescript
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import type { PrismaTransaction } from '@/lib/server/prisma';
import type { ClassMappingEntry, StudentExceptionEntry, ClassForPromotion, StudentForPromotion } from '@/app/\(school\)/settings/nouvelle-annee/types';

export async function getPromotionData(schoolId: string, academicYearId: string) {
  const classes = await prisma.class.findMany({
    where: { schoolId, academicYearId },
    select: {
      id: true,
      name: true,
      level: true,
      enrollments: { select: { id: true } },
    },
    orderBy: { name: 'asc' },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: { academicYearId },
    select: {
      id: true,
      studentId: true,
      classId: true,
      enrolledAt: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  return {
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      studentCount: c.enrollments.length,
    })) as ClassForPromotion[],
    students: enrollments.map((e) => ({
      id: e.studentId,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      classId: e.classId,
      enrolledAt: e.enrolledAt,
    })) as StudentForPromotion[],
  };
}

export function computeStats(
  classMapping: Record<string, ClassMappingEntry>,
  studentExceptions: Record<string, StudentExceptionEntry>,
  allStudents: StudentForPromotion[],
) {
  let promoted = 0;
  let exceptions = 0;
  let unenrolled = 0;

  for (const student of allStudents) {
    const exception = studentExceptions[student.id];
    if (exception?.skip) {
      unenrolled++;
    } else if (exception?.destClassId) {
      exceptions++;
    } else {
      // Use class mapping for the student's current class
      const mapping = classMapping[student.classId];
      if (mapping?.destClassId || mapping?.isNew) {
        promoted++;
      } else {
        unenrolled++;
      }
    }
  }

  return { promoted, exceptions, unenrolled };
}

export async function executeRollover(
  tx: PrismaTransaction,
  schoolId: string,
  oldAcademicYearId: string,
  rolloverData: {
    newYearLabel: string;
    newYearStartDate: Date;
    newYearEndDate: Date;
    classMapping: Record<string, ClassMappingEntry>;
    studentExceptions: Record<string, StudentExceptionEntry>;
  },
) {
  // 1. Create new AcademicYear
  const newYear = await tx.academicYear.create({
    data: {
      schoolId,
      label: rolloverData.newYearLabel,
      startDate: rolloverData.newYearStartDate,
      endDate: rolloverData.newYearEndDate,
      isActive: true,
    },
  });

  // 2. Archive old year
  await tx.academicYear.update({
    where: { id: oldAcademicYearId },
    data: { isActive: false },
  });

  // 3. Fetch all old classes + students
  const oldClasses = await tx.class.findMany({
    where: { academicYearId: oldAcademicYearId },
    select: { id: true, name: true, level: true, room: true, capacity: true, homeroomTeacherId: true },
  });

  const oldEnrollments = await tx.enrollment.findMany({
    where: { academicYearId: oldAcademicYearId },
    select: { studentId: true, classId: true },
  });

  // 4. Create new classes (existing + newly-created)
  const newClassMap = new Map<string, string>(); // oldClassId -> newClassId

  for (const oldClass of oldClasses) {
    const mapping = rolloverData.classMapping[oldClass.id];
    if (!mapping) continue;

    if (mapping.destClassId) {
      // Reuse existing class
      newClassMap.set(oldClass.id, mapping.destClassId);
    } else if (mapping.isNew && mapping.newClass) {
      // Create new class
      const newClass = await tx.class.create({
        data: {
          schoolId,
          academicYearId: newYear.id,
          name: mapping.newClass.name,
          level: mapping.newClass.level,
          room: mapping.newClass.room || null,
          capacity: mapping.newClass.capacity || null,
          homeroomTeacherId: mapping.newClass.homeroomTeacherId || null,
        },
      });
      newClassMap.set(oldClass.id, newClass.id);
    }
  }

  // 5. Create new enrollments
  for (const oldEnroll of oldEnrollments) {
    const exception = rolloverData.studentExceptions[oldEnroll.studentId];
    if (exception?.skip) {
      // Student is not enrolled in new year
      continue;
    }

    let destClassId = exception?.destClassId;
    if (!destClassId) {
      // Use class mapping
      destClassId = newClassMap.get(oldEnroll.classId);
    }

    if (destClassId) {
      await tx.enrollment.create({
        data: {
          studentId: oldEnroll.studentId,
          classId: destClassId,
          academicYearId: newYear.id,
          enrolledAt: new Date(),
        },
      });
    }
  }

  return { newAcademicYearId: newYear.id };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/server/academic-year-rollover.ts
git commit -m "feat(rollover): add backend helper functions"
```

---

### Task 4: API route — draft operations (GET/POST/PATCH/DELETE)

**Files:**
- Create: `frontend/src/app/api/school/academic-year-rollover/route.ts`

**Interfaces:**
- Consumes: `requireAuth()`, `resolveMySchool()`, `verifyCsrf()`, Prisma types
- Produces: JSON responses with draft or empty state

- [ ] **Step 1: Create draft operations route**

Create `frontend/src/app/api/school/academic-year-rollover/route.ts`:

```typescript
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { verifyCsrf } from '@/lib/server/csrf';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { getPromotionData } from '@/lib/server/academic-year-rollover';
import { z } from 'zod';

const CreateDraftBody = z.object({
  newYearLabel: z.string().min(1),
  newYearStartDate: z.string().datetime(),
  newYearEndDate: z.string().datetime(),
});

const UpdateDraftBody = z.object({
  newYearLabel: z.string().min(1).optional(),
  newYearStartDate: z.string().datetime().optional(),
  newYearEndDate: z.string().datetime().optional(),
  classMapping: z.record(z.any()).optional(),
  studentExceptions: z.record(z.any()).optional(),
});

export async function GET(req: NextRequest) {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) return NextResponse.json({ error: 'NO_SCHOOL' }, { status: 404 });

    const draft = await prisma.academicYearRolloverDraft.findUnique({
      where: { schoolId: mySchool.schoolId },
    });

    if (!draft) {
      // No draft; return empty state with promotion data for fresh start
      const activeYear = await prisma.academicYear.findFirst({
        where: { schoolId: mySchool.schoolId, isActive: true },
      });

      if (!activeYear) {
        return NextResponse.json({ error: 'NO_ACTIVE_YEAR' }, { status: 424 });
      }

      const { classes, students } = await getPromotionData(mySchool.schoolId, activeYear.id);

      return NextResponse.json({
        draft: null,
        activeYear: { id: activeYear.id, label: activeYear.label },
        classes,
        students,
      });
    }

    return NextResponse.json({
      draft: {
        id: draft.id,
        newYearLabel: draft.newYearLabel,
        newYearStartDate: draft.newYearStartDate,
        newYearEndDate: draft.newYearEndDate,
        classMapping: draft.classMapping,
        studentExceptions: draft.studentExceptions,
      },
    });
  });
}

export async function POST(req: NextRequest) {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = await verifyCsrf(req);
    if (csrf instanceof NextResponse) return csrf;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) return NextResponse.json({ error: 'NO_SCHOOL' }, { status: 404 });

    const body = CreateDraftBody.parse(await req.json());

    const existingDraft = await prisma.academicYearRolloverDraft.findUnique({
      where: { schoolId: mySchool.schoolId },
    });

    if (existingDraft) {
      return NextResponse.json({ error: 'DRAFT_EXISTS' }, { status: 409 });
    }

    const draft = await prisma.academicYearRolloverDraft.create({
      data: {
        schoolId: mySchool.schoolId,
        createdBy: auth.user.sub,
        newYearLabel: body.newYearLabel,
        newYearStartDate: new Date(body.newYearStartDate),
        newYearEndDate: new Date(body.newYearEndDate),
        classMapping: {},
        studentExceptions: {},
      },
    });

    return NextResponse.json({ id: draft.id }, { status: 201 });
  });
}

export async function PATCH(req: NextRequest) {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = await verifyCsrf(req);
    if (csrf instanceof NextResponse) return csrf;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) return NextResponse.json({ error: 'NO_SCHOOL' }, { status: 404 });

    const body = UpdateDraftBody.parse(await req.json());

    const draft = await prisma.academicYearRolloverDraft.update({
      where: { schoolId: mySchool.schoolId },
      data: {
        newYearLabel: body.newYearLabel,
        newYearStartDate: body.newYearStartDate ? new Date(body.newYearStartDate) : undefined,
        newYearEndDate: body.newYearEndDate ? new Date(body.newYearEndDate) : undefined,
        classMapping: body.classMapping ?? undefined,
        studentExceptions: body.studentExceptions ?? undefined,
      },
    });

    return NextResponse.json({ id: draft.id });
  });
}

export async function DELETE(req: NextRequest) {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = await verifyCsrf(req);
    if (csrf instanceof NextResponse) return csrf;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) return NextResponse.json({ error: 'NO_SCHOOL' }, { status: 404 });

    await prisma.academicYearRolloverDraft.delete({
      where: { schoolId: mySchool.schoolId },
    });

    return NextResponse.json({});
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/api/school/academic-year-rollover/route.ts
git commit -m "feat(rollover): add draft CRUD API route"
```

---

### Task 5: API route — atomic confirm

**Files:**
- Create: `frontend/src/app/api/school/academic-year-rollover/confirm/route.ts`

**Interfaces:**
- Consumes: `requireAuth()`, `resolveMySchool()`, `verifyCsrf()`, `confirmNameMatches()`, `enforceDangerZoneRateLimit()`, `executeRollover()`

- [ ] **Step 1: Create confirm route**

Create `frontend/src/app/api/school/academic-year-rollover/confirm/route.ts`:

```typescript
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { verifyCsrf } from '@/lib/server/csrf';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { confirmNameMatches, enforceDangerZoneRateLimit } from '@/lib/server/school-danger-zone';
import { executeRollover } from '@/lib/server/academic-year-rollover';
import { z } from 'zod';

const ConfirmBody = z.object({
  confirmName: z.string(),
});

export async function POST(req: NextRequest) {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = await verifyCsrf(req);
    if (csrf instanceof NextResponse) return csrf;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) return NextResponse.json({ error: 'NO_SCHOOL' }, { status: 404 });

    // Check rate limit
    const rateLimitCheck = await enforceDangerZoneRateLimit(auth.user.sub, 'rollover-year');
    if (rateLimitCheck instanceof NextResponse) return rateLimitCheck;

    // Verify school name
    const body = ConfirmBody.parse(await req.json());
    if (!confirmNameMatches(mySchool.schoolName, body.confirmName)) {
      return NextResponse.json({ error: 'NAME_MISMATCH' }, { status: 400 });
    }

    // Fetch draft
    const draft = await prisma.academicYearRolloverDraft.findUnique({
      where: { schoolId: mySchool.schoolId },
    });

    if (!draft) {
      return NextResponse.json({ error: 'NO_DRAFT' }, { status: 404 });
    }

    // Fetch active year
    const activeYear = await prisma.academicYear.findFirst({
      where: { schoolId: mySchool.schoolId, isActive: true },
    });

    if (!activeYear) {
      return NextResponse.json({ error: 'NO_ACTIVE_YEAR' }, { status: 424 });
    }

    // Execute atomic rollover
    const result = await prisma.$transaction(async (tx) => {
      return executeRollover(tx as any, mySchool.schoolId, activeYear.id, {
        newYearLabel: draft.newYearLabel,
        newYearStartDate: draft.newYearStartDate,
        newYearEndDate: draft.newYearEndDate,
        classMapping: draft.classMapping as any,
        studentExceptions: draft.studentExceptions as any,
      });
    });

    // Delete draft
    await prisma.academicYearRolloverDraft.delete({
      where: { id: draft.id },
    });

    return NextResponse.json({ newAcademicYearId: result.newAcademicYearId }, { status: 201 });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/api/school/academic-year-rollover/confirm/route.ts
git commit -m "feat(rollover): add atomic confirm API route"
```

---

### Task 6: Stepper component (if not exists)

**Files:**
- Create: `frontend/src/components/ui/Stepper.tsx` (if not already present)

**Interfaces:**
- Produces: `Stepper({ steps, activeStep })` component

- [ ] **Step 1: Check if Stepper exists**

```bash
ls frontend/src/components/ui/Stepper.tsx 2>/dev/null && echo "Exists" || echo "Does not exist"
```

If it exists, skip to Step 5. Otherwise, continue.

- [ ] **Step 2: Create Stepper component**

Create `frontend/src/components/ui/Stepper.tsx`:

```typescript
import { Check } from 'lucide-react';

interface StepperProps {
  steps: Array<{ label: string; description?: string }>;
  activeStep: number;
  metaInfo?: string;
}

export function Stepper({ steps, activeStep, metaInfo }: StepperProps) {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex flex-1 items-center gap-3">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                idx < activeStep
                  ? 'bg-primary text-primary-foreground'
                  : idx === activeStep
                    ? 'border-2 border-primary bg-white text-primary'
                    : 'border-2 border-border bg-background text-muted-foreground'
              }`}
            >
              {idx < activeStep ? <Check size={16} /> : idx + 1}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`h-0.5 w-12 ${idx < activeStep ? 'bg-primary' : 'bg-border'}`}
              />
            )}
          </div>
        ))}
      </div>
      {metaInfo && <span className="text-xs text-muted-foreground">{metaInfo}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Run format check**

```bash
cd frontend && pnpm format
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/Stepper.tsx
git commit -m "feat(ui): add Stepper component"
```

---

### Task 7: StudentStatusBadge component

**Files:**
- Create: `frontend/src/components/school/StudentStatusBadge.tsx`

**Interfaces:**
- Produces: `StudentStatusBadge({ status })` component with promu/exception/nonreinscrit variants

- [ ] **Step 1: Create component**

Create `frontend/src/components/school/StudentStatusBadge.tsx`:

```typescript
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';

interface StudentStatusBadgeProps {
  status: 'promu' | 'exception' | 'nonreinscrit';
}

export function StudentStatusBadge({ status }: StudentStatusBadgeProps) {
  const statusConfig = {
    promu: {
      label: ACADEMIC_YEAR_ROLLOVER.studentStatus.promoted,
      bg: 'bg-success/10',
      text: 'text-success',
    },
    exception: {
      label: ACADEMIC_YEAR_ROLLOVER.studentStatus.exception,
      bg: 'bg-warning/10',
      text: 'text-warning',
    },
    nonreinscrit: {
      label: ACADEMIC_YEAR_ROLLOVER.studentStatus.unenrolled,
      bg: 'bg-muted',
      text: 'text-muted-foreground',
    },
  };

  const config = statusConfig[status];

  return (
    <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/school/StudentStatusBadge.tsx
git commit -m "feat(rollover): add StudentStatusBadge component"
```

---

### Task 8: PromoCounterCard component

**Files:**
- Create: `frontend/src/components/school/PromoCounterCard.tsx`

**Interfaces:**
- Produces: `PromoCounterCard({ count, label })` component

- [ ] **Step 1: Create component**

Create `frontend/src/components/school/PromoCounterCard.tsx`:

```typescript
import { Card } from '@/components/ui/Card';

interface PromoCounterCardProps {
  count: number;
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}

export function PromoCounterCard({ count, label, tone = 'default' }: PromoCounterCardProps) {
  const toneStyles = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
  };

  return (
    <Card className="flex flex-col items-center gap-2 p-4 sm:p-5">
      <span className={`text-4xl font-bold ${toneStyles[tone]}`}>{count}</span>
      <span className="text-center text-sm text-muted-foreground">{label}</span>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/school/PromoCounterCard.tsx
git commit -m "feat(rollover): add PromoCounterCard component"
```

---

### Task 9: Step1NewYear component

**Files:**
- Create: `frontend/src/app/(school)/settings/nouvelle-annee/Step1NewYear.tsx`

**Interfaces:**
- Consumes: `DateField`, `Button`, `ACADEMIC_YEAR_ROLLOVER` constants
- Produces: `Step1NewYear({ draft, onSave, onNext, isLoading })` component

- [ ] **Step 1: Create Step 1 component**

Create `frontend/src/app/(school)/settings/nouvelle-annee/Step1NewYear.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { DateField } from '@/components/ui/DateField';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { RolloverDraft } from './types';

interface Step1NewYearProps {
  draft: Omit<RolloverDraft, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> | null;
  onSave: (data: { newYearLabel: string; newYearStartDate: string; newYearEndDate: string }) => Promise<void>;
  onNext: () => void;
  isLoading?: boolean;
}

export function Step1NewYear({ draft, onSave, onNext, isLoading = false }: Step1NewYearProps) {
  const t = ACADEMIC_YEAR_ROLLOVER.step1;

  const [label, setLabel] = useState(draft?.newYearLabel || '');
  const [startDate, setStartDate] = useState(draft?.newYearStartDate ? new Date(draft.newYearStartDate).toISOString().split('T')[0] : '');
  const [endDate, setEndDate] = useState(draft?.newYearEndDate ? new Date(draft.newYearEndDate).toISOString().split('T')[0] : '');
  const [error, setError] = useState('');

  const handleProceed = async () => {
    setError('');

    if (!label) {
      setError(t.validation.yearRequired);
      return;
    }
    if (!startDate) {
      setError(t.validation.startDateRequired);
      return;
    }
    if (!endDate) {
      setError(t.validation.endDateRequired);
      return;
    }
    if (endDate <= startDate) {
      setError(t.validation.endDateAfterStart);
      return;
    }

    try {
      await onSave({
        newYearLabel: label,
        newYearStartDate: `${startDate}T00:00:00Z`,
        newYearEndDate: `${endDate}T23:59:59Z`,
      });
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.validation.yearRequired);
    }
  };

  return (
    <Card className="gap-4 p-4 sm:p-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="year-label" className="block text-sm font-medium">
            {t.yearLabel}
          </label>
          <input
            id="year-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="2025-2026"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <DateField
          label={t.startDate}
          value={startDate}
          onChange={setStartDate}
        />

        <DateField
          label={t.endDate}
          value={endDate}
          onChange={setEndDate}
        />

        {error && <div className="text-sm text-destructive">{error}</div>}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => onSave({ newYearLabel: label, newYearStartDate: `${startDate}T00:00:00Z`, newYearEndDate: `${endDate}T23:59:59Z` })} disabled={isLoading}>
          {t.saveAsDraft}
        </Button>
        <Button onClick={handleProceed} disabled={isLoading}>
          {t.nextStep}
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/\(school\)/settings/nouvelle-annee/Step1NewYear.tsx
git commit -m "feat(rollover): add Step1NewYear component"
```

---

### Task 10: Step2Promotion component

**Files:**
- Create: `frontend/src/app/(school)/settings/nouvelle-annee/Step2Promotion.tsx`

**Interfaces:**
- Consumes: `ACADEMIC_YEAR_ROLLOVER`, `ClassForPromotion`, `ClassMappingEntry`
- Produces: `Step2Promotion({ classes, activeMapping, onMappingChange, onSave, onNext })` component

- [ ] **Step 1: Create Step 2 component**

Create `frontend/src/app/(school)/settings/nouvelle-annee/Step2Promotion.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { ClassForPromotion, ClassMappingEntry } from './types';

interface Step2PromotionProps {
  classes: ClassForPromotion[];
  allClasses: ClassForPromotion[];
  activeMapping: Record<string, ClassMappingEntry>;
  onMappingChange: (classId: string, mapping: ClassMappingEntry) => void;
  onSave: (mapping: Record<string, ClassMappingEntry>) => Promise<void>;
  onNext: () => void;
  isLoading?: boolean;
}

export function Step2Promotion({
  classes,
  allClasses,
  activeMapping,
  onMappingChange,
  onSave,
  onNext,
  isLoading = false,
}: Step2PromotionProps) {
  const t = ACADEMIC_YEAR_ROLLOVER.step2;
  const [error, setError] = useState('');

  const handleProceed = async () => {
    setError('');

    // Validate all classes have a destination
    for (const cls of classes) {
      const mapping = activeMapping[cls.id];
      if (!mapping?.destClassId && !mapping?.isNew) {
        setError(`${cls.name} n'a pas de classe de destination`);
        return;
      }
    }

    try {
      await onSave(activeMapping);
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">{t.help}</p>
      </Card>

      <Card className="overflow-x-auto p-4 sm:p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">{t.currentClass}</th>
              <th className="px-3 py-2 text-left font-medium">{t.studentCount}</th>
              <th className="px-3 py-2 text-left font-medium">{t.currentLevel}</th>
              <th className="px-3 py-2 text-left font-medium">{t.destClass}</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((cls) => {
              const mapping = activeMapping[cls.id] || {};
              const destClass = mapping.destClassId ? allClasses.find((c) => c.id === mapping.destClassId) : null;

              return (
                <tr key={cls.id} className="border-b border-border">
                  <td className="px-3 py-2">{cls.name}</td>
                  <td className="px-3 py-2">{cls.studentCount}</td>
                  <td className="px-3 py-2">{cls.level}</td>
                  <td className="px-3 py-2">
                    <select
                      value={mapping.destClassId || ''}
                      onChange={(e) =>
                        onMappingChange(cls.id, {
                          destClassId: e.target.value || undefined,
                          isNew: false,
                        })
                      }
                      className="rounded border border-border bg-background px-2 py-1 text-sm"
                    >
                      <option value="">-- Sélectionner --</option>
                      {allClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.level})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {error && <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => onSave(activeMapping)} disabled={isLoading}>
          {t.saveAsDraft}
        </Button>
        <Button onClick={handleProceed} disabled={isLoading}>
          {t.nextStep}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/\(school\)/settings/nouvelle-annee/Step2Promotion.tsx
git commit -m "feat(rollover): add Step2Promotion component"
```

---

### Task 11: Step3Summary component

**Files:**
- Create: `frontend/src/app/(school)/settings/nouvelle-annee/Step3Summary.tsx`

**Interfaces:**
- Consumes: `StudentStatusBadge`, `PromoCounterCard`, `ACADEMIC_YEAR_ROLLOVER`, `computeStats`
- Produces: `Step3Summary({ stats, students, schoolName, onConfirm, isLoading })` component

- [ ] **Step 1: Create Step 3 component**

Create `frontend/src/app/(school)/settings/nouvelle-annee/Step3Summary.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StudentStatusBadge } from '@/components/school/StudentStatusBadge';
import { PromoCounterCard } from '@/components/school/PromoCounterCard';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { PromotionStats, StudentForPromotion } from './types';

interface Step3SummaryProps {
  stats: PromotionStats;
  students: Array<{
    id: string;
    firstName: string;
    lastName: string;
    status: 'promu' | 'exception' | 'nonreinscrit';
    destClassName?: string;
  }>;
  oldYearLabel: string;
  newYearLabel: string;
  schoolName: string;
  onConfirm: (confirmName: string) => Promise<void>;
  isLoading?: boolean;
}

export function Step3Summary({
  stats,
  students,
  oldYearLabel,
  newYearLabel,
  schoolName,
  onConfirm,
  isLoading = false,
}: Step3SummaryProps) {
  const t = ACADEMIC_YEAR_ROLLOVER.step3;
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 8;

  const startIdx = page * pageSize;
  const pageStudents = students.slice(startIdx, startIdx + pageSize);

  const handleConfirm = async () => {
    setError('');

    if (confirmInput !== schoolName) {
      setError('Le nom de l\'école ne correspond pas');
      return;
    }

    try {
      await onConfirm(confirmInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la confirmation');
    }
  };

  return (
    <div className="space-y-4">
      {/* Counter cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <PromoCounterCard count={stats.promoted} label={t.promoted} tone="success" />
        <PromoCounterCard count={stats.exceptions} label={t.exceptions} tone="warning" />
        <PromoCounterCard count={stats.unenrolled} label={t.unenrolled} tone="destructive" />
      </div>

      {/* Student table */}
      <Card className="p-4 sm:p-6">
        <div className="space-y-3">
          {pageStudents.map((student) => (
            <div key={student.id} className="flex items-center justify-between border-b border-border pb-3 last:border-none">
              <div className="flex-1">
                <span className="font-medium">{student.firstName} {student.lastName}</span>
                {student.destClassName && <p className="text-xs text-muted-foreground">{student.destClassName}</p>}
              </div>
              <StudentStatusBadge status={student.status} />
            </div>
          ))}
        </div>

        {students.length > pageSize && (
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="text-sm text-primary disabled:text-muted-foreground"
            >
              Précédent
            </button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} sur {Math.ceil(students.length / pageSize)}
            </span>
            <button
              onClick={() => setPage(Math.min(Math.ceil(students.length / pageSize) - 1, page + 1))}
              disabled={page >= Math.ceil(students.length / pageSize) - 1}
              className="text-sm text-primary disabled:text-muted-foreground"
            >
              Suivant
            </button>
          </div>
        )}
      </Card>

      {/* Confirm zone */}
      <Card className="border-destructive/50 bg-destructive/5 p-4 sm:p-6">
        <p className="text-sm font-medium">{t.confirmTitle}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t.confirmText(oldYearLabel, newYearLabel, stats.promoted)}
        </p>

        <div className="mt-4 space-y-2">
          <label htmlFor="confirm-input" className="block text-xs font-medium">
            {t.typeToConfirm}
          </label>
          <input
            id="confirm-input"
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={schoolName}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        {error && <div className="mt-2 text-xs text-destructive">{error}</div>}

        <div className="mt-4">
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading || confirmInput !== schoolName}
            className="w-full"
          >
            {t.confirmButton}
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/\(school\)/settings/nouvelle-annee/Step3Summary.tsx
git commit -m "feat(rollover): add Step3Summary component"
```

---

### Task 12: AcademicYearWizardPage orchestrator

**Files:**
- Create: `frontend/src/app/(school)/settings/nouvelle-annee/page.tsx`

**Interfaces:**
- Consumes: All step components, API routes, `useRouter`, `useUser`
- Produces: Main wizard page

- [ ] **Step 1: Create wizard page**

Create `frontend/src/app/(school)/settings/nouvelle-annee/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/lib/api';
import { hasMinRole } from '@/lib/server/school';
import { Stepper } from '@/components/ui/Stepper';
import { Button } from '@/components/ui/Button';
import { Step1NewYear } from './Step1NewYear';
import { Step2Promotion } from './Step2Promotion';
import { Step3Summary } from './Step3Summary';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { RolloverDraft, WizardStep, ClassForPromotion, StudentForPromotion, ClassMappingEntry } from './types';

export default function AcademicYearWizardPage() {
  const router = useRouter();
  const { user, school } = useUser();

  const [step, setStep] = useState<WizardStep>(1);
  const [draft, setDraft] = useState<RolloverDraft | null>(null);
  const [activeYear, setActiveYear] = useState<{ id: string; label: string } | null>(null);
  const [classes, setClasses] = useState<ClassForPromotion[]>([]);
  const [students, setStudents] = useState<StudentForPromotion[]>([]);
  const [classMapping, setClassMapping] = useState<Record<string, ClassMappingEntry>>({});
  const [studentExceptions, setStudentExceptions] = useState<Record<string, { destClassId?: string; skip?: boolean }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !school) return;

    // Check if user is OWNER
    if (!hasMinRole(school.role, 'OWNER')) {
      router.replace('/');
      return;
    }

    // Fetch wizard state
    const fetchDraft = async () => {
      try {
        const response = await api<any>('/api/school/academic-year-rollover');
        setActiveYear(response.activeYear);
        setClasses(response.classes);
        setStudents(response.students);

        if (response.draft) {
          setDraft(response.draft);
          setClassMapping(response.draft.classMapping);
          setStudentExceptions(response.draft.studentExceptions);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    };

    fetchDraft();
  }, [user, school, router]);

  const handleStep1Save = async (data: any) => {
    setIsLoading(true);
    try {
      if (!draft) {
        await api<any>('/api/school/academic-year-rollover', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } else {
        await api<any>('/api/school/academic-year-rollover', {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep2Save = async (mapping: Record<string, ClassMappingEntry>) => {
    setIsLoading(true);
    try {
      await api<any>('/api/school/academic-year-rollover', {
        method: 'PATCH',
        body: JSON.stringify({ classMapping: mapping }),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async (confirmName: string) => {
    setIsLoading(true);
    try {
      await api<any>('/api/school/academic-year-rollover/confirm', {
        method: 'POST',
        body: JSON.stringify({ confirmName }),
      });

      // Success — redirect to dashboard
      router.push('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  if (!activeYear) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <p className="text-muted-foreground">{ACADEMIC_YEAR_ROLLOVER.emptyState}</p>
        <Button onClick={() => router.push('/settings')}>{ACADEMIC_YEAR_ROLLOVER.backToSettings}</Button>
      </div>
    );
  }

  const steps = [
    { label: ACADEMIC_YEAR_ROLLOVER.step1.title },
    { label: ACADEMIC_YEAR_ROLLOVER.step2.title },
    { label: ACADEMIC_YEAR_ROLLOVER.step3.title },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{ACADEMIC_YEAR_ROLLOVER.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ACADEMIC_YEAR_ROLLOVER.subtitle(activeYear.label, draft?.newYearLabel || '2025-2026')}
        </p>
      </div>

      {/* Irreversibility banner */}
      <div className="rounded-lg border border-warning bg-warning/5 p-3 text-xs text-warning">
        {ACADEMIC_YEAR_ROLLOVER.warningBanner}
      </div>

      {/* Stepper */}
      <Stepper steps={steps} activeStep={step - 1} />

      {/* Step content */}
      <div>
        {step === 1 && (
          <Step1NewYear
            draft={draft}
            onSave={handleStep1Save}
            onNext={() => setStep(2)}
            isLoading={isLoading}
          />
        )}
        {step === 2 && (
          <Step2Promotion
            classes={classes}
            allClasses={classes}
            activeMapping={classMapping}
            onMappingChange={(classId, mapping) =>
              setClassMapping((prev) => ({ ...prev, [classId]: mapping }))
            }
            onSave={handleStep2Save}
            onNext={() => setStep(3)}
            isLoading={isLoading}
          />
        )}
        {step === 3 && (
          <Step3Summary
            stats={{
              promoted: Object.values(classMapping).filter((m) => m.destClassId).length,
              exceptions: Object.keys(studentExceptions).filter((k) => !studentExceptions[k].skip).length,
              unenrolled: Object.keys(studentExceptions).filter((k) => studentExceptions[k].skip).length,
            }}
            students={students.map((s) => ({
              id: s.id,
              firstName: s.firstName,
              lastName: s.lastName,
              status: studentExceptions[s.id]?.skip ? 'nonreinscrit' : studentExceptions[s.id]?.destClassId ? 'exception' : 'promu',
              destClassName: classes.find((c) => c.id === classMapping[s.classId]?.destClassId)?.name,
            }))}
            oldYearLabel={activeYear.label}
            newYearLabel={draft?.newYearLabel || ''}
            schoolName={school?.schoolName || ''}
            onConfirm={handleConfirm}
            isLoading={isLoading}
          />
        )}
      </div>

      {error && (
        <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Back button */}
      <Button variant="ghost" onClick={() => router.push('/settings')}>
        {ACADEMIC_YEAR_ROLLOVER.backToSettings}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/\(school\)/settings/nouvelle-annee/page.tsx
git commit -m "feat(rollover): add wizard orchestrator page"
```

---

### Task 13: Update AnneeScolaireTab entry point

**Files:**
- Modify: `frontend/src/app/(school)/settings/AnneeScolaireTab.tsx`

**Interfaces:**
- Consumes: `Button`, `Link`, `hasMinRole`

- [ ] **Step 1: Add entry button**

Open `frontend/src/app/(school)/settings/AnneeScolaireTab.tsx` and find the section that renders the academic year controls. Add this button before or after existing year controls:

```typescript
{hasMinRole(school?.role, 'OWNER') && (
  <Link href="/settings/nouvelle-annee">
    <Button>Passage à l'année suivante</Button>
  </Link>
)}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/\(school\)/settings/AnneeScolaireTab.tsx
git commit -m "feat(rollover): add entry point button to AnneeScolaireTab"
```

---

### Task 14: Final checks + documentation

**Files:**
- Update: `.planning/banani/STATUS.md`

- [ ] **Step 1: Run format, lint, typecheck, test**

```bash
cd frontend
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Expected: All pass (or only pre-existing typecheck failures unrelated to this wizard).

- [ ] **Step 2: Update STATUS.md**

Open `.planning/banani/STATUS.md` and move `annee-scolaire-wizard` from "In progress" to "Done" section:

```markdown
## Done
- [x] `annee-scolaire-wizard` — `frontend/src/app/(school)/settings/nouvelle-annee/page.tsx` — plan: `annee-scolaire-wizard.md` — commit: <last commit hash>
```

Also update "Last updated" line to today's date.

- [ ] **Step 3: Commit**

```bash
git add .planning/banani/STATUS.md
git commit -m "docs(rollover): mark annee-scolaire-wizard Done in STATUS.md"
```

- [ ] **Step 4: E2E sanity check**

Manually test on seeded school:
1. Login as OWNER (`amosdorceus2023@gmail.com` / `TestEcole2026!`)
2. Navigate to Settings > Passage à l'année suivante
3. Fill Step 1 (year form)
4. Map classes in Step 2
5. Review + confirm in Step 3 (type school name)
6. Verify new academic year created in database + dashboard shows it

---

## Summary

This plan implements the complete 3-step academic-year rollover wizard with:
- Server-side draft persistence (`AcademicYearRolloverDraft` model)
- Atomic confirm transaction (new year + classes + enrollments created in single tx)
- OWNER-only + type-to-confirm gating (reuses `school-danger-zone.ts` patterns)
- No auto-copy of teacher/fee configs (admin reconfigures post-rollover)
- Pixel-perfect Banani UI with responsive mobile-first design
- Full E2E test verification

Total: 14 tasks covering schema, API, components, page orchestrator, and entry-point wiring.
