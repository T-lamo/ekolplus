# EkolPlus — Banani → izi kit implementation overview

Fetched: 2026-08-11 · Banani flow: "Separate Screen Regen" (`2oB_n5kLBeuy`) · 28 screens selected · Theme: "Lavender SaaS" (violet `#6C2BD9`/`#6C4CFF`, dark sidebar `#16102E`, Inter, radii 4–12px)

Raw fetch cached at: `/home/amos-dorceus/.claude/projects/-home-amos-dorceus-Documents-SaaSManagement-ekolplus2/bc7226a2-744f-4cd9-bbb7-6ec4584ca0f1/tool-results/mcp-banani-banani_get_selected_designs-1786462332034.txt` (1.3MB — re-parse from here instead of re-fetching from Banani unless the user says the designs changed).

## What this product is

**EkolPlus / EkolSuite** — a multi-tenant SaaS for school administration in French-speaking Africa: class/subject configuration, grade entry, attendance, and **report card (bulletin) generation** with a drag-drop template builder + PDF export. Two distinct shells were captured:

1. **School shell** (sidebar: Principal / Élèves / Enseignants / Pédagogie / Configuration / Compte) — used by school staff. Sample user: "Marjorie Etienne — Administratrice".
2. **SaaS admin shell** (sidebar: Vue globale / Clients / Facturation / Système) — used by EkolPlus's own team to manage all schools + billing. Sample user: "Thomas Leclair — Propriétaire SaaS". Has a "Retour à l'interface école" switch-back link.

This maps **cleanly onto the starter's existing primitives** — see architecture mapping below. No architecture rewrite needed, just new domain models on top of what's already there.

## Architecture mapping (v2 — revised per user request, see decision log below)

**v1 (rejected)** proposed bolting school-specific fields (address, academic year, logo…) directly onto `Organization`. Rejected because: (a) it pollutes a generic, protected-adjacent multi-tenancy primitive with domain data, and (b) it has no answer for the single hardest problem in any school-SIS data model — **academic-year scoping**. A school's classes, coefficients, and teacher assignments are not static; they're redefined every September, while students and subjects persist across years. A naive `Student.classId` FK breaks the moment a student is promoted. v2 fixes both.

