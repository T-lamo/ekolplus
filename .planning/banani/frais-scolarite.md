# Frais & Scolarité — Banani → Next.js

4 screens fetched together (one Banani flow, one feature): `Payment Configuration`, `Fee Management`, `Relances Impayés`, `Payment Registration`. Written as one consolidated plan (like `epic-4-data-model.md`) since all 4 share one data model and one tab bar.

## Source
- Banani flow: "Separate Screen Regen" (`2oB_n5kLBeuy`)
- `Payment Configuration` — `FNOLQsKhAmo_`
- `Fee Management` — `RAnupxe6a5Ab`
- `Relances Impayés` — `VlaeuSgf9ime`
- `Payment Registration` — `snppTjYHCGun` (a modal, not a page)
- Fetched: 2026-08-14

## Decisions confirmed with user (batched question, all answered)
- **Relances channel (SMS/WhatsApp/email)**: "Tout en stub pour l'instant" — no provider wired this pass. Every send button (SMS, WhatsApp, and the bulk "Rappel groupé") shows a `toast('… — bientôt disponible', 'info')`, same precedent as Grade Notebook's/Appréciations' stubbed actions. Nothing is actually delivered anywhere.
  - **Superseded 2026-08-14**: Twilio WhatsApp wired for real (see the WhatsApp integration thread — `lib/server/whatsapp/twilio.ts`, cron dispatch in `lib/server/fees/reminders.ts`, manual send route `api/school/fees/students/[id]/send-whatsapp`). Per the user's explicit call, SMS/email are dropped from the UI entirely (not just left stubbed) — WhatsApp is the only communication channel for now. All SMS-labeled buttons removed from `/scolarite/paiements`; `/scolarite/relances`' row "Envoyer un rappel" now calls the real WhatsApp endpoint (renamed "Envoyer rappel WhatsApp"). The bulk "Rappel groupé (N)" on `/scolarite/relances` is still a stub — it was never SMS-specific and wiring real bulk sending is separate, unrequested scope.
- **Auto-reminder cron**: "Oui, cron réel" — build a real daily Vercel Cron. See "Cron design" below for how this is reconciled with the stub-channel answer (flagged explicitly, not silently resolved).
- **Routes**: 3 separate routes under `/scolarite/*`, not one tabbed page.
- **Exports**: real CSV via the existing `exportToCsv` (`src/lib/csv-export.ts`) for every "Exporter"/"Exporter Excel"/"Exporter la liste" button. "Exporter PDF" → `window.print()`, same precedent as Bulletins/Appréciations.

## Assumption flagged for veto (not asked, reasoned default)
The cron's **eligibility/scheduling logic is real** (correctly finds which students are due a reminder, per-school automation settings, proper dedup) but its **dispatch step is a stub** — there is no provider to actually send anything, per the "tout en stub" answer. It still writes a `FeeReminderLog` row per (student, tranche, rule) so the UI's "Dernier rappel" column and "Rappels envoyés" KPI are populated with real, meaningful data (when the system *would* have reminded them) rather than staying empty/fake — but no SMS/WhatsApp/email is actually delivered. If this reads as misleading once you see it running, say so and I'll gate the log-write behind an explicit "simulate sends" flag instead.

## Data model (new)

