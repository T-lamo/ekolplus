# Dossiers enrichis (Élève / Parent / Prof) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing identity/administrative fields (NISU, NIF, NIU, statut vital, lieu de naissance, diplôme) to `Student`, `Guardian` and `Teacher`, plus a confidentially-served document-upload system for a student's 3 fixed administrative documents (acte de naissance, carnet de vaccination, dossier de l'ancienne école).

**Architecture:** Additive Prisma schema changes (3 existing models + 1 new `StudentDocument` model) applied via a hand-written migration at merge time; a small extension to the existing Cloudinary upload helper so these specific documents are stored with Cloudinary's `authenticated` delivery type instead of the public type every other upload in this app uses; two new gated API routes for upload/list/download; and straightforward additions to the existing Élève and Enseignant forms/detail pages.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5 (Postgres/Neon), Cloudinary Node SDK v2, Zod, Vitest + `vitest-mock-extended` (`prismaMock`), next-intl (fr/en/ht).

**Spec:** `docs/superpowers/specs/2026-09-02-dossiers-enrichis-design.md`

## Global Constraints

- Every Route Handler `export const runtime = 'nodejs'`.
- Every mutating route calls `verifyCsrf(req)` first, then `requireAuth()`, then `requireSchoolPermission(userId, module, action, requestId)` — never `resolveMySchool` directly (RBAC-01 tripwire).
- **Never run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` against the shared dev database.** This plan's schema/migration task only edits `schema.prisma` and hand-writes the migration SQL file; nothing in this plan touches a real database. The migration is applied once, later, by the person merging this branch (`prisma db execute` + `prisma migrate resolve --applied` + `prisma generate` against the real DB, with a row-count carry-over check) — not part of any task below.
- No em dashes in user-facing strings (UI copy, `src/messages/*/*.json`). Use a period, comma, colon or `·`.
- Cloudinary documents uploaded via the new routes in this plan MUST use `type: 'authenticated'` delivery (never the public `upload` type used by `photoUrl`/`/api/upload`) — this is the whole point of the confidentiality design in the spec §4. Never store or return a Cloudinary `secure_url` for these documents; only the internal `fileKey` (public_id) is persisted, and only a short-lived signed URL is ever handed to the browser, at download time.
- `idNumber` on `Teacher` is being removed and replaced by separate `nif`/`niu` fields — every reference to `Teacher.idNumber` in code must be updated in the same task that touches that file (tracked explicitly per task below).

---

### Task 1: Prisma schema — champs élève/parent/prof + modèle StudentDocument

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: `frontend/prisma/migrations/37_dossiers_enrichis/migration.sql`

**Interfaces:**
- Produces (consumed by every later task): Prisma Client types `Student.nisu: string | null`, `Guardian.nif/niu/vitalStatus: string | null`, `Teacher.birthPlace/diploma/nif/niu: string | null` (and `Teacher.idNumber` no longer exists), `StudentDocument` model with fields `id, studentId, type (StudentDocumentType), fileKey, fileName, mimeType, resourceType, sizeBytes, uploadedAt, uploadedById`, unique on `(studentId, type)`.

This task has no application logic to unit-test — it is verified by Prisma's own tooling (schema validation + client generation), never by touching a database.

- [ ] **Step 1: Edit `Guardian` model** — add three fields after `isPrimary`:

In `frontend/prisma/schema.prisma`, find:
```prisma
model Guardian {
  id           String   @id @default(cuid())
  studentId    String
  student      Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  name         String
  relationship String // "Père" | "Mère" | "Tuteur" — free text
  phone        String?
  email        String?
  profession   String?
  isPrimary    Boolean  @default(false)
  createdAt    DateTime @default(now())

  @@index([studentId])
}
```
Replace with:
```prisma
model Guardian {
  id           String   @id @default(cuid())
  studentId    String
  student      Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  name         String
  relationship String // "Père" | "Mère" | "Tuteur" — free text
  phone        String?
  email        String?
  profession   String?
  isPrimary    Boolean  @default(false)
  nif          String? // Numéro d'Identification Fiscale
  niu          String? // Numéro d'Identifiant Unique
  vitalStatus  String? // "VIVANT" | "DECEDE" — texte libre, pas de catalogue fixe
  createdAt    DateTime @default(now())

  @@index([studentId])
}
```

- [ ] **Step 2: Edit `Student` model** — add `nisu` after `transferNumber`:

Find:
```prisma
  previousSchool String?
  transferNumber String?
  notes          String? // internal observations, staff-only
```
Replace with:
```prisma
  previousSchool String?
  transferNumber String?
  nisu           String? // Numéro d'Identification Scolaire Unique (MENFP)
  notes          String? // internal observations, staff-only
```

- [ ] **Step 3: Edit `Teacher` model** — replace `idNumber` with `birthPlace`, `diploma`, `nif`, `niu`:

Find:
```prisma
  dateOfBirth       DateTime?
  gender            String?
  nationality       String?
  idNumber          String? // ex "NIF-2024-0042"
  secondaryPhone    String?
```
Replace with:
```prisma
  dateOfBirth       DateTime?
  gender            String?
  nationality       String?
  birthPlace        String? // aligné sur Student.placeOfBirth
  diploma           String? // texte libre, ex. "Licence en Sciences de l'Éducation"
  nif               String? // Numéro d'Identification Fiscale — anciennement idNumber
  niu               String? // Numéro d'Identifiant Unique
  secondaryPhone    String?
```

- [ ] **Step 4: Add the `StudentDocumentType` enum and `StudentDocument` model**

Insert immediately after the closing `}` of `model Student` (right before `model Guardian {`):
```prisma
enum StudentDocumentType {
  BIRTH_CERTIFICATE
  VACCINATION_RECORD
  PREVIOUS_SCHOOL_RECORD
}

// Documents administratifs scannés de l'élève (spec 2026-09-02-dossiers-enrichis).
// Un seul fichier "courant" par type et par élève — un nouvel upload sur un
// type déjà présent REMPLACE la ligne (upsert), même convention à un seul
// slot que Student.photoUrl. `fileKey` est le public_id Cloudinary,
// JAMAIS une URL : ces documents sont uploadés en delivery type
// "authenticated" et ne sont servis qu'au travers d'une route serveur
// authentifiée qui génère une URL signée à courte durée. `resourceType`
// (image | raw) est celui renvoyé par Cloudinary à l'upload — nécessaire
// pour reconstruire l'URL signée au téléchargement.
model StudentDocument {
  id           String              @id @default(cuid())
  studentId    String
  student      Student             @relation(fields: [studentId], references: [id], onDelete: Cascade)
  type         StudentDocumentType
  fileKey      String
  fileName     String
  mimeType     String
  resourceType String
  sizeBytes    Int
  uploadedAt   DateTime            @default(now())
  uploadedById String?
  uploadedBy   User?               @relation(fields: [uploadedById], references: [id], onDelete: SetNull)

  @@unique([studentId, type])
  @@index([studentId])
}
```

- [ ] **Step 5: Add the `Student` back-relation and the `User` back-relation**

In `model Student`, find:
```prisma
  guardians       Guardian[]
  enrollments     Enrollment[]
```
Replace with:
```prisma
  guardians       Guardian[]
  documents       StudentDocument[]
  enrollments     Enrollment[]
```

In `model User`, find:
```prisma
  attendanceMarks     Attendance[]
  recordedFeePayments FeePayment[]
```
Replace with:
```prisma
  attendanceMarks         Attendance[]
  recordedFeePayments     FeePayment[]
  uploadedStudentDocuments StudentDocument[]
```

- [ ] **Step 6: Format and validate the schema (no database touched)**

Run: `pnpm --filter frontend exec prisma format`
Run: `pnpm --filter frontend exec prisma validate`
Expected: both succeed with no output beyond a confirmation line. If `validate` reports an error, fix the schema edit that caused it before continuing — do not proceed to Step 7 with an invalid schema.

- [ ] **Step 7: Write the migration SQL by hand**

Create `frontend/prisma/migrations/37_dossiers_enrichis/migration.sql`:
```sql
-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN "nif" TEXT,
ADD COLUMN "niu" TEXT,
ADD COLUMN "vitalStatus" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "nisu" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "birthPlace" TEXT,
ADD COLUMN "diploma" TEXT,
ADD COLUMN "nif" TEXT,
ADD COLUMN "niu" TEXT;

-- Data migration: idNumber already held a NIF value in practice (see
-- schema comment history) — carry it over before dropping the column
-- (spec §3.2).
UPDATE "Teacher" SET "nif" = "idNumber" WHERE "idNumber" IS NOT NULL;

-- AlterTable
ALTER TABLE "Teacher" DROP COLUMN "idNumber";

-- CreateEnum
CREATE TYPE "StudentDocumentType" AS ENUM ('BIRTH_CERTIFICATE', 'VACCINATION_RECORD', 'PREVIOUS_SCHOOL_RECORD');

-- CreateTable
CREATE TABLE "StudentDocument" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "StudentDocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentDocument_studentId_type_key" ON "StudentDocument"("studentId", "type");

-- CreateIndex
CREATE INDEX "StudentDocument_studentId_idx" ON "StudentDocument"("studentId");

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 8: Regenerate the Prisma Client (reads schema.prisma only, no DB connection)**

Run: `pnpm --filter frontend exec prisma generate`
Expected: `✔ Generated Prisma Client` with no errors. This step is required for Tasks 2, 3 and 5 below to type-check against the new fields — it does not read or write any database.

- [ ] **Step 9: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/37_dossiers_enrichis/migration.sql
git commit -m "feat(schema): add NISU/NIF/NIU/vitalStatus fields and StudentDocument model"
```

---

### Task 2: Stockage confidentiel de documents — extension Cloudinary + routes

**Files:**
- Modify: `frontend/src/lib/server/upload/cloudinary-client.ts`
- Modify: `frontend/src/test-utils/cloudinary-mock.ts`
- Create: `frontend/src/lib/server/upload/cloudinary-client.test.ts`
- Create: `frontend/src/app/api/school/students/[id]/documents/route.ts`
- Create: `frontend/src/app/api/school/students/[id]/documents/route.test.ts`
- Create: `frontend/src/app/api/school/students/[id]/documents/[type]/file/route.ts`
- Create: `frontend/src/app/api/school/students/[id]/documents/[type]/file/route.test.ts`

**Interfaces:**
- Consumes: Prisma Client `prisma.studentDocument` (Task 1), `requireSchoolPermission(userId, 'eleves', action, requestId)` from `@/lib/server/school-permissions`, `verifyMagicBytes(buf, mimeType)` from `@/lib/server/upload/sniff` (already handles `application/pdf`, `image/jpeg`, `image/png` — no changes needed there).
- Produces (consumed by Task 4): `POST /api/school/students/[id]/documents` (multipart, field `file` + field `type`), `GET /api/school/students/[id]/documents` → `{ documents: { type: string; fileName: string; mimeType: string; sizeBytes: number; uploadedAt: string }[] }` (only present types are listed), `GET /api/school/students/[id]/documents/[type]/file` → 302 redirect to a short-lived signed Cloudinary URL.

- [ ] **Step 1: Write the failing test for the `uploadBuffer` extension**

Create `frontend/src/lib/server/upload/cloudinary-client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadStreamMock = vi.fn();
const destroyMock = vi.fn(async () => ({ result: 'ok' }));
const urlMock = vi.fn(() => 'https://res.cloudinary.com/test-cloud/signed');
const configMock = vi.fn();

vi.mock('cloudinary', () => ({
  v2: {
    config: configMock,
    uploader: { upload_stream: uploadStreamMock, destroy: destroyMock },
    url: urlMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
  vi.stubEnv('CLOUDINARY_API_KEY', 'key');
  vi.stubEnv('CLOUDINARY_API_SECRET', 'secret');
});

function mockUploadStreamOnce(response: Record<string, unknown>) {
  uploadStreamMock.mockImplementationOnce(
    (_options: unknown, cb: (err: unknown, res: unknown) => void) => ({
      end: () => cb(null, response),
    }),
  );
}

describe('uploadBuffer', () => {
  it('does not set a delivery type by default (public upload, unchanged behavior)', async () => {
    const { uploadBuffer, __resetCloudinarySingleton } = await import('./cloudinary-client');
    __resetCloudinarySingleton();
    mockUploadStreamOnce({
      public_id: 'p1',
      secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/p1',
      bytes: 4,
      resource_type: 'image',
    });

    await uploadBuffer('p1', Buffer.from('data'));

    const optionsArg = uploadStreamMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(optionsArg.type).toBeUndefined();
  });

  it('passes type "authenticated" when deliveryType is "authenticated"', async () => {
    const { uploadBuffer, __resetCloudinarySingleton } = await import('./cloudinary-client');
    __resetCloudinarySingleton();
    mockUploadStreamOnce({
      public_id: 'students/s1/doc',
      secure_url: 'https://res.cloudinary.com/test-cloud/authenticated/upload/students/s1/doc',
      bytes: 10,
      resource_type: 'raw',
    });

    const result = await uploadBuffer('students/s1/doc', Buffer.from('pdfdata'), {
      deliveryType: 'authenticated',
    });

    const optionsArg = uploadStreamMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(optionsArg.type).toBe('authenticated');
    expect(result.resourceType).toBe('raw');
  });
});

describe('getSignedDocumentUrl', () => {
  it('generates a signed authenticated URL with an expiry', async () => {
    const { getSignedDocumentUrl, __resetCloudinarySingleton } = await import(
      './cloudinary-client'
    );
    __resetCloudinarySingleton();

    getSignedDocumentUrl('students/s1/doc', 'raw', 300);

    const optionsArg = urlMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(urlMock.mock.calls[0]?.[0]).toBe('students/s1/doc');
    expect(optionsArg.type).toBe('authenticated');
    expect(optionsArg.sign_url).toBe(true);
    expect(optionsArg.resource_type).toBe('raw');
    expect(typeof optionsArg.expires_at).toBe('number');
  });
});

describe('deleteAsset', () => {
  it('calls destroy with the resource type and delivery type', async () => {
    const { deleteAsset, __resetCloudinarySingleton } = await import('./cloudinary-client');
    __resetCloudinarySingleton();

    await deleteAsset('students/s1/doc', 'raw', { deliveryType: 'authenticated' });

    expect(destroyMock).toHaveBeenCalledWith('students/s1/doc', {
      resource_type: 'raw',
      type: 'authenticated',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/upload/cloudinary-client.test.ts`
Expected: FAIL — `getSignedDocumentUrl` and `deleteAsset` are not exported yet, and `uploadBuffer` does not accept a third argument.

- [ ] **Step 3: Extend `cloudinary-client.ts`**

In `frontend/src/lib/server/upload/cloudinary-client.ts`, find:
```ts
export interface UploadResult {
  /** Cloudinary public_id — stored as `FileUpload.key` for forward-compat. */
  publicId: string;
  /** HTTPS CDN URL the browser hits directly (no proxy). */
  secureUrl: string;
  /** Stored byte length. */
  bytes: number;
}
```
Replace with:
```ts
export interface UploadResult {
  /** Cloudinary public_id — stored as `FileUpload.key` for forward-compat. */
  publicId: string;
  /** HTTPS CDN URL the browser hits directly (no proxy). */
  secureUrl: string;
  /** Stored byte length. */
  bytes: number;
  /** "image" | "video" | "raw" — Cloudinary's own classification of the
   * uploaded bytes, needed later to rebuild a delivery/signed URL for the
   * same asset (the URL shape differs by resource type). */
  resourceType: string;
}