| Banani concept | Starter primitive | Notes |
|---|---|---|
| Generic tenant boundary | `Organization` — **left completely untouched** | No new fields. Stays the pure multi-tenancy primitive CLAUDE.md documents. Avoids any risk of colliding with the protected `require-org-role.ts` contract. |
| École (school profile) | **New** `School` model, `organizationId String @unique` (1:1 with `Organization`) | All school-specific fields (address, logo, contact, curriculum type, `currentAcademicYearId`) live here, not on `Organization`. |
| Directeur/Administratrice/Censeur (school staff) | `OrganizationMember.role` (**unchanged** — `OWNER`/`ADMIN`/`MEMBER`, protected precedence) | `OWNER` = Directeur, `ADMIN` = Administratrice/Censeur. Add an optional cosmetic `title` string for display ("Administratrice") without touching the permission enum. |
| Enseignant (teacher) | **New** `Teacher` model, `schoolId`, optional `userId` (nullable — a teacher may or may not have a login) | Kept separate from `OrganizationMember` because teachers need rich domain data (specialties) that don't belong on a generic membership join row. When a teacher *does* log in, they also get an `OrganizationMember(role=MEMBER)` row. |
| Thomas Leclair "Propriétaire SaaS" (EkolPlus staff) | `User.role` (`ADMIN`/`SUPERADMIN`) | Existing `/api/admin/*` back-office, not org-scoped. "SaaS Admin Dashboard" screens are new pages under `/admin/*` reusing `requireAdmin`/`requireSuperadmin`. |
| École switching ("Retour à l'interface école") | N/A yet | New: impersonation/switch-context affordance for platform admins — small design decision, deferred to Epic 2 implementation. |
| **Année scolaire (academic year)** | **New** `AcademicYear` model, `schoolId`, `label`, `startDate`, `endDate`, `isActive` | First-class, not a string field. Everything year-scoped hangs off this — see below. |
| Trimestre/Semestre (term) | **New** `Term` model, `academicYearId`, `label`, `order` | Bulletins/Evaluations/Grades/Appreciations are scoped per term. Configurable count (2 or 3) per school. |
| Classe (class) | **New** `SchoolClass` model, `schoolId`, **`academicYearId`**, `name`, `level` | Year-scoped: "3ème A" in 2024-2025 is a distinct row from "3ème A" in 2025-2026 — rosters and teacher assignments differ each year. |
| Élève (student) identity | **New** `Student` model, `schoolId`, biographical fields only (name, DOB, matricule, guardian contact) | **No `classId` here.** Identity persists across years independent of class. |
| Élève ↔ classe (per year) | **New** `Enrollment` model, `studentId`, `classId` (already year-scoped via `SchoolClass`), `status` | Join table. Lets a student change class/be promoted/repeat a year while every past `Enrollment` row (and the bulletins that reference it) stays historically accurate. This is the standard SIS pattern — the alternative (`Student.classId` direct FK) is the classic mistake that breaks at the first year rollover. |
| Matière (subject) | **New** `Subject` model, `schoolId` only (no year scoping) | Subjects like "Mathématiques" are stable across years — no need to recreate them every September. |
| Coefficient | **New** `Coefficient` model, `subjectId` + `classId` | Scoped per class (which is already year-scoped), so no separate `academicYearId` needed here — inherited transitively. |
| Affectation (teacher↔subject↔class) | **New** `Affectation` model, `teacherId` + `subjectId` + `classId` | Same transitive year-scoping via `classId`. |
| Abonnement (School pays EkolPlus) | **New** `Subscription` + `SubscriptionPlan` models, `schoolId`, **Stripe** | Recurring SaaS billing, confirmed Stripe-only (see decision log). Use the bundled `izisaas-payments-handler` skill's Stripe adapter (subscriptions, Customer Portal) — the starter's Bictorys/`Order` flow is NOT used for this product. |

### Why this is worth the extra models

A cheaper v1-style model (`Student.classId` direct, no `AcademicYear`) would work for a demo but breaks at the first real use case: **September rolls around, the school promotes students to new classes, and every historical bulletin for the previous year must still show the OLD class.** Modeling `AcademicYear` → `SchoolClass` → `Enrollment` now costs a handful of extra tables; retrofitting it after data exists is a painful migration. This is the single highest-leverage decision in the whole schema, which is why it's called out before any Epic 4 implementation starts.

## Screen inventory → route mapping (28 screens, 8 epics)

### Epic 0 — Shell & primitives (not a Banani screen, prerequisite for all)
- Two layouts: `(school)/layout.tsx` (sidebar: Tableau de bord/Élèves/Enseignants/Pédagogie/Configuration/Compte) and `(admin)/layout.tsx` (sidebar: Vue globale/Clients/Facturation/Système)
- Primitives to extract: `Sidebar`, `Topbar` (breadcrumb + global search + user menu), `Table`, `Card`, `StatCard`, `Badge`, `Button`, `Modal`, `Field`/`Input`/`Select`, `Tabs`
- Tailwind `@theme` tokens from the Lavender SaaS palette (`--primary: #6C2BD9`, etc.)

### Epic 1 — Auth (1 screen)
| Screen | Banani ID | Route | Backend |
|---|---|---|---|
| Login Page | `bWrGcKSGTeFc` | `/login` | existing `/api/auth/login` |