```prisma
model FeeStructure {
  id              String   @id @default(cuid())
  schoolId        String
  school          School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  classId         String
  class           Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  totalAmount     Int      // annual total, HTG — integer, no decimals (same convention as FCFA elsewhere)
  registrationFee Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tranches FeeTranche[]

  @@unique([classId]) // Class is already year-scoped (@@unique([academicYearId, name])) — no separate academicYearId needed here
}

model FeeTranche {
  id                   String   @id @default(cuid())
  feeStructureId       String
  feeStructure         FeeStructure @relation(fields: [feeStructureId], references: [id], onDelete: Cascade)
  order                Int      // 1, 2, 3…
  label                String   // "1ère Tranche - Octobre"
  amount               Int      // HTG
  dueDate              DateTime
  latePenaltyPercent   Int?     // e.g. 5 — null = "Aucune pénalité" (Tranche 2 in the mock)
  latePenaltyGraceDays Int?     // grace period before the penalty applies

  payments FeePayment[]
  disputes FeeDispute[]

  @@unique([feeStructureId, order])
}

enum FeePaymentMethod {
  ESPECES
  MONCASH
  NATCASH
  CHEQUE
  VIREMENT
}

// Ledger, not a per-tranche single row — a tranche can be paid across
// multiple partial entries (the mock's "1.5/3" fraction on Claudia
// Pierre-Louis only makes sense if paid amounts accumulate).
model FeePayment {
  id            String            @id @default(cuid())
  schoolId      String
  school        School            @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  studentId     String
  student       Student           @relation(fields: [studentId], references: [id], onDelete: Cascade)
  feeTrancheId  String
  feeTranche    FeeTranche        @relation(fields: [feeTrancheId], references: [id], onDelete: Cascade)
  amount        Int               // principal, HTG
  penaltyAmount Int               @default(0)
  method        FeePaymentMethod
  reference     String?
  notes         String?
  paidAt        DateTime          @default(now())
  recordedById  String
  recordedBy    User              @relation(fields: [recordedById], references: [id])
  createdAt     DateTime          @default(now())

  @@index([studentId, feeTrancheId])
}

// "Marquer comme litigieux" — a real workflow item (open/resolve), not a
// bare boolean, since Banani's own copy implies an ongoing state ("litigieux"
// until someone resolves it), matching this app's general preference for
// structured records over flags.
model FeeDispute {
  id           String     @id @default(cuid())
  studentId    String
  student      Student    @relation(fields: [studentId], references: [id], onDelete: Cascade)
  feeTrancheId String
  feeTranche   FeeTranche @relation(fields: [feeTrancheId], references: [id], onDelete: Cascade)
  reason       String?
  openedById   String
  openedBy     User       @relation(fields: [openedById], references: [id])
  openedAt     DateTime   @default(now())
  resolvedAt   DateTime?

  @@index([studentId, feeTrancheId])
}

// One row per school. Global toggle (Payment Configuration's "Rappels
// automatiques") gates the cron entirely; the 4 sub-rules (Relances'
// "Automatisation" card) gate which specific rule fires once the school is on.
model FeeAutomationSettings {
  id                      String  @id @default(cuid())
  schoolId                String  @unique
  school                  School  @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  lateFeeEnabled          Boolean @default(true)  // "Pénalités de retard" — gates penalty auto-calc in Payment Registration
  autoRemindersEnabled    Boolean @default(false) // master switch
  reminderBefore5Days     Boolean @default(true)
  reminderOnDueDate       Boolean @default(true)
  reminderWeeklyOverdue   Boolean @default(false)
  reminderCriticalOverdue Boolean @default(true)
  currency                String  @default("HTG")
}

enum FeeReminderRule {
  BEFORE_5_DAYS
  DUE_DATE
  WEEKLY_OVERDUE
  CRITICAL_OVERDUE
}

// Cron dedup + "Dernier rappel" column source. channel is always "stub" this
// pass (see flagged assumption above) — kept as a real column so wiring a
// real provider later is additive, not a schema change.
model FeeReminderLog {
  id           String          @id @default(cuid())
  studentId    String
  student      Student         @relation(fields: [studentId], references: [id], onDelete: Cascade)
  feeTrancheId String
  feeTranche   FeeTranche      @relation(fields: [feeTrancheId], references: [id], onDelete: Cascade)
  rule         FeeReminderRule
  channel      String          @default("stub")
  sentAt       DateTime        @default(now())

  @@index([studentId, feeTrancheId, rule])
}
```