export interface UploadOptions {
  /**
   * Pass 'authenticated' to store the asset under Cloudinary's private
   * delivery type — the resulting `secureUrl` (and any URL built from
   * `publicId` afterward) is NOT servable without a signed request. Omit
   * for the existing public-upload behavior (avatars, photos).
   */
  deliveryType?: 'authenticated';
}
```

Find:
```ts
export async function uploadBuffer(publicId: string, body: Buffer): Promise<UploadResult> {
  configureOnce();

  // resource_type 'auto' lets Cloudinary pick image/video/raw from the bytes,
  // matching the route's MIME-allowlist approach (we already validated the
  // MIME server-side; Cloudinary's auto-detect is the secondary safety net).
  const options: UploadApiOptions = {
    public_id: publicId,
    resource_type: 'auto',
  };
  if (_preset) options.upload_preset = _preset;

  const res = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, response) => {
      if (err) return reject(err);
      if (!response) return reject(new Error('Cloudinary upload returned no response'));
      resolve(response);
    });
    stream.end(body);
  });

  return {
    publicId: res.public_id,
    secureUrl: res.secure_url,
    bytes: typeof res.bytes === 'number' ? res.bytes : body.length,
  };
}
```
Replace with:
```ts
export async function uploadBuffer(
  publicId: string,
  body: Buffer,
  uploadOptions?: UploadOptions,
): Promise<UploadResult> {
  configureOnce();

  // resource_type 'auto' lets Cloudinary pick image/video/raw from the bytes,
  // matching the route's MIME-allowlist approach (we already validated the
  // MIME server-side; Cloudinary's auto-detect is the secondary safety net).
  const options: UploadApiOptions = {
    public_id: publicId,
    resource_type: 'auto',
  };
  if (_preset) options.upload_preset = _preset;
  if (uploadOptions?.deliveryType) options.type = uploadOptions.deliveryType;

  const res = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, response) => {
      if (err) return reject(err);
      if (!response) return reject(new Error('Cloudinary upload returned no response'));
      resolve(response);
    });
    stream.end(body);
  });

  return {
    publicId: res.public_id,
    secureUrl: res.secure_url,
    bytes: typeof res.bytes === 'number' ? res.bytes : body.length,
    resourceType: res.resource_type,
  };
}

/**
 * Generate a short-lived signed URL for an asset stored with `type:
 * 'authenticated'`. The unsigned URL for such an asset is not servable at
 * all — the signature plus `expires_at` are what make this URL work, and
 * only for the next `expiresInSeconds`.
 */
export function getSignedDocumentUrl(
  publicId: string,
  resourceType: string,
  expiresInSeconds = 300,
): string {
  configureOnce();
  return cloudinary.url(publicId, {
    type: 'authenticated',
    resource_type: resourceType,
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  });
}

/** Permanently removes an asset — used when a document of a given type is replaced. */
export async function deleteAsset(
  publicId: string,
  resourceType: string,
  deleteOptions?: UploadOptions,
): Promise<void> {
  configureOnce();
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    ...(deleteOptions?.deliveryType ? { type: deleteOptions.deliveryType } : {}),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/upload/cloudinary-client.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Extend the shared test mock so route tests can use it**

In `frontend/src/test-utils/cloudinary-mock.ts`, find:
```ts
export interface MockCloudinaryOptions {
  /**
   * Override for `uploadBuffer`. If omitted, returns a happy
   * `{ publicId, secureUrl: 'https://res.cloudinary.com/test-cloud/image/upload/<id>', bytes }`.
   * Throw to simulate upload failure.
   */
  onUpload?: Mock;
}

export interface MockUploadResult {
  publicId: string;
  secureUrl: string;
  bytes: number;
}

export interface MockCloudinaryClient {
  uploadBuffer: (publicId: string, body: Buffer) => Promise<MockUploadResult>;
}

/**
 * Build a mock Cloudinary uploader. Inject via:
 * `vi.mock('@/lib/server/upload/cloudinary-client', () => ({
 *   uploadBuffer: vi.fn((id, body) => mockCloudinaryClient().uploadBuffer(id, body)),
 *   StorageNotConfiguredError: class extends Error { ... },
 * }))`.
 */
export function mockCloudinaryClient(opts: MockCloudinaryOptions = {}): MockCloudinaryClient {
  return {
    uploadBuffer: vi.fn(async (publicId: string, body: Buffer) => {
      if (opts.onUpload) return (await opts.onUpload(publicId, body)) as MockUploadResult;
      return {
        publicId,
        secureUrl: `https://res.cloudinary.com/test-cloud/image/upload/${publicId}`,
        bytes: body.length,
      };
    }),
  };
}
```
Replace with:
```ts
export interface MockCloudinaryOptions {
  /**
   * Override for `uploadBuffer`. If omitted, returns a happy
   * `{ publicId, secureUrl: 'https://res.cloudinary.com/test-cloud/image/upload/<id>', bytes, resourceType: 'image' }`.
   * Throw to simulate upload failure.
   */
  onUpload?: Mock;
}

