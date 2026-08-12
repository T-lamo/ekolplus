# Appréciations — Banani → Next.js

## Source
- Banani screens: `appreciations-list` (`cyn9D35k5T6D`, "Appréciations"), `saisir-appreciations` (`Om02dH_5Gqsb`, "Saisir une appréciation"), `appreciation-detail` (`kxwjEbB0Rlsh`, "Appreciation Detail")
- Fetched: 2026-08-12

## What this screen set actually is
A two-level appreciation system per (student, term): one **"appréciation générale"** (mention + free-text comment + comportement/investissement/assiduité selectors, authored once for the student) and N **per-subject appréciations** (mention + free-text remark per `ClassSubject`, one per subject with grades). This mirrors the `Goal` model's `subjectId String?` pattern already established in Epic 6a (null = "générale"/overall, set = one subject) — reused here rather than inventing a new nullable-scoping convention.

## Data model
```prisma
model Appreciation {
  id          String   @id @default(cuid())
  studentId   String
  student     Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  termId      String
  term        Term     @relation(fields: [termId], references: [id], onDelete: Cascade)
  subjectId   String?  // null = générale, set = per-subject
  subject     Subject? @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  mention     String?  // TRES_BIEN|BIEN|ASSEZ_BIEN|PASSABLE|INSUFFISANT|FAIBLE — teacher-set, NOT purely derived
  text        String?  // free-text remark (both générale's "commentaire" and per-matière's text)
  comportement    String?  // générale only
  investissement  String?  // générale only
  assiduite       String?  // générale only
  status      String   @default("DRAFT") // DRAFT|PUBLISHED — mirrors Evaluation's status field exactly
  authorId    String?
  author      User?    @relation(fields: [authorId], references: [id], onDelete: SetNull)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([studentId, termId, subjectId])
}
```

**`mention` is teacher-editable, not purely computed** — confirmed directly by the mock: Oumar Diallo's "Moyenne générale" is 10,4, which the existing `appreciationFor()` bucket function would classify as "Insuffisant"'s neighbor bucket "Passable" (10 ≤ x < 11), but the mock shows **"Assez Bien"** selected in the mention-grid. A teacher factoring in behavior/effort beyond the raw average is the intended behavior, not a bug to reconcile — same "Banani mock isn't internally consistent with a pure formula, and that's fine" pattern documented for Notes Résultats in Epic 6a. `appreciationFor()` is reused only to pre-fill a **suggested default** when a row doesn't exist yet; whatever the teacher picks (or leaves) is authoritative.

## API surface
- `GET /api/school/classes/[id]/appreciations?termId=` — list read model for the `/pedagogie/appreciations` table: every enrolled student + their générale appreciation's mention/text/status/author, general average (reuses `students/[id]/results`' `overallAverage` formula) and rank (reuses `competitionRank`).
- `GET /api/school/students/[id]/appreciations?termId=` — one student's full picture: générale row + one row per `ClassSubject` (existing or not-yet-created), plus the per-subject averages needed to render "Moy." and suggest a default mention. Backs both the Saisir wizard and the Detail page.
- `PUT /api/school/students/[id]/appreciations` — upsert ONE row (générale or one subject) by `{ termId, subjectId: string|null, mention?, text?, comportement?, investissement?, assiduite?, status? }` — same upsert-by-nullable-subjectId shape as the Goals route.
- `DELETE /api/school/students/[id]/appreciations?termId=&subjectId=` — remove one row ("Supprimer l'appréciation").

## V1 scope cuts
- **"Décision du conseil de classe"** (Détail screen: Décision/Orientation/Passage — "Avertissement de travail", "Soutien scolaire recommandé", "Sous réserve") — a genuinely separate feature (end-of-term academic-council decisions), no markup exists for *how* these get set, and it belongs conceptually closer to Epic 7 (Bulletins) than to per-subject appreciations. Rendered as an honest "Disponible avec le Conseil de classe (à venir)" placeholder card, not fabricated.
- **"Historique des modifications"** — needs an audit-trail model that doesn't exist yet, same reasoning as Grade Notebook's stubbed "Historique des notes". Real, informative stub.
- **Absences / Retards** shown in the Detail/Saisir stat cards — no backing data until Epic 8 (Attendance) ships. Rendered as `—`, not fabricated numbers.
- **"Notifier le tuteur" / "Envoyer au tuteur légal" / "Générer le bulletin PDF" / "Imprimer"** — no messaging system, no bulletin generator yet (Epic 7). Toast stubs.
- **"Enseignant principal"** — the mock shows a *different* teacher per student row in the list (inconsistent — a homeroom teacher is class-wide, not per-student), same "Banani mock demo data isn't internally consistent" pattern seen before. Implemented as `Class.homeroomTeacher` (one real, consistent value per class) rather than reverse-engineering the mock's per-row variation. Kept **distinct** from "Rédigé par" (the générale appreciation's actual `authorId`), which the Detail screen also shows separately — two different real concepts, not conflated.
- **"Par matière" / "Statistiques" / "En attente" tabs** on the list screen — only "Par élève" (the default/active tab) had markup fetched. Clickable-but-toast-stubbed, matching the Grade Notebook precedent.
- **"Affichage" column-visibility dropdown** — no content specified in the source.
- **Quick phrases ("Phrases types")** — built for real (not stubbed): a small hardcoded French phrase list, client-side insert-on-click into the commentaire textarea. Zero backend needed, cheap enough to just build, same call as Notes Résultats' Objectifs card.

## Routes
- `/pedagogie/appreciations` — list (sidebar link already exists, was 404 until now)
- `/pedagogie/appreciations/[studentId]/saisie?termId=` — entry/edit wizard (générale + per-matière), prev/next student navigation within the same class+term
- `/pedagogie/appreciations/[studentId]?termId=` — read-only detail view

## Implementation checklist
- [ ] Prisma model + migration `11_epic6_appreciations`
- [ ] `GET /api/school/classes/[id]/appreciations`
- [ ] `GET/PUT/DELETE /api/school/students/[id]/appreciations`
- [ ] List page
- [ ] Entry/edit page
- [ ] Detail page
- [ ] Cross-check: list's average/rank == results endpoint's == detail's, same pattern as every prior Epic 6 verification