### Epic 2 — SaaS platform admin (6 screens)
| Screen | Banani ID | Route | Backend |
|---|---|---|---|
| SaaS Admin Dashboard | `VZVQxm_1YTAi` | `/admin` | new — aggregate stats endpoint |
| Admin Statistics | `nSYPhOOZgccA` | `/admin/statistics` | new |
| Schools Management | `72UpLW9LHCiI` | `/admin/schools` | new (list `Organization`) |
| Create School | `iAq5FwOgzwir` | `/admin/schools/new` | new (create `Organization` + owner) |
| Subscription Plans | `KM_nZ7xzMgAE` | `/admin/billing/plans` | new `SubscriptionPlan` CRUD |
| Stripe Checkout | `2Pl77h7xYQk2` | `/admin/billing/checkout` or school-side `/settings/billing` (ambiguous — see Open Questions) | new, via `izisaas-payments-handler` |

### Epic 3 — School onboarding & settings (2 screens, possibly 1)
| Screen | Banani ID | Route | Backend |
|---|---|---|---|
| School Dashboard | `R94lpPCRDLa8` | `/dashboard` | new — per-school aggregate stats |
| School Settings / Paramètres | `J-YtPdRZUsjN` / `o2cW8OmWvqhD` | `/settings` | **Likely the same screen** — both have breadcrumb "Compte › Paramètres" and near-identical body text (Profil/Sécurité/Établissement/École/Année scolaire/Administrateurs/Système tabs). Treat as one tabbed page; diff the two HTML exports when we implement to confirm before merging. |

### Epic 4 — Academic configuration (4 screens)
| Screen | Banani ID | Route | Backend |
|---|---|---|---|
| Classes Config | `S_OTSGjwNm4c` | `/configuration/classes` | new `SchoolClass` model |
| Matières List (Subjects) | `0sucz8IfcpKT` | `/configuration/matieres` | new `Subject` model |
| Coefficients Config | `1pYQiqgzPagc` | `/configuration/coefficients` | new `Coefficient` model (subject × class → weight) |
| Affectations (teacher↔subject↔class) | `ufpxQ7cv5ffm` | `/configuration/affectations` | new `Affectation` model |

### Epic 5 — People (3 screens)
| Screen | Banani ID | Route | Backend |
|---|---|---|---|
| Students List | `irP1FJzNcIpq` | `/eleves` | new `Student` model |
| Student Profile | `IOcz_ptC61M8` | `/eleves/[id]` | same |
| Teachers List | `OyxtQcFdbEC9` | `/enseignants` | new `Teacher` model (may or may not have a login `User`) |

### Epic 6 — Grades / evaluations (5 screens)
| Screen | Banani ID | Route | Backend |
|---|---|---|---|
| Grade Notebook (Carnet de notes) | `AsaJl2Igbuoc` | `/pedagogie/carnet-de-notes` | new `Evaluation` + `Grade` models |
| Grade Entry | `y4wdrHvC280E` | `/pedagogie/carnet-de-notes/[evaluationId]/saisie` | same |
| Edit Evaluation | `pgYFX9zWSY_5` | `/pedagogie/carnet-de-notes/[evaluationId]/edit` | same |
| Notes Résultats | `7c3XE9G80S3x` | `/pedagogie/resultats` | computed view (averages/ranking) |
| Appréciations | `cyn9D35k5T6D` | `/pedagogie/appreciations` | new `Appreciation` model |

### Epic 7 — Bulletins / report cards (5 screens) — the core deliverable
| Screen | Banani ID | Route | Backend |
|---|---|---|---|
| Report Cards (Bulletins list) | `IqXAVGK62iQ6` | `/bulletins` | generation & tracking, "Exporter" action |
| Bulletin Viewer | `fVG1xU5deplt` | `/bulletins/[studentId]/[termId]` | computed from Notes×Coefficients+Appreciations |
| Bulletin Templates (gallery) | `cluqUYO18ujp` | `/configuration/modele-bulletin` | new `BulletinTemplate` model |
| Bulletin Builder (drag-drop, new template) | `Xc7dKiq2Nw6n` | `/configuration/modele-bulletin/new` | same |
| Bulletin Editor (edit existing template, Editor/Preview/PDF tabs) | `FhIiyqa-Luo7` | `/configuration/modele-bulletin/[id]/edit` | same + PDF export |