export interface MockUploadResult {
  publicId: string;
  secureUrl: string;
  bytes: number;
  resourceType: string;
}

export interface MockCloudinaryClient {
  uploadBuffer: (
    publicId: string,
    body: Buffer,
    options?: { deliveryType?: 'authenticated' },
  ) => Promise<MockUploadResult>;
  getSignedDocumentUrl: (publicId: string, resourceType: string, expiresInSeconds?: number) => string;
  deleteAsset: (
    publicId: string,
    resourceType: string,
    options?: { deliveryType?: 'authenticated' },
  ) => Promise<void>;
}

/**
 * Build a mock Cloudinary uploader. Inject via:
 * `vi.mock('@/lib/server/upload/cloudinary-client', () => ({
 *   uploadBuffer: vi.fn((id, body, opts) => mockCloudinaryClient().uploadBuffer(id, body, opts)),
 *   getSignedDocumentUrl: vi.fn((id, rt, exp) => mockCloudinaryClient().getSignedDocumentUrl(id, rt, exp)),
 *   deleteAsset: vi.fn((id, rt, opts) => mockCloudinaryClient().deleteAsset(id, rt, opts)),
 *   StorageNotConfiguredError: class extends Error { ... },
 * }))`.
 */
export function mockCloudinaryClient(opts: MockCloudinaryOptions = {}): MockCloudinaryClient {
  return {
    uploadBuffer: vi.fn(async (publicId: string, body: Buffer) => {
      if (opts.onUpload) return (await opts.onUpload(publicId, body)) as MockUploadResult;
      return {
        publicId,
        secureUrl: `https://res.cloudinary.com/test-cloud/image/upload/${publicId}`,
        bytes: body.length,
        resourceType: 'image',
      };
    }),
    getSignedDocumentUrl: vi.fn(
      (publicId: string) => `https://res.cloudinary.com/test-cloud/authenticated/${publicId}?signed=1`,
    ),
    deleteAsset: vi.fn(async () => undefined),
  };
}
```

- [ ] **Step 6: Run the full existing upload test suite to confirm nothing broke**

Run: `pnpm --filter frontend exec vitest run src/app/api/upload/route.test.ts`
Expected: PASS, unchanged — `/api/upload` never passes `deliveryType`, so its behavior (and the extra `resourceType` field it now receives but ignores) is untouched.

- [ ] **Step 7: Write the failing test for the upload/list route**

Create `frontend/src/app/api/school/students/[id]/documents/route.test.ts`:
```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockCloudinaryClient } from '@/test-utils/cloudinary-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const cl = mockCloudinaryClient();

vi.mock('@/lib/server/upload/cloudinary-client', () => ({
  uploadBuffer: vi.fn((id: string, body: Buffer, opts?: { deliveryType?: 'authenticated' }) =>
    cl.uploadBuffer(id, body, opts),
  ),
  deleteAsset: vi.fn((id: string, rt: string, opts?: { deliveryType?: 'authenticated' }) =>
    cl.deleteAsset(id, rt, opts),
  ),
  StorageNotConfiguredError: class StorageNotConfiguredError extends Error {},
}));
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { GET, POST } from './route';