Migration via the established `--create-only` → rename to next `NN_name` → `migrate deploy` workflow (per CLAUDE.md / this repo's recurring lesson).

### Status computation (derived, never stored — same precedent as `Term.status`)
- **Per-tranche progress**: `min(sum(FeePayment.amount for tranche) / tranche.amount, 1)` — this is what produces the mock's fractional `1.5/3`.
- **Per-tranche status**: `PAID` (progress ≥ 1) / `PARTIAL` (0 < progress < 1) / `OVERDUE` (progress < 1 AND `now > dueDate`) / `UPCOMING` (progress = 0, not yet due).
- **Per-student overall status** (Fee Management's `Statut` column): `À jour` (all tranches PAID) / `Partiel` (some payment exists, no tranche OVERDUE) / `En retard` (any tranche OVERDUE) / `Non payé` (zero payments anywhere, nothing overdue yet — a very new tranche schedule).
- **Late penalty**: on `POST /fee-payments`, if `now > tranche.dueDate + latePenaltyGraceDays` and `latePenaltyPercent` set and `FeeAutomationSettings.lateFeeEnabled`, auto-add `penaltyAmount = round(tranche.amount * latePenaltyPercent / 100)` — matches the modal's `HTG 750 (5%)` on a `HTG 15,000` tranche exactly.
- Student's class (needed to resolve their `FeeStructure`) comes from their current `Enrollment` for the school's active `AcademicYear` — same resolution pattern already used by grades/attendance.

## Routes & navigation
- `/scolarite/paiements` — Fee Management (default landing, "Suivi des paiements")
- `/scolarite/relances` — Relances Impayés
- `/scolarite/configuration` — Payment Configuration
- Shared 3-item tab bar (reuse `Tabs` component, but `router.push`-driven since these are real routes, not `?tab=` state — matches the user's route-structure answer)
- **Sidebar**: add `Frais & Scolarité` (icon `Wallet`) to the existing **Principal** group, after `Enseignants`, pointing to `/scolarite/paiements` — Banani's own mock nav groups these differently, but its mock nav is incomplete (missing Affectations/Coefficients) so it's not a reliable IA source; adding one link to the existing, working `Principal` group is the lower-risk call. Flagging this placement — easy to move if you'd rather it live elsewhere.

## Screen 1 — Payment Configuration (`/scolarite/configuration`)
- **NEW** `ClassFeePicker` — left panel: class list with search, `Configuré`/`En attente` badges, selection drives the right panel. Reuses the search+filter pattern already used by `TeacherPicker`.
- **NEW** `GlobalFeeSettingsCard` — the 2 toggles + currency row, backed by `FeeAutomationSettings` (`lateFeeEnabled`, `autoRemindersEnabled`, `currency`).
- **NEW** `TrancheBuilder` — the segmented % progress bar + N tranche cards + "Ajouter une tranche". Percent-of-total is derived (`amount / totalAmount`), not stored separately, to avoid it drifting out of sync with `amount`.
- **REUSE** `Switch`, `Field`, `Button`, `Card`, `Badge`-style pills (already have equivalents in `AnneeScolaireTab`'s status badges).
- **"Copier depuis une classe"**: real feature (cheap — clone an existing `FeeStructure`+`FeeTranche[]` into the target class), not a stub.
- Empty state (class with no `FeeStructure` yet): right panel shows a clean "Aucune configuration — définissez le montant total pour commencer" prompt instead of an empty tranche builder.

## Screen 2 — Fee Management (`/scolarite/paiements`)
- **NEW** `FeeKpiRow` (4 cards, 2 with progress bars) — reuse the `kpi-card`-style already established for other dashboards in this app if one exists, else new small primitive.
- **NEW** `OverdueAlertBanner` — the warning banner ("14 élèves en retard…") — computed live from the status logic above, not hardcoded.
- **NEW** `FeeStatusTable` — columns `Élève | Classe | Total dû | Payé | Reste à payer | Statut | Tranches | Actions`; search + class/status/tranche filters; pagination (reuse existing pagination pattern from Élèves/Enseignants lists).
- **Row actions dropdown** (reuse `ActionMenu`): `Enregistrer un paiement` (opens the Payment Registration modal — real), `Envoyer rappel SMS` / `Envoyer WhatsApp` (stub toast), `Voir l'historique` (real — student's `FeePayment` list, could deep-link to a simple history modal or the student profile), `Imprimer le reçu` (real, `window.print()` on the last payment's receipt view).
- **Exporter**: real CSV of the current filtered table.

## Screen 3 — Relances Impayés (`/scolarite/relances`)
- **NEW** `OverdueTable` with row checkboxes + bulk selection, same columns as documented in the fetch (`Élève | Classe | Tranche | Montant dû | Retard | Statut | Dernier rappel | Actions`). Only ever shows tranches with status `OVERDUE`.
- **REUSE** `FeeKpiRow` pattern for this screen's 4 KPIs.
- **NEW** `AutomationSettingsCard` — the 4 rule toggles, backed by `FeeAutomationSettings`.
- **NEW** `OverdueByClassCard` — simple grouped count, derived live.
- Row actions add `Marquer comme litigieux` (opens a small reason-prompt, creates a `FeeDispute`) alongside the same 3 actions as Fee Management's row menu.
- Bulk `Rappel groupé (N)` and per-row SMS/WhatsApp: stub toast, per the confirmed answer.
- `Retard` = today − `tranche.dueDate` in days. `Critique` badge when > 30 days (matches the KPI's "Retard critique" definition), `Récent` when ≤ 14 days (reasoned threshold — Banani's mock doesn't state the exact cutoff; flagging this as my own reasonable default, easy to adjust), `En retard` in between.

## Screen 4 — Payment Registration (Modal)
- **NEW** `PaymentRegistrationModal` (reuses the existing `Modal` primitive) — opened from either table's row action, receives `studentId` (+ optional `preselectedTrancheId`).
- Sections: student identity + solde-dû chip (live query), tranche selector (radio cards, shows `Payée`/`En retard`/`À venir` per tranche — reuse the same badge styling already established, not Banani's one-off inline `style=`), auto-shown late-penalty banner when the selected tranche is overdue and `lateFeeEnabled`, amount/date/reference/notes fields, payment-method picker (5 options, icons `banknote`/`smartphone`/`smartphone`/`file-text`/`building-2`), live total summary (principal + penalty − nothing yet paid → remaining balance).
- `Confirmer le paiement` → `POST /api/school/fees/payments` (creates the `FeePayment` row, transactional). `Enregistrer & Imprimer le reçu` → same POST, then triggers `window.print()` on a receipt view.

## API surface (new)
- `GET/POST /api/school/fees/structures` — per-class fee structure + tranches (list + create)
- `GET/PATCH/DELETE /api/school/fees/structures/[classId]` — read/update one class's structure+tranches; `POST .../copy-from` for "Copier depuis une classe"
- `GET /api/school/fees/overview` — the Fee Management read model (per-student aggregates, KPIs, filters)
- `GET /api/school/fees/overdue` — the Relances read model (overdue-only rows, KPIs, by-class breakdown)
- `POST /api/school/fees/payments` — register a payment (the modal's submit)
- `GET /api/school/fees/students/[id]/history` — a student's full payment ledger
- `POST /api/school/fees/disputes`, `PATCH /api/school/fees/disputes/[id]` (resolve)
- `GET/PATCH /api/school/fees/automation-settings`
- `app/api/cron/fee-reminders/route.ts` — new cron, `verifyCronSecret` gated, added to `vercel.json`

## Responsive plan
- **375px**: KPI cards stack 1-col; tables become horizontally scrollable within `overflow-x-auto` (existing app convention, e.g. Grade Notebook's sticky-column table) rather than reflowing to cards, for consistency with every other data table in this app; Payment Configuration's 2-col (class list / editor) stacks to a single column with the class list collapsing to a `Select` dropdown above the editor; the Payment Registration modal's fields stay single-column (already are in Banani).
- **md (768px+)**: Payment Configuration's 2-col layout resumes; tranche cards go from 1 to a tighter single-column list (they're already fairly wide, no 2-col grid needed).
- **lg (1024px+)**: full Banani desktop parity — KPI cards in a 4-col row, table toolbar filters inline.

## Copy / i18n
All French strings already captured verbatim in the fetch — will be added to `constants.ts` under a new `FEES` export, following the existing per-feature grouping convention (`AUTH_LOGIN`, `ADMIN_CREATE_SCHOOL`, etc.).

## Implementation checklist
- [x] Schema: `FeeStructure`/`FeeTranche`/`FeePayment`/`FeeDispute`/`FeeAutomationSettings`/`FeeReminderLog` + migration
- [x] `constants.ts` FEES copy block
- [x] API routes (structures, overview, overdue, payments, history, disputes, automation-settings)
- [x] `app/api/cron/fee-reminders/route.ts` + `vercel.json` entry
- [x] Sidebar: add `Frais & Scolarité` to Principal group
- [x] `/scolarite/configuration` — Payment Configuration screen
- [x] `/scolarite/paiements` — Fee Management screen
- [x] `/scolarite/relances` — Relances Impayés screen
- [x] `PaymentRegistrationModal` (shared across paiements/relances)
- [x] 375 / 768 / 1280 checks, format/lint/typecheck/build/test, real E2E — see STATUS.md for the 2 layout bugs found and fixed during this pass