### Epic 8 — Attendance (1 screen)
| Screen | Banani ID | Route | Backend |
|---|---|---|---|
| Attendance Tracking (Présences) | `Ty30SUTuXAwb` | `/pedagogie/presences` | new `Attendance` model |

## New Prisma domain models needed (v2, none exist today)

`School` (1:1 `Organization`), `AcademicYear`, `Term`, `Student`, `Enrollment`, `Teacher`, `SchoolClass`, `Subject`, `Coefficient`, `Affectation`, `Evaluation`, `Grade`, `Appreciation`, `Attendance`, `BulletinTemplate`, `SubscriptionPlan`, `Subscription`, `Coupon` — 18 new models, all rooted at `schoolId` (directly or transitively via `classId`/`studentId`). Substantial schema addition; designed epic-by-epic (Epic 4's models before Epic 4 starts, etc.) rather than all committed upfront, so each shape is validated against real screens before migration.

## Decision log

| # | Question | Decision | Date |
|---|---|---|---|
| 1 | Architecture mapping | **v2** (this file, above) — `School`/`AcademicYear`/`Term`/`Enrollment` as first-class models; `Organization`/`OrganizationMember` left untouched. Rejected v1 (fields bolted onto `Organization`, no year-scoping). | 2026-08-11 |
| 2 | Phasing | Sequential: Shell → Onboarding → Config → Personnes → Notes → Bulletins, as below. | 2026-08-11 |
| 3 | Billing model | Stripe subscriptions only (School → EkolPlus). The starter's Bictorys/`Order` flow is NOT used for this product — no parent-facing payments in scope. | 2026-08-11 |
| 4 | Bulletin PDF export | HTML preview first (pixel-faithful to Banani); real PDF export (Puppeteer or `@react-pdf/renderer`) deferred to a later pass once the HTML render is validated. | 2026-08-11 |
| 5 | School Settings vs Paramètres | Confirmed: one page, `/settings`, tabbed (Profil/Sécurité/Établissement/Année scolaire/Administrateurs/Système). | 2026-08-11 |
| 6 | Teachers as login accounts | Confirmed: no teacher login in v1. `Teacher.userId` stays null; school staff (Directeur/Administratrice) enters grades/attendance on teachers' behalf. Add self-service login in a later phase without a breaking migration (`userId` is already nullable). | 2026-08-11 |

**Architecture v2 confirmed 2026-08-11 — locked for implementation.**

## Proposed phasing

1. **Epic 0 + Epic 1** — Shell (both layouts), primitives, Tailwind theme, Login. Nothing works without this.
2. **Epic 2 (partial: Create School only)** — platform admin creates a tenant (`Organization` + `School` + first `OrganizationMember` OWNER) so a school can exist to log into. Rest of Epic 2 (billing, stats) deferred to step 8.
3. **Epic 3** — School onboarding/dashboard/settings, `AcademicYear`/`Term` setup.
4. **Epic 4** — Academic configuration (Classes/Matières/Coefficients/Affectations) — data other epics depend on.
5. **Epic 5** — People (Students/Teachers, `Enrollment`).
6. **Epic 6** — Grades/evaluations.
7. **Epic 8** — Attendance (independent, can slot in anytime after Epic 5).
8. **Epic 7** — Bulletins (depends on 4, 5, 6 all being live — it aggregates their data). HTML preview only per decision #4.
9. **Epic 2 (remainder)** — SaaS admin dashboard/stats + Stripe billing (`SubscriptionPlan`/`Subscription`) — can run in parallel with 4-8 on a second track since it doesn't block school-side work once Create School (step 2) exists.

## Open questions for user

None outstanding — all 6 decisions locked (see Decision log above). Next: Epic 0 (shell + primitives) implementation, starting with a fresh `.planning/banani/epic-0-shell.md` screen plan.