const authUser = { user: { sub: 'user_1', email: 'staff@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const params = { params: Promise.resolve({ id: 'student_1' }) };

function uploadReq(fields: { type: string; file?: File }) {
  const form = new FormData();
  form.set('type', fields.type);
  if (fields.file) form.set('file', fields.file);
  return new NextRequest('http://localhost/api/school/students/student_1/documents', {
    method: 'POST',
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
  vi.stubEnv('CLOUDINARY_API_KEY', 'key');
  vi.stubEnv('CLOUDINARY_API_SECRET', 'secret');
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(verifyCsrf).mockReturnValue(null);
  vi.mocked(resolveMySchool).mockResolvedValue(ownerSchool);
  prismaMock.student.findUnique.mockResolvedValue({
    id: 'student_1',
    schoolId: 'school_1',
  } as never);
});

describe('GET /api/school/students/[id]/documents', () => {
  it('returns 404 when the student does not belong to the caller school', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 'student_1',
      schoolId: 'other_school',
    } as never);

    const res = await GET(
      new NextRequest('http://localhost/api/school/students/student_1/documents'),
      params,
    );

    expect(res.status).toBe(404);
  });

  it('lists only the document types actually present, without fileKey', async () => {
    prismaMock.studentDocument.findMany.mockResolvedValue([
      {
        type: 'BIRTH_CERTIFICATE',
        fileName: 'acte.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        uploadedAt: new Date('2026-01-01'),
        fileKey: 'students/student_1/abc',
      },
    ] as never);

    const res = await GET(
      new NextRequest('http://localhost/api/school/students/student_1/documents'),
      params,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.documents).toEqual([
      {
        type: 'BIRTH_CERTIFICATE',
        fileName: 'acte.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        uploadedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(body)).not.toContain('students/student_1/abc');
  });
});

describe('POST /api/school/students/[id]/documents', () => {
  it('rejects a MIME type outside the local allowlist', async () => {
    const file = new File(['x'], 'evil.exe', { type: 'application/x-msdownload' });

    const res = await POST(uploadReq({ type: 'BIRTH_CERTIFICATE', file }), params);

    expect(res.status).toBe(415);
    expect(cl.uploadBuffer).not.toHaveBeenCalled();
  });

  it('rejects an invalid document type', async () => {
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });

    const res = await POST(uploadReq({ type: 'NOT_A_TYPE', file }), params);

    expect(res.status).toBe(400);
  });

  it('uploads with authenticated delivery, stores only fileKey, and never returns a secureUrl', async () => {
    const file = new File(['%PDF-1.4 fake'], 'acte.pdf', { type: 'application/pdf' });
    prismaMock.studentDocument.upsert.mockResolvedValue({
      type: 'BIRTH_CERTIFICATE',
      fileName: 'acte.pdf',
      mimeType: 'application/pdf',
      sizeBytes: file.size,
      uploadedAt: new Date('2026-01-01'),
    } as never);

    const res = await POST(uploadReq({ type: 'BIRTH_CERTIFICATE', file }), params);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(cl.uploadBuffer).toHaveBeenCalledWith(
      expect.stringContaining('students/student_1/'),
      expect.any(Buffer),
      { deliveryType: 'authenticated' },
    );
    expect(JSON.stringify(body)).not.toMatch(/secure_url|secureUrl|res\.cloudinary\.com/);
  });

  it('deletes the previous asset when replacing an existing document of the same type', async () => {
    const file = new File(['%PDF-1.4 v2'], 'acte-v2.pdf', { type: 'application/pdf' });
    prismaMock.studentDocument.findUnique.mockResolvedValue({
      fileKey: 'students/student_1/old-key',
      resourceType: 'raw',
    } as never);
    prismaMock.studentDocument.upsert.mockResolvedValue({
      type: 'BIRTH_CERTIFICATE',
      fileName: 'acte-v2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: file.size,
      uploadedAt: new Date('2026-01-02'),
    } as never);

    await POST(uploadReq({ type: 'BIRTH_CERTIFICATE', file }), params);

    expect(cl.deleteAsset).toHaveBeenCalledWith('students/student_1/old-key', 'raw', {
      deliveryType: 'authenticated',
    });
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/students/[id]/documents/route.test.ts`
Expected: FAIL — the route module does not exist yet.

- [ ] **Step 9: Implement the upload/list route**

Create `frontend/src/app/api/school/students/[id]/documents/route.ts`:
```ts
// POST /api/school/students/[id]/documents — upload (or replace) one of the
// student's 3 fixed administrative documents. GET — list which of the 3
// types are present, without ever exposing the Cloudinary fileKey.
// See docs/superpowers/specs/2026-09-02-dossiers-enrichis-design.md §4.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { deleteAsset, uploadBuffer } from '@/lib/server/upload/cloudinary-client';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';
import { sanitizeFilename } from '@/lib/server/upload/sanitize-filename';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DOCUMENT_TYPES = ['BIRTH_CERTIFICATE', 'VACCINATION_RECORD', 'PREVIOUS_SCHOOL_RECORD'] as const;
type DocumentType = (typeof DOCUMENT_TYPES)[number];
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_BYTES = 10 * 1024 * 1024;

async function assertOwnedStudent(id: string, schoolId: string) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student || student.schoolId !== schoolId) return null;
  return student;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'eleves', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;

    const { id } = await params;
    const student = await assertOwnedStudent(id, perm.mySchool.schoolId);
    if (!student) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rows = await prisma.studentDocument.findMany({
      where: { studentId: id },
      select: { type: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
    });

    return NextResponse.json(
      { documents: rows },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'eleves', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;

    const { id } = await params;
    const student = await assertOwnedStudent(id, perm.mySchool.schoolId);
    if (!student) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const form = await req.formData();
    const typeRaw = form.get('type');
    const file = form.get('file');

    if (typeof typeRaw !== 'string' || !DOCUMENT_TYPES.includes(typeRaw as DocumentType)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid document type' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const type = typeRaw as DocumentType;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'UPLOAD_MISSING_FILE', message: 'file field is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'FILE_TOO_LARGE', message: `Max ${MAX_BYTES} bytes` },
        { status: 413, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: 'INVALID_MIME', message: `MIME ${file.type} not allowed` },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { match, sniffed } = verifyMagicBytes(buf, file.type);
    if (sniffed && !match) {
      return NextResponse.json(
        { error: 'MAGIC_BYTE_MISMATCH', message: 'File bytes do not match declared MIME' },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.studentDocument.findUnique({
      where: { studentId_type: { studentId: id, type } },
      select: { fileKey: true, resourceType: true },
    });

    const publicId = `students/${id}/${type.toLowerCase()}-${Date.now()}`;
    const uploaded = await uploadBuffer(publicId, buf, { deliveryType: 'authenticated' });

    if (existing) {
      await deleteAsset(existing.fileKey, existing.resourceType, { deliveryType: 'authenticated' });
    }

    const row = await prisma.studentDocument.upsert({
      where: { studentId_type: { studentId: id, type } },
      create: {
        studentId: id,
        type,
        fileKey: uploaded.publicId,
        fileName: sanitizeFilename(file.name),
        mimeType: file.type,
        resourceType: uploaded.resourceType,
        sizeBytes: uploaded.bytes,
        uploadedById: auth.user.sub,
      },
      update: {
        fileKey: uploaded.publicId,
        fileName: sanitizeFilename(file.name),
        mimeType: file.type,
        resourceType: uploaded.resourceType,
        sizeBytes: uploaded.bytes,
        uploadedById: auth.user.sub,
        uploadedAt: new Date(),
      },
      select: { type: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
    });

    return NextResponse.json({ document: row }, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/students/[id]/documents/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 11: Write the failing test for the download route**

Create `frontend/src/app/api/school/students/[id]/documents/[type]/file/route.test.ts`:
```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockCloudinaryClient } from '@/test-utils/cloudinary-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const cl = mockCloudinaryClient();

vi.mock('@/lib/server/upload/cloudinary-client', () => ({
  getSignedDocumentUrl: vi.fn((id: string, rt: string, exp?: number) =>
    cl.getSignedDocumentUrl(id, rt, exp),
  ),
}));
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { GET } from './route';

const authUser = { user: { sub: 'user_1', email: 'staff@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const params = (type: string) => ({ params: Promise.resolve({ id: 'student_1', type }) });
const req = () => new NextRequest('http://localhost/api/school/students/student_1/documents/BIRTH_CERTIFICATE/file');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(resolveMySchool).mockResolvedValue(ownerSchool);
  prismaMock.student.findUnique.mockResolvedValue({ id: 'student_1', schoolId: 'school_1' } as never);
});

describe('GET /api/school/students/[id]/documents/[type]/file', () => {
  it('returns 400 for a type outside the fixed enum', async () => {
    const res = await GET(req(), params('NOT_A_TYPE'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the student does not belong to the caller school', async () => {
    prismaMock.student.findUnique.mockResolvedValue({ id: 'student_1', schoolId: 'other' } as never);
    const res = await GET(req(), params('BIRTH_CERTIFICATE'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when no document of that type has been uploaded', async () => {
    prismaMock.studentDocument.findUnique.mockResolvedValue(null);
    const res = await GET(req(), params('BIRTH_CERTIFICATE'));
    expect(res.status).toBe(404);
  });

  it('redirects to a freshly signed URL when the document exists', async () => {
    prismaMock.studentDocument.findUnique.mockResolvedValue({
      fileKey: 'students/student_1/birth_certificate-1',
      resourceType: 'raw',
    } as never);

    const res = await GET(req(), params('BIRTH_CERTIFICATE'));

    expect(res.status).toBe(302);
    // Matches the mock's own formula in cloudinary-mock.ts (`.../authenticated/${publicId}?signed=1`)
    // for the exact fileKey this test's mocked document row carries — not a
    // fresh call to the mock, which would need the real args to line up.
    expect(res.headers.get('location')).toBe(
      'https://res.cloudinary.com/test-cloud/authenticated/students/student_1/birth_certificate-1?signed=1',
    );
    expect(cl.getSignedDocumentUrl).toHaveBeenCalledWith('students/student_1/birth_certificate-1', 'raw', 300);
  });
});
```

- [ ] **Step 12: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/school/students/[id]/documents/[type]/file/route.test.ts"`
Expected: FAIL — the route module does not exist yet.

- [ ] **Step 13: Implement the download route**

Create `frontend/src/app/api/school/students/[id]/documents/[type]/file/route.ts`:
```ts
// GET /api/school/students/[id]/documents/[type]/file — the ONLY way to
// read a student's administrative document. Never returns a stored/public
// URL: generates a fresh short-lived Cloudinary signed URL and redirects.
// See docs/superpowers/specs/2026-09-02-dossiers-enrichis-design.md §4.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { getSignedDocumentUrl } from '@/lib/server/upload/cloudinary-client';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DOCUMENT_TYPES = ['BIRTH_CERTIFICATE', 'VACCINATION_RECORD', 'PREVIOUS_SCHOOL_RECORD'] as const;
type DocumentType = (typeof DOCUMENT_TYPES)[number];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'eleves', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;

    const { id, type: typeParam } = await params;
    if (!DOCUMENT_TYPES.includes(typeParam as DocumentType)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid document type' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student || student.schoolId !== perm.mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const doc = await prisma.studentDocument.findUnique({
      where: { studentId_type: { studentId: id, type: typeParam as DocumentType } },
      select: { fileKey: true, resourceType: true },
    });
    if (!doc) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Document not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Explicit 302: NextResponse.redirect() defaults to 307 when the status
    // is omitted, which is fine for a browser GET but not what the spec
    // documents — pin it so behavior doesn't depend on a framework default.
    const url = getSignedDocumentUrl(doc.fileKey, doc.resourceType, 300);
    return NextResponse.redirect(url, { status: 302, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 14: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/school/students/[id]/documents/[type]/file/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 15: Commit**

```bash
git add frontend/src/lib/server/upload/cloudinary-client.ts \
  frontend/src/lib/server/upload/cloudinary-client.test.ts \
  frontend/src/test-utils/cloudinary-mock.ts \
  "frontend/src/app/api/school/students/[id]/documents"
git commit -m "feat(eleves): confidential document upload/list/download routes"
```

---

### Task 3: Dossier élève & responsable — NISU, NIF, NIU, statut vital

**Files:**
- Modify: `frontend/src/app/api/school/students/route.ts`
- Modify: `frontend/src/app/api/school/students/route.test.ts`
- Modify: `frontend/src/app/api/school/students/[id]/route.ts`
- Modify: `frontend/src/app/api/school/students/[id]/route.test.ts`
- Modify: `frontend/src/app/(school)/eleves/types.ts`
- Modify: `frontend/src/app/(school)/eleves/StudentFormModal.tsx`
- Modify: `frontend/src/messages/fr/eleves.json`, `frontend/src/messages/en/eleves.json`, `frontend/src/messages/ht/eleves.json`

**Interfaces:**
- Consumes: `Student.nisu`, `Guardian.nif/niu/vitalStatus` (Task 1).
- Produces (consumed by Task 6's i18n parity check): new i18n keys `Eleves.form.schooling.nisu*`, `Eleves.form.guardians.nif*`, `Eleves.form.guardians.niu*`, `Eleves.form.guardians.vitalStatus*`.

- [ ] **Step 1: Add `nisu` and Guardian fields to both route schemas**

In `frontend/src/app/api/school/students/route.ts`, find:
```ts
const GuardianInput = z.object({
  name: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(1).max(40),
  phone: zPhone.nullable().optional(),
  email: zEmail.nullable().optional(),
  profession: z.string().trim().max(80).nullable().optional(),
  isPrimary: z.boolean().optional(),
});
```
Replace with:
```ts
const GuardianInput = z.object({
  name: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(1).max(40),
  phone: zPhone.nullable().optional(),
  email: zEmail.nullable().optional(),
  profession: z.string().trim().max(80).nullable().optional(),
  isPrimary: z.boolean().optional(),
  nif: z.string().trim().max(40).nullable().optional(),
  niu: z.string().trim().max(40).nullable().optional(),
  vitalStatus: z.enum(['VIVANT', 'DECEDE']).nullable().optional(),
});
```

Find (in the same file):
```ts
  previousSchool: z.string().trim().max(120).nullable().optional(),
  transferNumber: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  scholarship: z.boolean().optional(),
  status: z.enum(['ENROLLED', 'REPEATED_ABSENCES', 'SUSPENDED']).optional(),
});
```
Replace with:
```ts
  previousSchool: z.string().trim().max(120).nullable().optional(),
  transferNumber: z.string().trim().max(60).nullable().optional(),
  nisu: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  scholarship: z.boolean().optional(),
  status: z.enum(['ENROLLED', 'REPEATED_ABSENCES', 'SUSPENDED']).optional(),
});
```

In the same file's POST handler, find:
```ts
      if (parsed.data.guardians && parsed.data.guardians.length > 0) {
        await tx.guardian.createMany({
          data: parsed.data.guardians.map((g) => ({
            studentId: created.id,
            name: g.name,
            relationship: g.relationship,
            phone: g.phone ?? null,
            email: g.email ?? null,
            profession: g.profession ?? null,
            isPrimary: g.isPrimary ?? false,
          })),
        });
      }
```
Replace with:
```ts
      if (parsed.data.guardians && parsed.data.guardians.length > 0) {
        await tx.guardian.createMany({
          data: parsed.data.guardians.map((g) => ({
            studentId: created.id,
            name: g.name,
            relationship: g.relationship,
            phone: g.phone ?? null,
            email: g.email ?? null,
            profession: g.profession ?? null,
            isPrimary: g.isPrimary ?? false,
            nif: g.nif ?? null,
            niu: g.niu ?? null,
            vitalStatus: g.vitalStatus ?? null,
          })),
        });
      }
```

Apply the identical `GuardianInput` edit to `frontend/src/app/api/school/students/[id]/route.ts` (its `GuardianInput` schema is byte-identical to the one above — same find/replace).

That file's `UpdateStudentBody` has `status` positioned differently (right after `address`, not after `scholarship`), so the `nisu` insertion point is a separate find/replace. Find:
```ts
  previousSchool: z.string().trim().max(120).nullable().optional(),
  transferNumber: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  scholarship: z.boolean().optional(),
});
```
Replace with:
```ts
  previousSchool: z.string().trim().max(120).nullable().optional(),
  transferNumber: z.string().trim().max(60).nullable().optional(),
  nisu: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  scholarship: z.boolean().optional(),
});
```

In that same file, find the `guardians.createMany` call inside the `PATCH` transaction:
```ts
        if (guardians) {
          await tx.guardian.deleteMany({ where: { studentId: id } });
          if (guardians.length > 0) {
            await tx.guardian.createMany({
              data: guardians.map((g) => ({
                studentId: id,
                name: g.name,
                relationship: g.relationship,
                phone: g.phone ?? null,
                email: g.email ?? null,
                profession: g.profession ?? null,
                isPrimary: g.isPrimary ?? false,
              })),
            });
          }
        }
```
Replace with:
```ts
        if (guardians) {
          await tx.guardian.deleteMany({ where: { studentId: id } });
          if (guardians.length > 0) {
            await tx.guardian.createMany({
              data: guardians.map((g) => ({
                studentId: id,
                name: g.name,
                relationship: g.relationship,
                phone: g.phone ?? null,
                email: g.email ?? null,
                profession: g.profession ?? null,
                isPrimary: g.isPrimary ?? false,
                nif: g.nif ?? null,
                niu: g.niu ?? null,
                vitalStatus: g.vitalStatus ?? null,
              })),
            });
          }
        }
```

- [ ] **Step 2: Write the failing tests**

In `frontend/src/app/api/school/students/route.test.ts`, this new test belongs INSIDE the existing `describe('POST /api/school/students — grants du rôle personnalisé', ...)` block (it already has a nested `beforeEach` that mocks `resolveActiveAcademicYear`, `checkStudentLimit`, `prisma.student.count`, `prisma.class.findUnique`, `prisma.student.create` and `prisma.$transaction` — reuse all of that, add nothing extra). Add this `it` alongside the block's two existing tests:
```ts
it('persists nisu and guardian nif/niu/vitalStatus on creation', async () => {
  mockResolveMySchool.mockResolvedValue(ownerSchool);

  const res = await POST(
    new NextRequest('http://localhost/api/school/students', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Marie',
        lastName: 'Joseph',
        dateOfBirth: '2014-05-02',
        classId: 'cls_1',
        nisu: 'NISU-2026-0001',
        guardians: [{ name: 'Jean Joseph', relationship: 'Père', nif: 'NIF-1', niu: 'NIU-1', vitalStatus: 'VIVANT' }],
      }),
    }),
  );

  expect(res.status).toBe(201);
  const createArgs = prismaMock.student.create.mock.calls[0]?.[0] as {
    data: { nisu?: string };
  };
  expect(createArgs.data.nisu).toBe('NISU-2026-0001');
});
```

`frontend/src/app/api/school/students/[id]/route.test.ts` currently only mocks `@/lib/server/middleware` and `@/lib/server/school`, and only imports `GET` — `verifyCsrf` is never mocked there, so a `PATCH` test would hit the real CSRF check and fail before reaching any business logic. Fix the top of the file first.

Find:
```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { NextResponse } from 'next/server';
import { GET } from './route';

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const params = { params: Promise.resolve({ id: 's1' }) };
const req = () => new NextRequest('http://localhost/api/school/students/s1', { method: 'GET' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(resolveMySchool).mockResolvedValue(adminSchool);
});
```
Replace with:
```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { NextResponse } from 'next/server';
import { GET, PATCH } from './route';

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const params = { params: Promise.resolve({ id: 's1' }) };
const req = () => new NextRequest('http://localhost/api/school/students/s1', { method: 'GET' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(verifyCsrf).mockReturnValue(null);
  vi.mocked(resolveMySchool).mockResolvedValue(adminSchool);
});
```

Then add a new `describe` block (the file currently has none for `PATCH`):
```ts
describe('PATCH /api/school/students/[id]', () => {
  it('persists nisu and guardian nif/niu/vitalStatus', async () => {
    prismaMock.student.findUnique.mockResolvedValue({ id: 's1', schoolId: 'school_1' } as never);
    prismaMock.$transaction.mockImplementation((async (cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock)) as never);

    const res = await PATCH(
      new NextRequest('http://localhost/api/school/students/s1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nisu: 'NISU-2026-0002',
          guardians: [{ name: 'M', relationship: 'Mère', nif: 'NIF-2', niu: 'NIU-2', vitalStatus: 'DECEDE' }],
        }),
      }),
      params,
    );

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.student.update.mock.calls[0]?.[0] as { data: { nisu?: string } };
    expect(updateArgs.data.nisu).toBe('NISU-2026-0002');
    const createManyArgs = prismaMock.guardian.createMany.mock.calls[0]?.[0] as {
      data: { nif?: string; niu?: string; vitalStatus?: string }[];
    };
    expect(createManyArgs.data[0]).toMatchObject({ nif: 'NIF-2', niu: 'NIU-2', vitalStatus: 'DECEDE' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/students/route.test.ts "src/app/api/school/students/[id]/route.test.ts"`
Expected: FAIL — the new fields are stripped by the old schema / not mapped into the Prisma call yet.

- [ ] **Step 4: Verify the Step 1 edits are complete**

Re-read both route files after editing; confirm every place `GuardianInput`'s fields are spread into a Prisma `create`/`createMany` call now includes `nif`, `niu`, `vitalStatus`, and that `nisu` flows through `UpdateStudentBody`/`CreateStudentBody` unchanged by the generic `Object.fromEntries(Object.entries(rest).filter(...))` pattern already used in `[id]/route.ts` (no extra code needed there — new optional zod fields pass through automatically once declared).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/students/route.test.ts "src/app/api/school/students/[id]/route.test.ts"`
Expected: PASS.

- [ ] **Step 6: Update the frontend types**

In `frontend/src/app/(school)/eleves/types.ts`, find:
```ts
export interface GuardianData {
  id?: string;
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  profession: string | null;
  isPrimary: boolean;
}
```
Replace with:
```ts
export type GuardianVitalStatus = 'VIVANT' | 'DECEDE';

export interface GuardianData {
  id?: string;
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  profession: string | null;
  isPrimary: boolean;
  nif: string | null;
  niu: string | null;
  vitalStatus: GuardianVitalStatus | null;
}
```

Find:
```ts
  previousSchool: string | null;
  transferNumber: string | null;
  notes: string | null;
```
Replace with:
```ts
  previousSchool: string | null;
  transferNumber: string | null;
  nisu: string | null;
  notes: string | null;
```

- [ ] **Step 7: Update `StudentFormModal.tsx` — state, submit payload, guardian defaults**

Find:
```ts
const EMPTY_GUARDIAN: GuardianData = {
  name: '',
  relationship: 'Père',
  phone: '',
  email: '',
  profession: '',
  isPrimary: false,
};
```
Replace with:
```ts
const EMPTY_GUARDIAN: GuardianData = {
  name: '',
  relationship: 'Père',
  phone: '',
  email: '',
  profession: '',
  isPrimary: false,
  nif: '',
  niu: '',
  vitalStatus: null,
};
```

Find (in `interface FormState`):
```ts
  previousSchool: string;
  transferNumber: string;
  notes: string;
```
Replace with:
```ts
  previousSchool: string;
  transferNumber: string;
  nisu: string;
  notes: string;
```

Find (in `emptyForm`):
```ts
    previousSchool: '',
    transferNumber: '',
    notes: '',
```
Replace with:
```ts
    previousSchool: '',
    transferNumber: '',
    nisu: '',
    notes: '',
```

Find (in `toForm`):
```ts
    previousSchool: s.previousSchool ?? '',
    transferNumber: s.transferNumber ?? '',
    notes: s.notes ?? '',
```
Replace with:
```ts
    previousSchool: s.previousSchool ?? '',
    transferNumber: s.transferNumber ?? '',
    nisu: s.nisu ?? '',
    notes: s.notes ?? '',
```

Find (in the submit handler's `guardians` mapping):
```ts
        .map((g) => ({
          name: g.name,
          relationship: g.relationship,
          phone: g.phone || null,
          email: g.email || null,
          profession: g.profession || null,
          isPrimary: g.isPrimary,
        }));
```
Replace with:
```ts
        .map((g) => ({
          name: g.name,
          relationship: g.relationship,
          phone: g.phone || null,
          email: g.email || null,
          profession: g.profession || null,
          isPrimary: g.isPrimary,
          nif: g.nif || null,
          niu: g.niu || null,
          vitalStatus: g.vitalStatus,
        }));
```

Find (in the submit handler's `body` object):
```ts
        previousSchool: form.previousSchool.trim() || null,
        transferNumber: form.transferNumber.trim() || null,
        notes: form.notes.trim() || null,
```
Replace with:
```ts
        previousSchool: form.previousSchool.trim() || null,
        transferNumber: form.transferNumber.trim() || null,
        nisu: form.nisu.trim() || null,
        notes: form.notes.trim() || null,
```

- [ ] **Step 8: Add the NISU field to the "scolarite" step**

Find:
```tsx
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field
                      label={t('schooling.previousSchool')}
                      placeholder={t('schooling.previousSchoolPlaceholder')}
                      value={form.previousSchool}
                      onChange={(e) => patch({ previousSchool: e.target.value })}
                    />
                    <Field
                      label={t('schooling.transferNumber')}
                      placeholder={t('schooling.transferNumberPlaceholder')}
                      value={form.transferNumber}
                      onChange={(e) => patch({ transferNumber: e.target.value })}
                    />
                  </div>
```
Replace with:
```tsx
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field
                      label={t('schooling.previousSchool')}
                      placeholder={t('schooling.previousSchoolPlaceholder')}
                      value={form.previousSchool}
                      onChange={(e) => patch({ previousSchool: e.target.value })}
                    />
                    <Field
                      label={t('schooling.transferNumber')}
                      placeholder={t('schooling.transferNumberPlaceholder')}
                      value={form.transferNumber}
                      onChange={(e) => patch({ transferNumber: e.target.value })}
                    />
                  </div>
                  <Field
                    label={t('schooling.nisu')}
                    placeholder={t('schooling.nisuPlaceholder')}
                    value={form.nisu}
                    onChange={(e) => patch({ nisu: e.target.value })}
                  />
```

- [ ] **Step 9: Add NIF / NIU / statut vital to `GuardianFields`**

Find:
```ts
type GuardianFieldsT = (
  key:
    | 'guardians.fullName'
    | 'guardians.relationship'
    | 'guardians.phone'
    | 'guardians.email'
    | 'guardians.profession',
) => string;
```
Replace with:
```ts
type GuardianFieldsT = (
  key:
    | 'guardians.fullName'
    | 'guardians.relationship'
    | 'guardians.phone'
    | 'guardians.email'
    | 'guardians.profession'
    | 'guardians.nif'
    | 'guardians.nifPlaceholder'
    | 'guardians.niu'
    | 'guardians.niuPlaceholder'
    | 'guardians.vitalStatus'
    | 'guardians.vitalStatusOptions.VIVANT'
    | 'guardians.vitalStatusOptions.DECEDE',
) => string;
```

Find:
```tsx
      <Field
        label={t('guardians.profession')}
        value={value.profession ?? ''}
        onChange={(e) => onChange({ ...value, profession: e.target.value })}
      />
    </>
  );
```
Replace with:
```tsx
      <Field
        label={t('guardians.profession')}
        value={value.profession ?? ''}
        onChange={(e) => onChange({ ...value, profession: e.target.value })}
      />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field
          label={t('guardians.nif')}
          placeholder={t('guardians.nifPlaceholder')}
          value={value.nif ?? ''}
          onChange={(e) => onChange({ ...value, nif: e.target.value })}
        />
        <Field
          label={t('guardians.niu')}
          placeholder={t('guardians.niuPlaceholder')}
          value={value.niu ?? ''}
          onChange={(e) => onChange({ ...value, niu: e.target.value })}
        />
      </div>
      <Select
        label={t('guardians.vitalStatus')}
        value={value.vitalStatus ?? ''}
        onValueChange={(v) => onChange({ ...value, vitalStatus: v === '' ? null : (v as 'VIVANT' | 'DECEDE') })}
      >
        <SelectItem value="">—</SelectItem>
        <SelectItem value="VIVANT">{t('guardians.vitalStatusOptions.VIVANT')}</SelectItem>
        <SelectItem value="DECEDE">{t('guardians.vitalStatusOptions.DECEDE')}</SelectItem>
      </Select>
    </>
  );
```

- [ ] **Step 10: Add the i18n keys — `fr/eleves.json`**

In `frontend/src/messages/fr/eleves.json`, in `form.schooling`, add after `"transferNumberPlaceholder"`:
```json
    "nisu": "NISU",
    "nisuPlaceholder": "Numéro d'identification scolaire unique",
```
In `form.guardians`, add after `"profession"`:
```json
    "nif": "NIF",
    "nifPlaceholder": "Numéro d'identification fiscale",
    "niu": "NIU",
    "niuPlaceholder": "Numéro d'identifiant unique",
    "vitalStatus": "Statut",
    "vitalStatusOptions": {
      "VIVANT": "Vivant(e)",
      "DECEDE": "Décédé(e)"
    }
```

- [ ] **Step 11: Add the same keys — `en/eleves.json`**

In `form.schooling`:
```json
    "nisu": "NISU",
    "nisuPlaceholder": "Unique school identification number",
```
In `form.guardians`:
```json
    "nif": "NIF",
    "nifPlaceholder": "Tax identification number",
    "niu": "NIU",
    "niuPlaceholder": "Unique identification number",
    "vitalStatus": "Status",
    "vitalStatusOptions": {
      "VIVANT": "Living",
      "DECEDE": "Deceased"
    }
```

- [ ] **Step 12: Add the same keys — `ht/eleves.json`**

In `form.schooling`:
```json
    "nisu": "NISU",
    "nisuPlaceholder": "Nimewo idantifikasyon eskolè inik",
```
In `form.guardians`:
```json
    "nif": "NIF",
    "nifPlaceholder": "Nimewo idantifikasyon fiskal",
    "niu": "NIU",
    "niuPlaceholder": "Nimewo idantifikasyon inik",
    "vitalStatus": "Estati",
    "vitalStatusOptions": {
      "VIVANT": "Vivan(t)",
      "DECEDE": "Dekede"
    }
```

- [ ] **Step 13: Run the locale parity test**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS — same key set in all 3 files.

- [ ] **Step 14: Manual verification**

Start `pnpm dev`, open a student's edit form, confirm the NISU field appears in the "Scolarité" step and NIF/NIU/Statut appear under each guardian in "Tuteurs", save, and confirm the values persist after reopening the form.

- [ ] **Step 15: Commit**

```bash
git add frontend/src/app/api/school/students/route.ts frontend/src/app/api/school/students/route.test.ts \
  "frontend/src/app/api/school/students/[id]/route.ts" "frontend/src/app/api/school/students/[id]/route.test.ts" \
  "frontend/src/app/(school)/eleves/types.ts" "frontend/src/app/(school)/eleves/StudentFormModal.tsx" \
  frontend/src/messages/fr/eleves.json frontend/src/messages/en/eleves.json frontend/src/messages/ht/eleves.json
git commit -m "feat(eleves): add NISU and guardian NIF/NIU/vitalStatus fields"
```

---

### Task 4: Onglet Documents sur la fiche élève

**Files:**
- Create: `frontend/src/app/(school)/eleves/[id]/DocumentsTab.tsx`
- Modify: `frontend/src/app/(school)/eleves/[id]/page.tsx`
- Modify: `frontend/src/messages/fr/eleves.json`, `frontend/src/messages/en/eleves.json`, `frontend/src/messages/ht/eleves.json`

**Interfaces:**
- Consumes: `GET/POST /api/school/students/[id]/documents`, `GET /api/school/students/[id]/documents/[type]/file` (Task 2).

This UI-only task has no dedicated test file — none of the sibling tab components (`BulletinsTab.tsx`, `PresencesTab.tsx`, `AppreciationsTab.tsx`) have one either in this codebase; they are verified by the already-tested API routes underneath plus a manual dev-server check, which is Step 3 below.

- [ ] **Step 1: Create `DocumentsTab.tsx`**

Create `frontend/src/app/(school)/eleves/[id]/DocumentsTab.tsx`:
```tsx
'use client';

import { useRef, useState } from 'react';
import { Download, FileText, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { API_URL, COOKIE_PREFIX } from '@/lib/constants';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

const DOCUMENT_TYPES = ['BIRTH_CERTIFICATE', 'VACCINATION_RECORD', 'PREVIOUS_SCHOOL_RECORD'] as const;
type DocumentType = (typeof DOCUMENT_TYPES)[number];
const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_SIZE_MB = 10;
const CSRF_STORAGE_KEY = `${COOKIE_PREFIX}-csrf`;

interface DocumentRow {
  type: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

// `api()` (lib/api.ts) unconditionally JSON.stringifies its body — unusable
// for multipart uploads, same constraint documented on ImageUploader.tsx.
function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_STORAGE_KEY);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_STORAGE_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export function DocumentsTab({ studentId }: { studentId: string }) {
  const t = useTranslations('Eleves.documents');
  const { data, error: dataErr, refresh } = useApi<{ documents: DocumentRow[] }>(
    `/api/school/students/${studentId}/documents`,
  );
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const error = dataErr ? t('loadError') : null;

  const byType = new Map((data?.documents ?? []).map((d) => [d.type, d]));

  async function handleFile(type: DocumentType, file: File) {
    setRowError((prev) => ({ ...prev, [type]: '' }));
    if (!ACCEPT.split(',').includes(file.type)) {
      setRowError((prev) => ({ ...prev, [type]: t('unsupportedFormat') }));
      return;
    }
    if (file.size > MAX_SIZE_MB * 1_000_000) {
      setRowError((prev) => ({ ...prev, [type]: t('tooLarge', { maxSizeMb: MAX_SIZE_MB }) }));
      return;
    }

    setUploadingType(type);
    try {
      const form = new FormData();
      form.set('type', type);
      form.set('file', file);
      const csrf = readCsrfToken();
      const res = await fetch(`${API_URL}/api/school/students/${studentId}/documents`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : undefined,
        body: form,
      });
      if (!res.ok) throw new Error('upload failed');
      void refresh();
    } catch {
      setRowError((prev) => ({ ...prev, [type]: t('uploadError') }));
    } finally {
      setUploadingType(null);
    }
  }

  if (error) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <p className="text-sm text-destructive-foreground">{error}</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        {DOCUMENT_TYPES.map((type) => (
          <Card key={type} className="flex-row items-center gap-4 p-4.5">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {DOCUMENT_TYPES.map((type) => {
        const row = byType.get(type);
        const uploading = uploadingType === type;
        return (
          <Card key={type} className="flex-col gap-2 p-4.5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                <FileText size={17} />
              </div>
              <div className="flex min-w-[160px] flex-1 flex-col gap-0.5">
                <div className="text-caption font-bold text-foreground">{t(`types.${type}`)}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold ${
                      row ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {row ? t('provided') : t('missing')}
                  </span>
                  {row && <span>{row.fileName}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {row && (
                  <a
                    href={`${API_URL}/api/school/students/${studentId}/documents/${type}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-caption font-semibold text-foreground"
                  >
                    <Download size={13} />
                    {t('download')}
                  </a>
                )}
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => inputRefs.current[type]?.click()}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-caption font-semibold text-primary-foreground disabled:opacity-60"
                >
                  <Upload size={13} />
                  {uploading ? t('uploading') : row ? t('replace') : t('upload')}
                </button>
                <input
                  ref={(el) => {
                    inputRefs.current[type] = el;
                  }}
                  type="file"
                  accept={ACCEPT}
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleFile(type, file);
                  }}
                />
              </div>
            </div>
            {rowError[type] && (
              <p role="alert" className="text-xs text-destructive-foreground">
                {rowError[type]}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab into the student detail page**

In `frontend/src/app/(school)/eleves/[id]/page.tsx`, find:
```tsx
import { BulletinsTab } from './BulletinsTab';
```
Replace with:
```tsx
import { BulletinsTab } from './BulletinsTab';
import { DocumentsTab } from './DocumentsTab';
```

Find:
```ts
const TAB_KEYS = ['info', 'grades', 'attendance', 'appreciations', 'bulletins'] as const;
```
Replace with:
```ts
const TAB_KEYS = ['info', 'grades', 'attendance', 'appreciations', 'bulletins', 'documents'] as const;
```

Find:
```tsx
  const TABS = [
    { key: 'info' as const, label: t('tabs.info'), icon: UserCheck },
    { key: 'grades' as const, label: t('tabs.grades'), icon: BarChart2 },
    { key: 'attendance' as const, label: t('tabs.attendance'), icon: CalendarCheck },
    { key: 'appreciations' as const, label: t('tabs.appreciations'), icon: Star },
    { key: 'bulletins' as const, label: t('tabs.bulletins'), icon: FileText },
  ];
```
Replace with:
```tsx
  const TABS = [
    { key: 'info' as const, label: t('tabs.info'), icon: UserCheck },
    { key: 'grades' as const, label: t('tabs.grades'), icon: BarChart2 },
    { key: 'attendance' as const, label: t('tabs.attendance'), icon: CalendarCheck },
    { key: 'appreciations' as const, label: t('tabs.appreciations'), icon: Star },
    { key: 'bulletins' as const, label: t('tabs.bulletins'), icon: FileText },
    { key: 'documents' as const, label: t('tabs.documents'), icon: FolderOpen },
  ];
```

Find the `lucide-react` import line at the top of the file:
```tsx
import {
  ArrowLeft,
  Pencil,
  FileText,
  Hash,
  School as SchoolIcon,
  Calendar,
  UserCheck,
  BarChart2,
  CalendarCheck,
  Star,
} from 'lucide-react';
```
Replace with:
```tsx
import {
  ArrowLeft,
  Pencil,
  FileText,
  FolderOpen,
  Hash,
  School as SchoolIcon,
  Calendar,
  UserCheck,
  BarChart2,
  CalendarCheck,
  Star,
} from 'lucide-react';
```

Find:
```tsx
      {tab === 'bulletins' && <BulletinsTab studentId={student.id} />}
```
Replace with:
```tsx
      {tab === 'bulletins' && <BulletinsTab studentId={student.id} />}
      {tab === 'documents' && <DocumentsTab studentId={student.id} />}
```

- [ ] **Step 3: Add the i18n keys**

In `frontend/src/messages/fr/eleves.json`, in `profile.tabs`, add after `"bulletins"`:
```json
    "documents": "Documents"
```
Add a new top-level `documents` object to the file (a sibling of `profile`, `form`, etc.):
```json
  "documents": {
    "types": {
      "BIRTH_CERTIFICATE": "Acte de naissance",
      "VACCINATION_RECORD": "Carnet de vaccination",
      "PREVIOUS_SCHOOL_RECORD": "Dossier de l'ancienne école"
    },
    "provided": "Fourni",
    "missing": "Manquant",
    "upload": "Téléverser",
    "replace": "Remplacer",
    "uploading": "Envoi en cours",
    "download": "Télécharger",
    "unsupportedFormat": "Format non supporté. PDF, JPG ou PNG uniquement.",
    "tooLarge": "Fichier trop volumineux, {maxSizeMb} Mo maximum.",
    "uploadError": "L'envoi a échoué. Réessayez.",
    "loadError": "Impossible de charger les documents."
  },
```

In `frontend/src/messages/en/eleves.json`, `profile.tabs`:
```json
    "documents": "Documents"
```
New top-level `documents`:
```json
  "documents": {
    "types": {
      "BIRTH_CERTIFICATE": "Birth certificate",
      "VACCINATION_RECORD": "Vaccination record",
      "PREVIOUS_SCHOOL_RECORD": "Previous school record"
    },
    "provided": "Provided",
    "missing": "Missing",
    "upload": "Upload",
    "replace": "Replace",
    "uploading": "Uploading",
    "download": "Download",
    "unsupportedFormat": "Unsupported format. PDF, JPG or PNG only.",
    "tooLarge": "File too large, {maxSizeMb} MB maximum.",
    "uploadError": "Upload failed. Try again.",
    "loadError": "Could not load the documents."
  },
```

In `frontend/src/messages/ht/eleves.json`, `profile.tabs`:
```json
    "documents": "Dokiman"
```
New top-level `documents`:
```json
  "documents": {
    "types": {
      "BIRTH_CERTIFICATE": "Batistè",
      "VACCINATION_RECORD": "Kanè vaksinasyon",
      "PREVIOUS_SCHOOL_RECORD": "Dosye ansyen lekòl la"
    },
    "provided": "Bay",
    "missing": "Manke",
    "upload": "Voye",
    "replace": "Ranplase",
    "uploading": "N ap voye",
    "download": "Telechaje",
    "unsupportedFormat": "Fòma pa sipòte. Sèlman PDF, JPG oswa PNG.",
    "tooLarge": "Fichye twò gwo, {maxSizeMb} Mo maksimòm.",
    "uploadError": "Voye a echwe. Eseye ankò.",
    "loadError": "Pa ka chaje dokiman yo."
  },
```

- [ ] **Step 4: Run the locale parity test**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Start `pnpm dev`, open a student's detail page, click the new "Documents" tab, confirm all 3 rows show "Manquant", upload a small PDF for one row, confirm it flips to "Fourni" with a working "Télécharger" link that opens the file in a new tab, then upload a second file for the same row and confirm it replaces the first (only one row stays, new file name shown).

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/(school)/eleves/[id]/DocumentsTab.tsx" "frontend/src/app/(school)/eleves/[id]/page.tsx" \
  frontend/src/messages/fr/eleves.json frontend/src/messages/en/eleves.json frontend/src/messages/ht/eleves.json
git commit -m "feat(eleves): Documents tab on the student profile page"
```

---

### Task 5: Dossier professeur — lieu de naissance, diplôme, NIF, NIU

**Files:**
- Modify: `frontend/src/app/api/school/teachers/route.ts`
- Modify: `frontend/src/app/api/school/teachers/[id]/route.ts`
- Modify: `frontend/src/app/api/school/teachers/[id]/route.test.ts`
- Modify: `frontend/src/app/(school)/enseignants/types.ts`
- Modify: `frontend/src/app/(school)/enseignants/TeacherFormModal.tsx`
- Modify: `frontend/src/app/(school)/enseignants/[id]/page.tsx`
- Modify: `frontend/src/messages/fr/enseignants.json`, `frontend/src/messages/en/enseignants.json`, `frontend/src/messages/ht/enseignants.json`

**Interfaces:**
- Consumes: `Teacher.birthPlace/diploma/nif/niu` (Task 1); `Teacher.idNumber` no longer exists anywhere after this task.

`frontend/src/app/api/school/teachers/route.ts` has no existing test file (pre-existing gap, out of scope to backfill here) — its zod schema change is verified by `tsc` type-checking against the Task 1 Prisma types plus the manual check in Step 6.

- [ ] **Step 1: Replace `idNumber` in `CreateTeacherBody`**

In `frontend/src/app/api/school/teachers/route.ts`, find:
```ts
  idNumber: z.string().trim().max(60).nullable().optional(),
```
Replace with:
```ts
  birthPlace: z.string().trim().max(120).nullable().optional(),
  diploma: z.string().trim().max(120).nullable().optional(),
  nif: z.string().trim().max(40).nullable().optional(),
  niu: z.string().trim().max(40).nullable().optional(),
```

- [ ] **Step 2: Replace `idNumber` in `UpdateTeacherBody` and write the failing test**

In `frontend/src/app/api/school/teachers/[id]/route.ts`, find:
```ts
  idNumber: z.string().trim().max(60).nullable().optional(),
```
Replace with:
```ts
  birthPlace: z.string().trim().max(120).nullable().optional(),
  diploma: z.string().trim().max(120).nullable().optional(),
  nif: z.string().trim().max(40).nullable().optional(),
  niu: z.string().trim().max(40).nullable().optional(),
```

In `frontend/src/app/api/school/teachers/[id]/route.test.ts`, add a new `describe` block (this file currently only tests `DELETE` — `GET`/`PATCH` are also exported by `./route` and can be imported the same way):
```ts
import { GET, PATCH, DELETE } from './route';
```
(replace the existing `import { DELETE } from './route';` line with the one above), then add:
```ts
describe('PATCH /api/school/teachers/[id]', () => {
  const patchReq = (body: unknown) =>
    new NextRequest('http://localhost/api/school/teachers/t1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('persists birthPlace, diploma, nif and niu', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({ id: 't1', schoolId: 'school_1' } as never);
    prismaMock.teacher.update.mockResolvedValue({ id: 't1' } as never);

    const res = await PATCH(
      patchReq({ birthPlace: 'Jacmel', diploma: 'Licence en Pédagogie', nif: 'NIF-9', niu: 'NIU-9' }),
      params,
    );

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.teacher.update.mock.calls[0]?.[0] as {
      data: { birthPlace?: string; diploma?: string; nif?: string; niu?: string };
    };
    expect(updateArgs.data).toMatchObject({
      birthPlace: 'Jacmel',
      diploma: 'Licence en Pédagogie',
      nif: 'NIF-9',
      niu: 'NIU-9',
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/school/teachers/[id]/route.test.ts"`
Expected: FAIL — before Step 1/2's schema edit, `zod` strips `birthPlace`/`diploma`/`nif`/`niu` as unrecognized keys are simply ignored (not rejected) by the old `UpdateTeacherBody`, so `updateArgs.data` will not contain them and the `toMatchObject` assertion fails. No extra mock setup is needed beyond what Step 2 added — this file's existing top-level `beforeEach` already sets `vi.mocked(requireAuth).mockResolvedValue(authUser)`, `vi.mocked(verifyCsrf).mockReturnValue(null)` and `vi.mocked(resolveMySchool).mockResolvedValue(adminSchool)`, which the new `describe('PATCH ...', ...)` block reuses as-is.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/school/teachers/[id]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Update the frontend type**

In `frontend/src/app/(school)/enseignants/types.ts`, find:
```ts
  idNumber: string | null;
```
Replace with:
```ts
  birthPlace: string | null;
  diploma: string | null;
  nif: string | null;
  niu: string | null;
```

- [ ] **Step 6: Update `TeacherFormModal.tsx`**

Find (in `interface FormState`):
```ts
  idNumber: string;
```
Replace with:
```ts
  birthPlace: string;
  diploma: string;
  nif: string;
  niu: string;
```

Find (in `EMPTY_FORM`):
```ts
  idNumber: '',
```
Replace with:
```ts
  birthPlace: '',
  diploma: '',
  nif: '',
  niu: '',
```

Find (in `toForm`):
```ts
    idNumber: t.idNumber ?? '',
```
Replace with:
```ts
    birthPlace: t.birthPlace ?? '',
    diploma: t.diploma ?? '',
    nif: t.nif ?? '',
    niu: t.niu ?? '',
```

Find (in the submit handler's body object):
```ts
        idNumber: form.idNumber.trim() || null,
```
Replace with:
```ts
        birthPlace: form.birthPlace.trim() || null,
        diploma: form.diploma.trim() || null,
        nif: form.nif.trim() || null,
        niu: form.niu.trim() || null,
```

Find the identity-step JSX:
```tsx
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label={t('identity.nationality')}
                    placeholder={t('identity.nationalityPlaceholder')}
                    value={form.nationality}
                    onChange={(e) => patch({ nationality: e.target.value })}
                  />
                  <Field
                    label={t('identity.idNumber')}
                    placeholder={t('identity.idNumberPlaceholder')}
                    value={form.idNumber}
                    onChange={(e) => patch({ idNumber: e.target.value })}
                  />
                </div>
```
Replace with:
```tsx
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label={t('identity.nationality')}
                    placeholder={t('identity.nationalityPlaceholder')}
                    value={form.nationality}
                    onChange={(e) => patch({ nationality: e.target.value })}
                  />
                  <Field
                    label={t('identity.birthPlace')}
                    placeholder={t('identity.birthPlacePlaceholder')}
                    value={form.birthPlace}
                    onChange={(e) => patch({ birthPlace: e.target.value })}
                  />
                </div>
                <Field
                  label={t('identity.diploma')}
                  placeholder={t('identity.diplomaPlaceholder')}
                  value={form.diploma}
                  onChange={(e) => patch({ diploma: e.target.value })}
                />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field
                    label={t('identity.nif')}
                    placeholder={t('identity.nifPlaceholder')}
                    value={form.nif}
                    onChange={(e) => patch({ nif: e.target.value })}
                  />
                  <Field
                    label={t('identity.niu')}
                    placeholder={t('identity.niuPlaceholder')}
                    value={form.niu}
                    onChange={(e) => patch({ niu: e.target.value })}
                  />
                </div>
```

- [ ] **Step 7: Update the teacher detail page**

In `frontend/src/app/(school)/enseignants/[id]/page.tsx`, find:
```tsx
                {teacher.idNumber && (
                  <span className="flex items-center gap-1">
                    <Hash size={12} />
                    {teacher.idNumber}
                  </span>
                )}
```
Replace with:
```tsx
                {teacher.nif && (
                  <span className="flex items-center gap-1">
                    <Hash size={12} />
                    {teacher.nif}
                  </span>
                )}
```

Find:
```tsx
            <InfoRow label={t('fields.idNumber')} value={teacher.idNumber ?? '—'} />
```
Replace with:
```tsx
            <InfoRow label={t('fields.birthPlace')} value={teacher.birthPlace ?? '—'} />
            <InfoRow label={t('fields.diploma')} value={teacher.diploma ?? '—'} />
            <InfoRow label={t('fields.nif')} value={teacher.nif ?? '—'} />
            <InfoRow label={t('fields.niu')} value={teacher.niu ?? '—'} />
```

- [ ] **Step 8: Update i18n — `fr/enseignants.json`**

In `form.identity`, find:
```json
    "idNumber": "Numéro d'identification",
    "idNumberPlaceholder": "ex: NIF-2024-0042"
```
Replace with:
```json
    "birthPlace": "Lieu de naissance",
    "birthPlacePlaceholder": "ex: Port-au-Prince",
    "diploma": "Diplôme",
    "diplomaPlaceholder": "ex: Licence en Sciences de l'Éducation",
    "nif": "NIF",
    "nifPlaceholder": "Numéro d'identification fiscale",
    "niu": "NIU",
    "niuPlaceholder": "Numéro d'identifiant unique"
```

In `profile.fields`, find:
```json
    "idNumber": "N° d'identification",
```
Replace with:
```json
    "birthPlace": "Lieu de naissance",
    "diploma": "Diplôme",
    "nif": "NIF",
    "niu": "NIU",
```

- [ ] **Step 9: Update i18n — `en/enseignants.json`**

`form.identity`:
```json
    "birthPlace": "Place of birth",
    "birthPlacePlaceholder": "e.g. Port-au-Prince",
    "diploma": "Diploma",
    "diplomaPlaceholder": "e.g. Bachelor's in Education",
    "nif": "NIF",
    "nifPlaceholder": "Tax identification number",
    "niu": "NIU",
    "niuPlaceholder": "Unique identification number"
```
`profile.fields`:
```json
    "birthPlace": "Place of birth",
    "diploma": "Diploma",
    "nif": "NIF",
    "niu": "NIU",
```

- [ ] **Step 10: Update i18n — `ht/enseignants.json`**

`form.identity`:
```json
    "birthPlace": "Kote li fèt",
    "birthPlacePlaceholder": "egz: Pòtoprens",
    "diploma": "Diplòm",
    "diplomaPlaceholder": "egz: Lisans an Syans Edikasyon",
    "nif": "NIF",
    "nifPlaceholder": "Nimewo idantifikasyon fiskal",
    "niu": "NIU",
    "niuPlaceholder": "Nimewo idantifikasyon inik"
```
`profile.fields`:
```json
    "birthPlace": "Kote li fèt",
    "diploma": "Diplòm",
    "nif": "NIF",
    "niu": "NIU",
```

- [ ] **Step 11: Run the locale parity test and the teacher route tests**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts "src/app/api/school/teachers/[id]/route.test.ts"`
Expected: PASS.

- [ ] **Step 12: Run a full TypeScript check**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: no errors — this is the real verification that every `teacher.idNumber` reference in the codebase was updated (a stale reference would fail to compile against the Task 1 schema, since the Prisma Client no longer has that field).

- [ ] **Step 13: Manual verification**

Start `pnpm dev`, open a teacher's edit form, confirm "Lieu de naissance", "Diplôme", "NIF" and "NIU" appear in the "Identité" step in place of the old single field, save, reopen, and confirm the teacher detail page shows all 4 new fields and the header badge now shows the NIF instead of the old generic ID.

- [ ] **Step 14: Commit**

```bash
git add frontend/src/app/api/school/teachers/route.ts "frontend/src/app/api/school/teachers/[id]/route.ts" \
  "frontend/src/app/api/school/teachers/[id]/route.test.ts" "frontend/src/app/(school)/enseignants/types.ts" \
  "frontend/src/app/(school)/enseignants/TeacherFormModal.tsx" "frontend/src/app/(school)/enseignants/[id]/page.tsx" \
  frontend/src/messages/fr/enseignants.json frontend/src/messages/en/enseignants.json frontend/src/messages/ht/enseignants.json
git commit -m "feat(enseignants): replace idNumber with birthPlace/diploma/NIF/NIU"
```

---

### Task 6: Vérification finale

**Files:** none (verification only).

- [ ] **Step 1: Full format, lint, typecheck, test gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all four pass with zero errors. This is the same gate CLAUDE.md requires before any commit lands on `develop` — running it once at the end of the branch catches any cross-task drift (e.g. a field renamed in Task 1 but missed in a later task).

- [ ] **Step 2: Grep for any leftover `idNumber` reference**

Run: `grep -rn "idNumber" frontend/src --include="*.ts" --include="*.tsx"`
Expected: no output. Any hit here is a missed Task 5 spot and must be fixed before finishing the branch.

- [ ] **Step 3: Grep for any place a document `secure_url`/`secureUrl` could leak**

Run: `grep -rn "secure_url\|secureUrl" "frontend/src/app/api/school/students/[id]/documents"`
Expected: no output — confirms the confidentiality invariant from spec §1 decision 3 held across every file touched in Task 2.

- [ ] **Step 4: Report**

Summarize for the user: schema fields added, new document routes, new Documents tab, teacher idNumber migration, i18n coverage across fr/en/ht, and that the migration (`37_dossiers_enrichis`) is written but NOT YET applied to the shared dev database — that happens once, separately, at merge time (per Global Constraints above).
