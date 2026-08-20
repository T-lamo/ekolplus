# i18n — Carnet de notes (Grade Book) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the Carnet de notes (grade book) module — 7 files, ~2,415 lines — into French/Haitian Creole/English via next-intl, fixing two real locale bugs (hardcoded `'fr-FR'` date formatting, a tutoiement violation) and unifying two currently-duplicated/inconsistent value maps (evaluation type labels, evaluation status labels) into single sources of truth.

**Architecture:** Same `next-intl` machinery as every prior i18n phase: `useTranslations('Gradebook.<section>')` in client components, one `gradebook` namespace covering all 7 files (nested per component), registered in `locales.ts`/`i18n/request.ts`/`next-intl.d.ts`. No new infrastructure.

**Tech Stack:** Next.js 16 App Router, next-intl, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-08-20-i18n-carnet-de-notes-design.md`

## Global Constraints

- **Vouvoiement throughout, no exceptions.** During the read-through for this plan, three additional tutoiement violations were found beyond the one the design-phase survey caught (`'Réessaie.'`) — the survey's keyword scan only searched for literal "tu"/"ton"/"ta" substrings, which misses embedded imperative verb forms. All four are fixed in this plan:
  - `NewEvaluationModal.tsx`: `'Évaluation créée — saisis les notes.'` → `'Évaluation créée — saisissez les notes.'`
  - `ParEvaluationTab.tsx`: `'...crée la première...'` → `'...créez la première...'`
  - `page.tsx`: `'Configure d'abord des classes...'` → `'Configurez d'abord des classes...'`
  - `page.tsx`: `"Crée d'abord une évaluation."` → `"Créez d'abord une évaluation."`
  - `saisie/page.tsx`: `'Corrige les notes...'` → `'Corrigez les notes...'`
  - All 3 files' `'Erreur réseau. Réessaie.'` fallback → `common.errors.network` (already reads "Réessayez." — fixes itself for free, same mechanism Phase 2 used).
- **Haitian Creole `_review` flag** — every `ht/*.json` file carries `"_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production."` verbatim. `gradebook.json` (new file) needs this key added in Task 1.
- **Straight ASCII apostrophes (`'`) in message JSON files** — never the source `.tsx` files' curly typographic apostrophes (`'`). This plan's JSON snippets already use straight apostrophes; verify before committing if hand-editing.
- **`.one`/`.other` plural keys**, never ICU `{n, plural, ...}` syntax — matches the ternary condition exactly (`n > 1 ? plural : singular`).
- **Language names are never translated** (n/a this phase — no language picker here).
- **`TYPE_LABEL` unification**: the more descriptive French form wins — `'Devoir surveillé (DS)'` (from `EvaluationConfigForm.tsx`), not `ParEvaluationTab.tsx`'s shorter `'Devoir surveillé'`. Both files consume the single `gradebook.evaluationType.*` key set after this plan.
- **`EvaluationStatus` unification**: `page.tsx`, `ParEvaluationTab.tsx`, and `saisie/page.tsx`'s three separate DRAFT/PUBLISHED ternaries all consume the single `gradebook.evaluationStatus.*` key set.
- **`ParEvaluationTab.tsx`'s `fmtDate()` locale bug**: hardcodes `.toLocaleDateString('fr-FR', ...)` — fixed to read the active locale via `useLocale()` and index `LOCALE_BCP47` from `@/lib/locales.ts`, exactly the pattern already proven in `AnneeScolaireTab.tsx`/`AdministrateursTab.tsx`/`ProfilTab.tsx`.
- **Cross-dependency fence — `OFFLINE_SYNC`** (`@/lib/constants`): consumed by `saisie/page.tsx` (`.queuedToast` only). Also consumed by 3 out-of-scope files (`appreciations/[studentId]/saisie/page.tsx`, `presences/page.tsx`, `OfflineIndicator.tsx`). **Do not touch `constants.ts`.** `saisie/page.tsx` keeps consuming `OFFLINE_SYNC.queuedToast` as-is, untranslated.
- **No dedicated shared-label helper file needed** — unlike Phase 2's `role-label.ts`, both `gradebook.evaluationType.*` and `gradebook.evaluationStatus.*` key sets are indexed directly by their own literal-union type (`EvaluationType`/`EvaluationStatus`) via `t(type)`/`t(status)` — same proven dynamic-key pattern as `NotificationsTab.tsx`'s `t(\`events.${key}.label\`)`, just simpler since the whole key is the dynamic part, not a template-literal prefix+suffix.
- Full gate before every commit: `pnpm typecheck && pnpm lint && pnpm test` (format runs automatically via the pre-commit hook).
- Work happens in an isolated git worktree (`.worktrees/i18n-carnet-de-notes`, branch `feat/i18n-carnet-de-notes`, forked from local `develop` HEAD) — never the main checkout, which another concurrent session may have uncommitted work in.

---

### Task 1: Namespace registration + shared keys + EvaluationConfigForm.tsx + NewEvaluationModal.tsx

**Files:**
- Create: `frontend/src/messages/fr/gradebook.json`
- Create: `frontend/src/messages/ht/gradebook.json`
- Create: `frontend/src/messages/en/gradebook.json`
- Modify: `frontend/src/lib/locales.ts` (add `'gradebook'` to `MESSAGE_NAMESPACES`)
- Modify: `frontend/src/i18n/request.ts` (register `gradebook` import + `Gradebook` messages key)
- Modify: `frontend/src/types/next-intl.d.ts` (register `gradebook` type import + `Gradebook` in `Messages`)
- Modify: `frontend/src/app/(school)/pedagogie/carnet-de-notes/EvaluationConfigForm.tsx`
- Modify: `frontend/src/app/(school)/pedagogie/carnet-de-notes/NewEvaluationModal.tsx`

**Interfaces:**
- Produces: the `gradebook` namespace with `evaluationType.{DS,INTERROGATION,EXAMEN,AUTRE}` and `evaluationStatus.{DRAFT,PUBLISHED}` keys — every later task in this plan consumes these two key groups via `useTranslations('Gradebook.evaluationType')`/`useTranslations('Gradebook.evaluationStatus')` and `t(type)`/`t(status)`.
- Produces: `EVALUATION_TYPES: EvaluationType[]` constant in `EvaluationConfigForm.tsx` (module-scope, exported is NOT needed — only this file uses it), replacing the deleted `TYPE_LABEL` map's implicit key ordering (`['DS', 'INTERROGATION', 'EXAMEN', 'AUTRE']`).
- Consumes: nothing from other tasks (first task).

- [ ] **Step 1: Create `frontend/src/messages/fr/gradebook.json`**

```json
{
  "evaluationType": {
    "DS": "Devoir surveillé (DS)",
    "INTERROGATION": "Interrogation",
    "EXAMEN": "Examen",
    "AUTRE": "Autre"
  },
  "evaluationStatus": {
    "DRAFT": "Brouillon",
    "PUBLISHED": "Publiée"
  },
  "evaluationForm": {
    "classLabel": "Classe",
    "subjectLabel": "Matière",
    "termLabel": "Trimestre / Période",
    "typeLabel": "Type d'évaluation",
    "titleLabel": "Intitulé de l'évaluation",
    "titlePlaceholder": "Ex. : Devoir surveillé n°3, Interrogation surprise...",
    "dateLabel": "Date",
    "maxScoreLabel": "Note maximale",
    "maxScoreOption": "Sur {n}",
    "coefficientLabel": "Coefficient",
    "countsTowardAverageLabel": "Prise en compte dans la moyenne",
    "countsTowardAverageHint": "Inclure cette évaluation dans le calcul de la moyenne",
    "yes": "Oui",
    "no": "Non",
    "teacherInCharge": "Enseignant responsable :",
    "notesLabel": "Remarques (optionnel)",
    "notesPlaceholder": "Notes internes visibles par les administrateurs et enseignants"
  },
  "newEvaluationModal": {
    "title": "Nouvelle évaluation",
    "validationError": "Classe, matière, trimestre et intitulé sont requis.",
    "createdToast": "Évaluation créée — saisissez les notes.",
    "submitLabel": "Créer et saisir les notes",
    "submitting": "Création…"
  }
}
```

- [ ] **Step 2: Create `frontend/src/messages/en/gradebook.json`**

```json
{
  "evaluationType": {
    "DS": "Supervised test (DS)",
    "INTERROGATION": "Quiz",
    "EXAMEN": "Exam",
    "AUTRE": "Other"
  },
  "evaluationStatus": {
    "DRAFT": "Draft",
    "PUBLISHED": "Published"
  },
  "evaluationForm": {
    "classLabel": "Class",
    "subjectLabel": "Subject",
    "termLabel": "Term / Period",
    "typeLabel": "Evaluation type",
    "titleLabel": "Evaluation title",
    "titlePlaceholder": "E.g.: Supervised test #3, Pop quiz...",
    "dateLabel": "Date",
    "maxScoreLabel": "Maximum score",
    "maxScoreOption": "Out of {n}",
    "coefficientLabel": "Coefficient",
    "countsTowardAverageLabel": "Counted toward the average",
    "countsTowardAverageHint": "Include this evaluation in the average calculation",
    "yes": "Yes",
    "no": "No",
    "teacherInCharge": "Teacher in charge:",
    "notesLabel": "Notes (optional)",
    "notesPlaceholder": "Internal notes visible to admins and teachers"
  },
  "newEvaluationModal": {
    "title": "New evaluation",
    "validationError": "Class, subject, term, and title are required.",
    "createdToast": "Evaluation created — enter the grades.",
    "submitLabel": "Create and enter grades",
    "submitting": "Creating…"
  }
}
```

- [ ] **Step 3: Create `frontend/src/messages/ht/gradebook.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "evaluationType": {
    "DS": "Devwa siveye (DS)",
    "INTERROGATION": "Kontwòl",
    "EXAMEN": "Egzamen",
    "AUTRE": "Lòt"
  },
  "evaluationStatus": {
    "DRAFT": "Bouyon",
    "PUBLISHED": "Pibliye"
  },
  "evaluationForm": {
    "classLabel": "Klas",
    "subjectLabel": "Matyè",
    "termLabel": "Trimès / Peryòd",
    "typeLabel": "Kalite evalyasyon",
    "titleLabel": "Tit evalyasyon an",
    "titlePlaceholder": "Egz. : Devwa siveye n°3, Kontwòl sipriz...",
    "dateLabel": "Dat",
    "maxScoreLabel": "Nòt maksimòm",
    "maxScoreOption": "Sou {n}",
    "coefficientLabel": "Koefisyan",
    "countsTowardAverageLabel": "Konte nan mwayèn nan",
    "countsTowardAverageHint": "Enkli evalyasyon sa a nan kalkil mwayèn nan",
    "yes": "Wi",
    "no": "Non",
    "teacherInCharge": "Pwofesè responsab :",
    "notesLabel": "Remak (opsyonèl)",
    "notesPlaceholder": "Nòt entèn administratè ak pwofesè yo ka wè"
  },
  "newEvaluationModal": {
    "title": "Nouvo evalyasyon",
    "validationError": "Klas, matyè, trimès ak tit yo obligatwa.",
    "createdToast": "Evalyasyon kreye — antre nòt yo.",
    "submitLabel": "Kreye epi antre nòt yo",
    "submitting": "K ap kreye…"
  }
}
```

- [ ] **Step 4: Register the `gradebook` namespace**

In `frontend/src/lib/locales.ts`, add `'gradebook'` to the end of `MESSAGE_NAMESPACES`:

```typescript
export const MESSAGE_NAMESPACES = [
  'common',
  'login',
  'shell',
  'schoolSidebar',
  'adminSidebar',
  'schoolTopbar',
  'adminTopbar',
  'forgotPassword',
  'resetPassword',
  'verifyEmail',
  'dashboard',
  'adminDashboard',
  'schoolPlanCard',
  'settings',
  'themePicker',
  'gradebook',
] as const;
```

In `frontend/src/i18n/request.ts`, add the import and destructure entry (after `themePicker`):

```typescript
  const [
    common,
    login,
    shell,
    schoolSidebar,
    adminSidebar,
    schoolTopbar,
    adminTopbar,
    forgotPassword,
    resetPassword,
    verifyEmail,
    dashboard,
    adminDashboard,
    schoolPlanCard,
    settings,
    themePicker,
    gradebook,
  ] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
    import(`../messages/${locale}/schoolSidebar.json`),
    import(`../messages/${locale}/adminSidebar.json`),
    import(`../messages/${locale}/schoolTopbar.json`),
    import(`../messages/${locale}/adminTopbar.json`),
    import(`../messages/${locale}/forgotPassword.json`),
    import(`../messages/${locale}/resetPassword.json`),
    import(`../messages/${locale}/verifyEmail.json`),
    import(`../messages/${locale}/dashboard.json`),
    import(`../messages/${locale}/adminDashboard.json`),
    import(`../messages/${locale}/schoolPlanCard.json`),
    import(`../messages/${locale}/settings.json`),
    import(`../messages/${locale}/themePicker.json`),
    import(`../messages/${locale}/gradebook.json`),
  ]);

  return {
    locale,
    messages: {
      Common: common.default,
      Login: login.default,
      Shell: shell.default,
      SchoolSidebar: schoolSidebar.default,
      AdminSidebar: adminSidebar.default,
      SchoolTopbar: schoolTopbar.default,
      AdminTopbar: adminTopbar.default,
      ForgotPassword: forgotPassword.default,
      ResetPassword: resetPassword.default,
      VerifyEmail: verifyEmail.default,
      Dashboard: dashboard.default,
      AdminDashboard: adminDashboard.default,
      SchoolPlanCard: schoolPlanCard.default,
      Settings: settings.default,
      ThemePicker: themePicker.default,
      Gradebook: gradebook.default,
    },
  };
});
```

In `frontend/src/types/next-intl.d.ts`, add the type import and `Messages` entry:

```typescript
import type gradebook from '@/messages/fr/gradebook.json';
```

(add after the `themePicker` import line), and in the `Messages` interface:

```typescript
      ThemePicker: typeof themePicker;
      Gradebook: typeof gradebook;
```

- [ ] **Step 5: Rewrite `EvaluationConfigForm.tsx`**

Full replacement:

```tsx
'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Select, SelectItem } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import type { ClassSubjectOption, EvaluationConfig, EvaluationType, TermOption } from './types';

const EVALUATION_TYPES: EvaluationType[] = ['DS', 'INTERROGATION', 'EXAMEN', 'AUTRE'];

export function EvaluationConfigForm({
  value,
  onChange,
  classSubjects,
  terms,
  lockPair = false,
}: {
  value: EvaluationConfig;
  onChange: (next: EvaluationConfig) => void;
  classSubjects: ClassSubjectOption[];
  terms: TermOption[];
  lockPair?: boolean;
}) {
  const t = useTranslations('Gradebook.evaluationForm');
  const tType = useTranslations('Gradebook.evaluationType');

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const cs of classSubjects) seen.set(cs.classId, cs.class.name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [classSubjects]);

  const current = classSubjects.find((cs) => cs.id === value.classSubjectId) ?? null;
  const classId = current?.classId ?? classSubjects[0]?.classId ?? '';
  const subjectsForClass = classSubjects.filter((cs) => cs.classId === classId);

  function set<K extends keyof EvaluationConfig>(key: K, v: EvaluationConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  function onClassChange(nextClassId: string) {
    const first = classSubjects.find((cs) => cs.classId === nextClassId);
    set('classSubjectId', first?.id ?? '');
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3.5">
        <Select label={t('classLabel')} value={classId} disabled={lockPair} onValueChange={onClassChange}>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </Select>
        <Select
          label={t('subjectLabel')}
          value={value.classSubjectId}
          disabled={lockPair}
          onValueChange={(v) => set('classSubjectId', v)}
        >
          {subjectsForClass.map((cs) => (
            <SelectItem key={cs.id} value={cs.id}>
              {cs.subject.name}
            </SelectItem>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <Select
          label={t('termLabel')}
          value={value.termId}
          onValueChange={(v) => set('termId', v)}
        >
          {terms.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.label}
            </SelectItem>
          ))}
        </Select>
        <Select
          label={t('typeLabel')}
          value={value.type}
          onValueChange={(v) => set('type', v as EvaluationType)}
        >
          {EVALUATION_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {tType(type)}
            </SelectItem>
          ))}
        </Select>
      </div>

      <Field
        label={t('titleLabel')}
        placeholder={t('titlePlaceholder')}
        value={value.label}
        onChange={(e) => set('label', e.target.value)}
        required
      />

      <div className="grid grid-cols-3 gap-3.5">
        <DateField label={t('dateLabel')} value={value.date ?? ''} onChange={(v) => set('date', v || null)} />
        <Select
          label={t('maxScoreLabel')}
          value={String(value.maxScore)}
          onValueChange={(v) => set('maxScore', Number(v))}
        >
          {[5, 10, 20, 100].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {t('maxScoreOption', { n })}
            </SelectItem>
          ))}
        </Select>
        <Field
          label={t('coefficientLabel')}
          type="number"
          min={1}
          max={10}
          value={String(value.coefficient)}
          onChange={(e) => set('coefficient', Number(e.target.value) || 1)}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
        <div>
          <div className="text-xs font-semibold text-foreground">{t('countsTowardAverageLabel')}</div>
          <div className="text-[11px] text-muted-foreground">{t('countsTowardAverageHint')}</div>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border">
          {([true, false] as const).map((optionValue) => {
            const active = optionValue === value.countsTowardAverage;
            return (
              <button
                key={String(optionValue)}
                type="button"
                onClick={() => set('countsTowardAverage', optionValue)}
                className={`px-3 py-1.5 text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
              >
                {optionValue ? t('yes') : t('no')}
              </button>
            );
          })}
        </div>
      </div>

      {current?.teacher && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
          <Avatar name={current.teacher.name} size={22} />
          <span className="text-xs text-muted-foreground">
            {t('teacherInCharge')}{' '}
            <strong className="text-foreground">{current.teacher.name}</strong>
          </span>
        </div>
      )}

      <Field
        label={t('notesLabel')}
        placeholder={t('notesPlaceholder')}
        value={value.notes ?? ''}
        onChange={(e) => set('notes', e.target.value || null)}
      />
    </div>
  );
}
```

Note: the `terms.map((t) => ...)` callback parameter shadows the outer `t` translator inside that one `.map()` — this is pre-existing behavior (the original file already named the callback param `t` for `TermOption`), TypeScript scoping handles it correctly (inner `t` shadows outer `t` only within that arrow function body, where only `t.id`/`t.label` are used, never the translator) — left as-is to minimize the diff, but flagged here since it reads confusingly next to a translator also named `t`.

- [ ] **Step 6: Rewrite `NewEvaluationModal.tsx`**

Full replacement:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EvaluationConfigForm } from './EvaluationConfigForm';
import type { ClassSubjectOption, EvaluationConfig, TermOption } from './types';

export function NewEvaluationModal({
  classSubjects,
  terms,
  defaultClassSubjectId,
  defaultTermId,
  onClose,
  onCreated,
}: {
  classSubjects: ClassSubjectOption[];
  terms: TermOption[];
  defaultClassSubjectId: string;
  defaultTermId: string;
  onClose: () => void;
  onCreated: (evaluationId: string) => void;
}) {
  const t = useTranslations('Gradebook.newEvaluationModal');
  const tCommon = useTranslations('Common');
  const { toast } = useToast();
  const [value, setValue] = useState<EvaluationConfig>({
    classSubjectId: defaultClassSubjectId,
    termId: defaultTermId,
    label: '',
    type: 'DS',
    maxScore: 20,
    coefficient: 1,
    countsTowardAverage: true,
    notes: null,
    date: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!value.label.trim() || !value.classSubjectId || !value.termId) {
      setError(t('validationError'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ evaluation: { id: string } }>('/api/school/evaluations', {
        method: 'POST',
        body: value,
      });
      toast(t('createdToast'), 'success');
      onCreated(res.evaluation.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <EvaluationConfigForm
          value={value}
          onChange={setValue}
          classSubjects={classSubjects}
          terms={terms}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button onClick={onSubmit} loading={submitting}>
          {submitting ? t('submitting') : t('submitLabel')}
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 7: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/messages/fr/gradebook.json frontend/src/messages/ht/gradebook.json frontend/src/messages/en/gradebook.json frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/app/\(school\)/pedagogie/carnet-de-notes/EvaluationConfigForm.tsx frontend/src/app/\(school\)/pedagogie/carnet-de-notes/NewEvaluationModal.tsx
git commit -m "feat(i18n): gradebook namespace + EvaluationConfigForm/NewEvaluationModal"
```

---

### Task 2: `[evaluationId]/edit/page.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/gradebook.json` (add `editEvaluation.*`)
- Modify: `frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/edit/page.tsx`

**Interfaces:**
- Consumes: `Gradebook.evaluationForm` namespace + `EvaluationConfigForm` component (Task 1), `Common.errors.network` (existing).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Append `editEvaluation` to `frontend/src/messages/fr/gradebook.json`**

Add this key as a new top-level sibling of `newEvaluationModal` (before the closing `}`):

```json
  "editEvaluation": {
    "backToEntry": "Retour à la saisie",
    "back": "Retour",
    "title": "Modifier les paramètres de l'évaluation",
    "subtitle": "Les notes déjà saisies seront conservées.",
    "deleteButton": "Supprimer l'évaluation",
    "warningTitle": "Modification d'une évaluation existante",
    "warningBody": "Changer la classe, la matière ou le barème peut affecter les notes déjà saisies.",
    "unsavedNotice": "Des modifications non enregistrées peuvent exister.",
    "cancel": "Annuler",
    "saving": "Enregistrement…",
    "confirmChanges": "Confirmer les modifications",
    "deleteConfirmMessage": "Supprimer cette évaluation et toutes les notes associées ? Cette action est irréversible.",
    "notFound": "Évaluation introuvable.",
    "loadError": "Impossible de charger.",
    "updatedToast": "Évaluation mise à jour.",
    "deletedToast": "Évaluation supprimée."
  }
```

- [ ] **Step 2: Append `editEvaluation` to `frontend/src/messages/en/gradebook.json`**

```json
  "editEvaluation": {
    "backToEntry": "Back to grade entry",
    "back": "Back",
    "title": "Edit evaluation settings",
    "subtitle": "Grades already entered will be kept.",
    "deleteButton": "Delete evaluation",
    "warningTitle": "Editing an existing evaluation",
    "warningBody": "Changing the class, subject, or scoring scale may affect grades already entered.",
    "unsavedNotice": "Unsaved changes may exist.",
    "cancel": "Cancel",
    "saving": "Saving…",
    "confirmChanges": "Confirm changes",
    "deleteConfirmMessage": "Delete this evaluation and all its grades? This action is irreversible.",
    "notFound": "Evaluation not found.",
    "loadError": "Unable to load.",
    "updatedToast": "Evaluation updated.",
    "deletedToast": "Evaluation deleted."
  }
```

- [ ] **Step 3: Append `editEvaluation` to `frontend/src/messages/ht/gradebook.json`**

```json
  "editEvaluation": {
    "backToEntry": "Retounen nan antre nòt yo",
    "back": "Retounen",
    "title": "Modifye paramèt evalyasyon an",
    "subtitle": "Nòt ki deja antre yo ap konsève.",
    "deleteButton": "Efase evalyasyon an",
    "warningTitle": "W ap modifye yon evalyasyon ki egziste deja",
    "warningBody": "Chanje klas la, matyè a oswa baram nòt la ka afekte nòt ki deja antre yo.",
    "unsavedNotice": "Gen chanjman ki ka pa anrejistre.",
    "cancel": "Anile",
    "saving": "K ap anrejistre…",
    "confirmChanges": "Konfime chanjman yo",
    "deleteConfirmMessage": "Efase evalyasyon sa a ak tout nòt ki gen rapò avè l yo? Aksyon sa a pa ka anile.",
    "notFound": "Nou pa jwenn evalyasyon an.",
    "loadError": "Nou pa t kapab chaje l.",
    "updatedToast": "Evalyasyon mete ajou.",
    "deletedToast": "Evalyasyon efase."
  }
```

- [ ] **Step 4: Rewrite `[evaluationId]/edit/page.tsx`**

Full replacement:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, AlertTriangle, Save, Check, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EvaluationConfigForm } from '../../EvaluationConfigForm';
import type { ClassSubjectOption, EvaluationConfig, TermOption } from '../../types';

export default function EditEvaluationPage() {
  const t = useTranslations('Gradebook.editEvaluation');
  const tCommon = useTranslations('Common');
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const params = useParams<{ evaluationId: string }>();
  const [value, setValue] = useState<EvaluationConfig | null>(null);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{
        evaluation: {
          id: string;
          classSubjectId: string;
          termId: string;
          label: string;
          type: EvaluationConfig['type'];
          maxScore: number;
          coefficient: number;
          countsTowardAverage: boolean;
          notes: string | null;
          date: string | null;
        };
      }>(`/api/school/evaluations/${params.evaluationId}`),
      api<{ classSubjects: ClassSubjectOption[] }>('/api/school/class-subjects'),
      api<{ academicYear: { terms: TermOption[] } | null }>('/api/school'),
    ])
      .then(([ev, cs, school]) => {
        setValue({
          id: ev.evaluation.id,
          classSubjectId: ev.evaluation.classSubjectId,
          termId: ev.evaluation.termId,
          label: ev.evaluation.label,
          type: ev.evaluation.type,
          maxScore: ev.evaluation.maxScore,
          coefficient: ev.evaluation.coefficient,
          countsTowardAverage: ev.evaluation.countsTowardAverage,
          notes: ev.evaluation.notes,
          date: ev.evaluation.date ? ev.evaluation.date.slice(0, 10) : null,
        });
        setClassSubjects(cs.classSubjects);
        setTerms(school.academicYear?.terms ?? []);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 404 ? t('notFound') : t('loadError'),
        );
      });
  }, [user, params.evaluationId, t]);

  async function onSave() {
    if (!value) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/school/evaluations/${value.id}`, {
        method: 'PATCH',
        body: {
          classSubjectId: value.classSubjectId,
          termId: value.termId,
          label: value.label,
          type: value.type,
          maxScore: value.maxScore,
          coefficient: value.coefficient,
          countsTowardAverage: value.countsTowardAverage,
          notes: value.notes,
          date: value.date,
        },
      });
      toast(t('updatedToast'), 'success');
      router.push(`/pedagogie/carnet-de-notes/${value.id}/saisie`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!value) return;
    if (
      !(await confirm({
        message: t('deleteConfirmMessage'),
        danger: true,
      }))
    )
      return;
    setDeleting(true);
    try {
      await api(`/api/school/evaluations/${value.id}`, { method: 'DELETE' });
      toast(t('deletedToast'), 'success');
      router.push('/pedagogie/carnet-de-notes');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
      setDeleting(false);
    }
  }

  if (!user || (!value && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (error && !value) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/pedagogie/carnet-de-notes"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('back')}
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/pedagogie/carnet-de-notes/${value!.id}/saisie`}
            className="mb-1 flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft size={14} />
            {t('backToEntry')}
          </Link>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="flex w-fit items-center gap-1.5 rounded-md bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
        >
          <Trash2 size={14} />
          {t('deleteButton')}
        </button>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border-l-[3px] border-warning-foreground bg-warning px-4 py-3">
        <AlertTriangle size={16} className="shrink-0 text-warning-foreground" />
        <div>
          <div className="text-caption font-semibold text-warning-foreground">
            {t('warningTitle')}
          </div>
          <div className="text-xs text-warning-foreground/90">{t('warningBody')}</div>
        </div>
      </div>

      <Card className="p-5">
        <EvaluationConfigForm
          value={value!}
          onChange={setValue}
          classSubjects={classSubjects}
          terms={terms}
        />
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      <Card className="flex-row flex-wrap items-center justify-between gap-2 p-3.5">
        <span className="text-caption text-muted-foreground">{t('unsavedNotice')}</span>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button variant="ghost" className="w-fit" onClick={() => router.back()}>
            {t('cancel')}
          </Button>
          <Button className="w-fit" onClick={onSave} loading={saving}>
            {saving ? (
              <>
                <Save size={14} />
                {t('saving')}
              </>
            ) : (
              <>
                <Check size={14} />
                {t('confirmChanges')}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/messages/fr/gradebook.json frontend/src/messages/ht/gradebook.json frontend/src/messages/en/gradebook.json "frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/edit/page.tsx"
git commit -m "feat(i18n): translate evaluation edit page"
```

---

### Task 3: `ParEvaluationTab.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/gradebook.json` (add `parEvaluation.*`)
- Modify: `frontend/src/app/(school)/pedagogie/carnet-de-notes/ParEvaluationTab.tsx`

**Interfaces:**
- Consumes: `Gradebook.evaluationType`, `Gradebook.evaluationStatus` (Task 1).
- Produces: nothing new consumed by later tasks.
- **Real bug fix**: `fmtDate()` currently hardcodes `.toLocaleDateString('fr-FR', ...)`. Fixed to accept the active locale and index `LOCALE_BCP47` from `@/lib/locales.ts`, same pattern as `AnneeScolaireTab.tsx`'s `fmt()`.

- [ ] **Step 1: Append `parEvaluation` to `frontend/src/messages/fr/gradebook.json`**

```json
  "parEvaluation": {
    "emptyState": "Aucune évaluation pour cette période — créez la première avec « Nouvelle évaluation ».",
    "viewEditGrades": "Voir / modifier les notes",
    "coefficient": "Coeff. {n}",
    "outOf": "Sur {n} pts",
    "absentCount": {
      "one": "1 absent",
      "other": "{count} absents"
    },
    "average": "Moyenne",
    "bestScore": "Meilleure note",
    "worstScore": "Note la plus basse",
    "gradedCount": "Notes saisies"
  }
```

- [ ] **Step 2: Append `parEvaluation` to `frontend/src/messages/en/gradebook.json`**

```json
  "parEvaluation": {
    "emptyState": "No evaluation for this period — create the first one with \"New evaluation\".",
    "viewEditGrades": "View / edit grades",
    "coefficient": "Coeff. {n}",
    "outOf": "Out of {n} pts",
    "absentCount": {
      "one": "1 absent",
      "other": "{count} absent"
    },
    "average": "Average",
    "bestScore": "Best score",
    "worstScore": "Lowest score",
    "gradedCount": "Grades entered"
  }
```

- [ ] **Step 3: Append `parEvaluation` to `frontend/src/messages/ht/gradebook.json`**

```json
  "parEvaluation": {
    "emptyState": "Pa gen evalyasyon pou peryòd sa a — kreye premye a avèk « Nouvo evalyasyon ».",
    "viewEditGrades": "Wè / modifye nòt yo",
    "coefficient": "Kowef. {n}",
    "outOf": "Sou {n} pwen",
    "absentCount": {
      "one": "1 absan",
      "other": "{count} absan"
    },
    "average": "Mwayèn",
    "bestScore": "Pi bon nòt",
    "worstScore": "Pi ba nòt",
    "gradedCount": "Nòt antre"
  }
```

- [ ] **Step 4: Rewrite `ParEvaluationTab.tsx`**

Full replacement:

```tsx
'use client';

// "Par évaluation" tab — was a toast stub ("bientôt disponible"). Flips
// the notebook's axis: instead of one row per student, one row/card per
// evaluation, with real per-evaluation stats computed client-side from
// the same `unified` data the "Vue tableau" tab already loaded (no new
// API calls, no fabricated numbers). Average/best/worst stay in the
// evaluation's own maxScore scale (no /20 rescaling here — unlike the
// Statistiques tab's cross-evaluation aggregates, each card only ever
// compares a single evaluation against itself).

import { useMemo } from 'react';
import { AlertCircle, Calendar, Pencil, UserX } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { LOCALE_BCP47 } from '@/lib/locales';
import type { EvaluationType, UnifiedNotebookData } from './types';

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

interface EvalRow {
  key: string;
  subjectName: string;
  label: string;
  type: EvaluationType;
  status: 'DRAFT' | 'PUBLISHED';
  coefficient: number;
  maxScore: number;
  date: string | null;
  average: number | null;
  best: number | null;
  worst: number | null;
  gradedCount: number;
  absentCount: number;
  totalCount: number;
}

export function ParEvaluationTab({ unified }: { unified: UnifiedNotebookData }) {
  const t = useTranslations('Gradebook.parEvaluation');
  const tType = useTranslations('Gradebook.evaluationType');
  const tStatus = useTranslations('Gradebook.evaluationStatus');
  const locale = useLocale();

  function fmtDate(d: string | null): string | null {
    if (!d) return null;
    return new Date(d).toLocaleDateString(LOCALE_BCP47[locale], { day: 'numeric', month: 'short' });
  }

  const rows = useMemo<EvalRow[]>(() => {
    const list = unified.subjects.flatMap((sub) =>
      sub.evaluations.map((ev) => {
        const scores: number[] = [];
        let absentCount = 0;
        for (const student of unified.students) {
          const cell = student.bySubject[sub.classSubjectId];
          const g = cell?.grades.find((gr) => gr.evaluationId === ev.id);
          if (!g) continue;
          if (g.absent) {
            absentCount++;
            continue;
          }
          if (g.score == null) continue;
          scores.push(g.score);
        }
        return {
          key: ev.id,
          subjectName: sub.subjectName,
          label: ev.label,
          type: ev.type,
          status: ev.status,
          coefficient: ev.coefficient,
          maxScore: ev.maxScore,
          date: ev.date,
          average:
            scores.length > 0
              ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
              : null,
          best: scores.length > 0 ? Math.max(...scores) : null,
          worst: scores.length > 0 ? Math.min(...scores) : null,
          gradedCount: scores.length,
          absentCount,
          totalCount: unified.students.length,
        };
      }),
    );
    // Chronological (undated evaluations last), stable within a subject.
    return list.sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });
  }, [unified]);

  if (rows.length === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <AlertCircle size={24} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('emptyState')}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <Card key={r.key} className="gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {unified.combined && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-semibold text-primary">
                    {r.subjectName}
                  </span>
                )}
                <span className="font-semibold text-foreground">{r.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
                  {tType(r.type)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
                    r.status === 'PUBLISHED'
                      ? 'bg-success text-success-foreground'
                      : 'bg-warning text-warning-foreground'
                  }`}
                >
                  {tStatus(r.status)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                <span>{t('coefficient', { n: r.coefficient })}</span>
                <span>{t('outOf', { n: r.maxScore })}</span>
                {fmtDate(r.date) && (
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {fmtDate(r.date)}
                  </span>
                )}
                {r.absentCount > 0 && (
                  <span className="flex items-center gap-1 text-warning-foreground">
                    <UserX size={11} />
                    {t('absentCount', { count: r.absentCount })}
                  </span>
                )}
              </div>
            </div>
            <Link
              href={`/pedagogie/carnet-de-notes/${r.key}/saisie`}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-2xs font-semibold text-foreground hover:bg-muted"
            >
              <Pencil size={12} />
              {t('viewEditGrades')}
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4">
            <EvalStat
              label={t('average')}
              value={r.average != null ? `${fmt(r.average)}/${r.maxScore}` : '—'}
            />
            <EvalStat
              label={t('bestScore')}
              value={r.best != null ? `${fmt(r.best)}/${r.maxScore}` : '—'}
            />
            <EvalStat
              label={t('worstScore')}
              value={r.worst != null ? `${fmt(r.worst)}/${r.maxScore}` : '—'}
            />
            <EvalStat label={t('gradedCount')} value={`${r.gradedCount} / ${r.totalCount}`} />
          </div>
        </Card>
      ))}
    </div>
  );
}

function EvalStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="text-caption font-bold text-foreground">{value}</div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/messages/fr/gradebook.json frontend/src/messages/ht/gradebook.json frontend/src/messages/en/gradebook.json "frontend/src/app/(school)/pedagogie/carnet-de-notes/ParEvaluationTab.tsx"
git commit -m "fix(i18n): translate ParEvaluationTab, fix hardcoded fr-FR date locale"
```

---

### Task 4: `StatistiquesTab.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/gradebook.json` (add `statistiques.*`)
- Modify: `frontend/src/app/(school)/pedagogie/carnet-de-notes/StatistiquesTab.tsx`

**Interfaces:**
- Consumes: nothing from other tasks — fully self-contained (no `TYPE_LABEL`/status usage in this file).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Append `statistiques` to `frontend/src/messages/fr/gradebook.json`**

```json
  "statistiques": {
    "emptyState": "Aucune donnée pour cette classe.",
    "passRate": "Taux de réussite",
    "passRateSub": "élèves avec moyenne ≥ 10",
    "absencesRecorded": "Absences enregistrées",
    "absencesRecordedSub": "sur l'ensemble des évaluations",
    "bestEvaluation": "Meilleure évaluation",
    "worstEvaluation": "Évaluation la plus difficile",
    "noPublishedGrade": "Aucune note publiée",
    "distributionTitle": "Répartition des notes",
    "distributionSub": "Toutes les notes saisies, ramenées sur 20 — {count} notes au total.",
    "distributionAriaLabel": "Répartition des notes par tranche",
    "byEvaluationTitle": "Moyenne par évaluation",
    "byEvaluationSub": "Moyenne de la classe pour chaque évaluation, sur 20.",
    "byEvaluationEmpty": "Aucune évaluation pour cette période.",
    "byEvaluationAriaLabel": "Moyenne de la classe par évaluation",
    "bySubjectTitle": "Moyenne par matière",
    "bySubjectSub": "Moyenne générale de la classe pour chaque matière, sur 20.",
    "bySubjectAriaLabel": "Moyenne de la classe par matière"
  }
```

- [ ] **Step 2: Append `statistiques` to `frontend/src/messages/en/gradebook.json`**

```json
  "statistiques": {
    "emptyState": "No data for this class.",
    "passRate": "Pass rate",
    "passRateSub": "students with average ≥ 10",
    "absencesRecorded": "Absences recorded",
    "absencesRecordedSub": "across all evaluations",
    "bestEvaluation": "Best evaluation",
    "worstEvaluation": "Hardest evaluation",
    "noPublishedGrade": "No published grade",
    "distributionTitle": "Grade distribution",
    "distributionSub": "All grades entered, normalized to 20 — {count} grades total.",
    "distributionAriaLabel": "Grade distribution by range",
    "byEvaluationTitle": "Average by evaluation",
    "byEvaluationSub": "Class average for each evaluation, out of 20.",
    "byEvaluationEmpty": "No evaluation for this period.",
    "byEvaluationAriaLabel": "Class average by evaluation",
    "bySubjectTitle": "Average by subject",
    "bySubjectSub": "Class general average for each subject, out of 20.",
    "bySubjectAriaLabel": "Class average by subject"
  }
```

- [ ] **Step 3: Append `statistiques` to `frontend/src/messages/ht/gradebook.json`**

```json
  "statistiques": {
    "emptyState": "Pa gen done pou klas sa a.",
    "passRate": "To reyisit",
    "passRateSub": "elèv ak mwayèn ≥ 10",
    "absencesRecorded": "Absans anrejistre",
    "absencesRecordedSub": "sou tout evalyasyon yo",
    "bestEvaluation": "Pi bon evalyasyon",
    "worstEvaluation": "Evalyasyon ki pi difisil",
    "noPublishedGrade": "Pa gen nòt pibliye",
    "distributionTitle": "Distribisyon nòt yo",
    "distributionSub": "Tout nòt ki antre yo, ranmennen sou 20 — {count} nòt antou.",
    "distributionAriaLabel": "Distribisyon nòt yo pa tranch",
    "byEvaluationTitle": "Mwayèn pa evalyasyon",
    "byEvaluationSub": "Mwayèn klas la pou chak evalyasyon, sou 20.",
    "byEvaluationEmpty": "Pa gen evalyasyon pou peryòd sa a.",
    "byEvaluationAriaLabel": "Mwayèn klas la pa evalyasyon",
    "bySubjectTitle": "Mwayèn pa matyè",
    "bySubjectSub": "Mwayèn jeneral klas la pou chak matyè, sou 20.",
    "bySubjectAriaLabel": "Mwayèn klas la pa matyè"
  }
```

- [ ] **Step 4: Rewrite `StatistiquesTab.tsx`**

Full replacement:

```tsx
'use client';

// "Statistiques" tab — was a toast stub ("bientôt disponible"). Everything
// here is derived client-side from the same `unified` notebook data the
// "Vue tableau" tab already has in memory (no new API calls): a grade
// distribution histogram, a per-evaluation average trend, a per-subject
// comparison (combined view only), and 4 KPI tiles not already shown in
// the page's top summary row.
//
// Every raw NotebookGradeCell.score is normalized to a common /20 basis
// via (score / evaluation.maxScore) * 20 before aggregation — same
// convention as src/lib/server/grades.ts (a quick quiz out of 10 and a DS
// out of 20 can't be averaged/binned together otherwise). Draft
// evaluations are included, same as "Vue tableau" itself.

import { useMemo } from 'react';
import { Award, CheckCircle2, TrendingDown, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { BarChart, type BarChartPoint } from '@/components/admin/charts/BarChart';
import type { UnifiedNotebookData } from './types';

const BUCKETS = [
  { label: '0-4', min: 0, max: 4 },
  { label: '4-8', min: 4, max: 8 },
  { label: '8-12', min: 8, max: 12 },
  { label: '12-16', min: 12, max: 16 },
  { label: '16-20', min: 16, max: 20.01 },
];

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

interface EvalStat {
  key: string;
  label: string;
  average: number | null;
  gradedCount: number;
  absentCount: number;
}

export function StatistiquesTab({ unified }: { unified: UnifiedNotebookData }) {
  const t = useTranslations('Gradebook.statistiques');
  const { distribution, evalStats, subjectStats, passRate, absentTotal, bestEval, worstEval } =
    useMemo(() => {
      const normalizedScores: number[] = [];
      let absentTotal = 0;

      const evalStats: EvalStat[] = unified.subjects.flatMap((sub) =>
        sub.evaluations.map((ev) => {
          const scores: number[] = [];
          let absentCount = 0;
          for (const student of unified.students) {
            const cell = student.bySubject[sub.classSubjectId];
            const g = cell?.grades.find((gr) => gr.evaluationId === ev.id);
            if (!g) continue;
            if (g.absent) {
              absentCount++;
              absentTotal++;
              continue;
            }
            if (g.score == null) continue;
            const normalized = ev.maxScore > 0 ? (g.score / ev.maxScore) * 20 : 0;
            scores.push(normalized);
            normalizedScores.push(normalized);
          }
          const average =
            scores.length > 0
              ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
              : null;
          return {
            key: ev.id,
            label: unified.combined ? `${sub.subjectName} · ${ev.label}` : ev.label,
            average,
            gradedCount: scores.length,
            absentCount,
          };
        }),
      );

      const distribution: BarChartPoint[] = BUCKETS.map((b) => ({
        label: b.label,
        value: normalizedScores.filter((s) => s >= b.min && s < b.max).length,
      }));

      const subjectStats: BarChartPoint[] = unified.combined
        ? unified.subjects.map((sub) => {
            const averages = unified.students
              .map((s) => s.bySubject[sub.classSubjectId]?.average)
              .filter((a): a is number => a != null);
            const avg =
              averages.length > 0
                ? Math.round((averages.reduce((s, v) => s + v, 0) / averages.length) * 10) / 10
                : 0;
            return { label: sub.subjectName, value: avg };
          })
        : [];

      const gradedGeneral = unified.students.filter((s) => s.generalAverage != null);
      const passRate =
        gradedGeneral.length > 0
          ? Math.round(
              (gradedGeneral.filter((s) => s.generalAverage! >= 10).length / gradedGeneral.length) *
                100,
            )
          : null;

      const withAverage = evalStats.filter((e) => e.average != null);
      const bestEval = withAverage.reduce<EvalStat | null>(
        (best, e) => (best === null || e.average! > best.average! ? e : best),
        null,
      );
      const worstEval = withAverage.reduce<EvalStat | null>(
        (worst, e) => (worst === null || e.average! < worst.average! ? e : worst),
        null,
      );

      return { distribution, evalStats, subjectStats, passRate, absentTotal, bestEval, worstEval };
    }, [unified]);

  if (unified.totalCount === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <p className="text-sm text-muted-foreground">{t('emptyState')}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={CheckCircle2}
          tone="success"
          label={t('passRate')}
          value={passRate != null ? `${passRate}%` : '—'}
          sub={t('passRateSub')}
        />
        <StatTile
          icon={UserX}
          tone="warning"
          label={t('absencesRecorded')}
          value={String(absentTotal)}
          sub={t('absencesRecordedSub')}
        />
        <StatTile
          icon={Award}
          tone="blue"
          label={t('bestEvaluation')}
          value={bestEval ? fmt(bestEval.average) : '—'}
          sub={bestEval?.label ?? t('noPublishedGrade')}
        />
        <StatTile
          icon={TrendingDown}
          tone="destructive"
          label={t('worstEvaluation')}
          value={worstEval ? fmt(worstEval.average) : '—'}
          sub={worstEval?.label ?? t('noPublishedGrade')}
        />
      </div>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">{t('distributionTitle')}</div>
          <p className="text-2xs text-muted-foreground">
            {t('distributionSub', { count: distribution.reduce((s, d) => s + d.value, 0) })}
          </p>
        </div>
        <BarChart
          data={distribution}
          formatValue={(v) => String(Math.round(v))}
          ariaLabel={t('distributionAriaLabel')}
        />
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">{t('byEvaluationTitle')}</div>
          <p className="text-2xs text-muted-foreground">{t('byEvaluationSub')}</p>
        </div>
        {evalStats.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{t('byEvaluationEmpty')}</p>
        ) : (
          <BarChart
            data={evalStats.map((e) => ({ label: e.label, value: e.average ?? 0 }))}
            formatValue={(v) => fmt(v)}
            ariaLabel={t('byEvaluationAriaLabel')}
          />
        )}
      </Card>

      {unified.combined && (
        <Card className="gap-3 p-4">
          <div>
            <div className="text-caption font-semibold text-foreground">{t('bySubjectTitle')}</div>
            <p className="text-2xs text-muted-foreground">{t('bySubjectSub')}</p>
          </div>
          <BarChart
            data={subjectStats}
            formatValue={(v) => fmt(v)}
            ariaLabel={t('bySubjectAriaLabel')}
          />
        </Card>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: typeof Award;
  tone: 'success' | 'warning' | 'blue' | 'destructive';
  label: string;
  value: string;
  sub: string;
}) {
  const iconBg: Record<string, string> = {
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
    blue: 'bg-info text-info-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[tone]}`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-2xs font-medium text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-foreground">{value}</div>
        <div className="truncate text-2xs text-muted-foreground">{sub}</div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/messages/fr/gradebook.json frontend/src/messages/ht/gradebook.json frontend/src/messages/en/gradebook.json "frontend/src/app/(school)/pedagogie/carnet-de-notes/StatistiquesTab.tsx"
git commit -m "feat(i18n): translate StatistiquesTab"
```

---

### Task 5: `[evaluationId]/saisie/page.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/gradebook.json` (add `saisie.*`)
- Modify: `frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/saisie/page.tsx`

**Interfaces:**
- Consumes: `Gradebook.evaluationStatus` (Task 1, for the `Brouillon` badge), `Common.errors.network` (existing).
- Produces: nothing new consumed by later tasks.
- **Fence held**: `OFFLINE_SYNC.queuedToast` import from `@/lib/constants` stays untouched — do not translate, do not remove the import.
- **Tutoiement fix**: `'Corrige les notes au-dessus de {n} avant d'enregistrer.'` → `'Corrigez les notes au-dessus de {n} avant d'enregistrer.'`

- [ ] **Step 1: Append `saisie` to `frontend/src/messages/fr/gradebook.json`**

```json
  "saisie": {
    "back": "Retour",
    "title": "Saisir des notes",
    "importCsv": "Importer (CSV)",
    "importCsvToast": "Import CSV — bientôt disponible.",
    "edit": "Modifier",
    "coefficientBadge": "Coefficient {n}",
    "outOfBadge": "Note sur {n}",
    "tableTitle": "Saisie des notes — {className}",
    "studentsBadge": "{count} élèves",
    "gradedBadge": "{count} notés",
    "pendingBadge": "{count} en attente",
    "markAllAbsent": "Tout marquer absent",
    "clearAll": "Effacer tout",
    "colNumber": "#",
    "colStudent": "Élève",
    "colScore": "Note (sur {n})",
    "colAbsent": "Absent",
    "colAveragePreview": "Aperçu moy.",
    "colComment": "Commentaire",
    "absentBadge": "Abs.",
    "maxScoreHint": "Max. {n}",
    "markAbsentAriaLabel": "Marquer absent",
    "commentPlaceholder": "Ajouter un commentaire...",
    "notedStat": "Notés :",
    "provisionalAvgStat": "Moy. provisoire :",
    "maxStat": "Max :",
    "minStat": "Min :",
    "absentsStat": "Absents :",
    "fixInvalidScores": "Corrigez les notes au-dessus de {n} avant d'enregistrer.",
    "unsavedChanges": "Modifications non enregistrées —",
    "pendingEntry": "{count} notes en attente de saisie",
    "allGraded": "Toutes les notes ont une valeur.",
    "cancel": "Annuler",
    "saveDraft": "Enregistrer brouillon",
    "validate": "Valider les notes",
    "validatedToast": "Notes validées.",
    "draftSavedToast": "Brouillon enregistré.",
    "notFound": "Évaluation introuvable.",
    "loadError": "Impossible de charger la saisie des notes."
  }
```

- [ ] **Step 2: Append `saisie` to `frontend/src/messages/en/gradebook.json`**

```json
  "saisie": {
    "back": "Back",
    "title": "Enter grades",
    "importCsv": "Import (CSV)",
    "importCsvToast": "CSV import — coming soon.",
    "edit": "Edit",
    "coefficientBadge": "Coefficient {n}",
    "outOfBadge": "Score out of {n}",
    "tableTitle": "Grade entry — {className}",
    "studentsBadge": "{count} students",
    "gradedBadge": "{count} graded",
    "pendingBadge": "{count} pending",
    "markAllAbsent": "Mark all absent",
    "clearAll": "Clear all",
    "colNumber": "#",
    "colStudent": "Student",
    "colScore": "Score (out of {n})",
    "colAbsent": "Absent",
    "colAveragePreview": "Avg. preview",
    "colComment": "Comment",
    "absentBadge": "Abs.",
    "maxScoreHint": "Max. {n}",
    "markAbsentAriaLabel": "Mark absent",
    "commentPlaceholder": "Add a comment...",
    "notedStat": "Graded:",
    "provisionalAvgStat": "Provisional avg.:",
    "maxStat": "Max:",
    "minStat": "Min:",
    "absentsStat": "Absent:",
    "fixInvalidScores": "Fix the scores above {n} before saving.",
    "unsavedChanges": "Unsaved changes —",
    "pendingEntry": "{count} grades still to enter",
    "allGraded": "All grades have a value.",
    "cancel": "Cancel",
    "saveDraft": "Save draft",
    "validate": "Validate grades",
    "validatedToast": "Grades validated.",
    "draftSavedToast": "Draft saved.",
    "notFound": "Evaluation not found.",
    "loadError": "Unable to load grade entry."
  }
```

- [ ] **Step 3: Append `saisie` to `frontend/src/messages/ht/gradebook.json`**

```json
  "saisie": {
    "back": "Retounen",
    "title": "Antre nòt yo",
    "importCsv": "Enpòte (CSV)",
    "importCsvToast": "Enpòte CSV — talè konsa.",
    "edit": "Modifye",
    "coefficientBadge": "Koefisyan {n}",
    "outOfBadge": "Nòt sou {n}",
    "tableTitle": "Antre nòt yo — {className}",
    "studentsBadge": "{count} elèv",
    "gradedBadge": "{count} note",
    "pendingBadge": "{count} an atant",
    "markAllAbsent": "Make tout moun absan",
    "clearAll": "Efase tout",
    "colNumber": "#",
    "colStudent": "Elèv",
    "colScore": "Nòt (sou {n})",
    "colAbsent": "Absan",
    "colAveragePreview": "Apèsi mwayèn",
    "colComment": "Kòmantè",
    "absentBadge": "Abs.",
    "maxScoreHint": "Maks. {n}",
    "markAbsentAriaLabel": "Make absan",
    "commentPlaceholder": "Ajoute yon kòmantè...",
    "notedStat": "Note :",
    "provisionalAvgStat": "Mwayèn pwovizwa :",
    "maxStat": "Maks :",
    "minStat": "Min :",
    "absentsStat": "Absan :",
    "fixInvalidScores": "Korije nòt ki pi wo pase {n} anvan ou anrejistre.",
    "unsavedChanges": "Chanjman ki pa anrejistre —",
    "pendingEntry": "{count} nòt ki rete pou antre",
    "allGraded": "Tout nòt yo gen yon valè.",
    "cancel": "Anile",
    "saveDraft": "Anrejistre bouyon",
    "validate": "Valide nòt yo",
    "validatedToast": "Nòt yo valide.",
    "draftSavedToast": "Bouyon anrejistre.",
    "notFound": "Nou pa jwenn evalyasyon an.",
    "loadError": "Nou pa t kapab chaje antre nòt yo."
  }
```

- [ ] **Step 4: Rewrite `[evaluationId]/saisie/page.tsx`**

Full replacement:

```tsx
'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Check,
  Save,
  Upload,
  UserX,
  Eraser,
  Users,
  BarChart2,
  TrendingUp,
  TrendingDown,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageNumbers } from '@/components/ui/Pager';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { submitOrQueue } from '@/lib/offline-queue';
import { OFFLINE_SYNC } from '@/lib/constants';

interface EvaluationDetail {
  id: string;
  label: string;
  type: string;
  maxScore: number;
  coefficient: number;
  countsTowardAverage: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  date: string | null;
  classSubjectId: string;
  termId: string;
  classSubject: {
    class: { id: string; name: string };
    subject: { id: string; name: string };
    teacher: { id: string; name: string } | null;
  };
  term: { id: string; label: string };
}

interface NotebookStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  grades: { evaluationId: string; score: number | null; absent: boolean; comment: string | null }[];
}

interface NotebookResponse {
  evaluations: { id: string; coefficient: number; status: string; countsTowardAverage: boolean }[];
  students: NotebookStudent[];
}

interface RowState {
  score: string;
  absent: boolean;
  comment: string;
}

const PAGE_SIZE = 20;

function tone(avg: number | null): 'excellent' | 'good' | 'average' | 'poor' | 'neutral' {
  if (avg == null) return 'neutral';
  if (avg < 8) return 'poor';
  if (avg < 12) return 'average';
  if (avg < 16) return 'good';
  return 'excellent';
}
const PILL_CLASS: Record<string, string> = {
  excellent: 'bg-success text-success-foreground',
  good: 'bg-info text-info-foreground',
  average: 'bg-warning text-warning-foreground',
  poor: 'bg-destructive text-destructive-foreground',
  neutral: 'bg-muted text-muted-foreground',
};

export default function GradeEntryPage() {
  const t = useTranslations('Gradebook.saisie');
  const tStatus = useTranslations('Gradebook.evaluationStatus');
  const tCommon = useTranslations('Common');
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams<{ evaluationId: string }>();
  const [evaluation, setEvaluation] = useState<EvaluationDetail | null>(null);
  const [notebook, setNotebook] = useState<NotebookResponse | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!user) return;
    api<{ evaluation: EvaluationDetail }>(`/api/school/evaluations/${params.evaluationId}`)
      .then((res) => {
        setEvaluation(res.evaluation);
        return api<NotebookResponse>(
          `/api/school/class-subjects/${res.evaluation.classSubjectId}/notebook?termId=${res.evaluation.termId}`,
        );
      })
      .then((nb) => {
        setNotebook(nb);
        const initial: Record<string, RowState> = {};
        for (const s of nb.students) {
          const cell = s.grades.find((g) => g.evaluationId === params.evaluationId);
          initial[s.studentId] = {
            score: cell?.score != null ? String(cell.score) : '',
            absent: cell?.absent ?? false,
            comment: cell?.comment ?? '',
          };
        }
        setRows(initial);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError(t('notFound'));
          return;
        }
        setError(t('loadError'));
      });
  }, [user, params.evaluationId, t]);

  function previewAverage(studentId: string): number | null {
    if (!notebook || !evaluation) return null;
    const student = notebook.students.find((s) => s.studentId === studentId);
    if (!student) return null;
    const row = rows[studentId];
    const rowsForAvg: { value: number; weight: number }[] = [];
    for (const ev of notebook.evaluations) {
      if (ev.id === evaluation.id) {
        if (row && !row.absent && row.score.trim() !== '' && !Number.isNaN(Number(row.score))) {
          rowsForAvg.push({ value: Number(row.score), weight: ev.coefficient });
        }
        continue;
      }
      if (ev.status !== 'PUBLISHED' || !ev.countsTowardAverage) continue;
      const cell = student.grades.find((g) => g.evaluationId === ev.id);
      if (cell && !cell.absent && cell.score != null)
        rowsForAvg.push({ value: cell.score, weight: ev.coefficient });
    }
    if (rowsForAvg.length === 0) return null;
    const totalWeight = rowsForAvg.reduce((a, r) => a + r.weight, 0);
    return (
      Math.round((rowsForAvg.reduce((a, r) => a + r.value * r.weight, 0) / totalWeight) * 10) / 10
    );
  }

  const stats = useMemo(() => {
    const values = Object.values(rows);
    const scored = values.filter(
      (r) => !r.absent && r.score.trim() !== '' && !Number.isNaN(Number(r.score)),
    );
    const nums = scored.map((r) => Number(r.score));
    const absents = values.filter((r) => r.absent).length;
    return {
      noted: scored.length,
      total: values.length,
      avg: nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
        : null,
      max: nums.length ? Math.max(...nums) : null,
      min: nums.length ? Math.min(...nums) : null,
      absents,
      pending: values.length - scored.length - absents,
    };
  }, [rows]);

  // The server rejects a score above evaluation.maxScore outright (it
  // would corrupt every average computed from it) — mirror that here so
  // "Enregistrer"/"Valider" are disabled instead of firing a request that
  // will 400, and the teacher sees why before they click.
  const hasInvalidScore = useMemo(() => {
    if (!evaluation) return false;
    return Object.values(rows).some((r) => {
      if (r.absent || r.score.trim() === '') return false;
      const num = Number(r.score);
      return Number.isNaN(num) || num > evaluation.maxScore || num < 0;
    });
  }, [rows, evaluation]);

  function setRow(studentId: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [studentId]: { ...prev[studentId]!, ...patch } }));
  }

  function markAllAbsent() {
    setRows((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next))
        next[id] = { score: '', absent: true, comment: next[id]!.comment };
      return next;
    });
  }
  function clearAll() {
    setRows((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) next[id] = { score: '', absent: false, comment: '' };
      return next;
    });
  }

  async function save(publish: boolean) {
    if (!evaluation || !notebook || !user) return;
    setSaving(true);
    setError(null);
    try {
      const grades = notebook.students.map((s) => {
        const r = rows[s.studentId]!;
        return {
          studentId: s.studentId,
          score: r.absent || r.score.trim() === '' ? null : Number(r.score),
          absent: r.absent,
          comment: r.comment.trim() || null,
        };
      });
      const gradesResult = await submitOrQueue(
        {
          path: `/api/school/evaluations/${evaluation.id}/grades`,
          method: 'PUT',
          body: { grades },
          label: `Notes — ${evaluation.classSubject.subject.name}`,
        },
        user.id,
      );
      let queued = gradesResult.queued;
      if (publish) {
        const publishResult = await submitOrQueue(
          {
            path: `/api/school/evaluations/${evaluation.id}`,
            method: 'PATCH' as const,
            body: { status: 'PUBLISHED' },
            label: `Validation — ${evaluation.classSubject.subject.name}`,
          },
          user.id,
        );
        queued = queued || publishResult.queued;
      }
      if (queued) {
        toast(OFFLINE_SYNC.queuedToast, 'info');
      } else if (publish) {
        toast(t('validatedToast'), 'success');
      } else {
        toast(t('draftSavedToast'), 'success');
      }
      if (publish) {
        router.push('/pedagogie/carnet-de-notes');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSaving(false);
    }
  }

  if (!user || (!evaluation && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (error || !evaluation || !notebook) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/pedagogie/carnet-de-notes"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('back')}
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(notebook.students.length / PAGE_SIZE));
  const pageStudents = notebook.students.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={`${LIST_PAGE} gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/pedagogie/carnet-de-notes"
            className="mb-1 flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft size={14} />
            {t('back')}
          </Link>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => toast(t('importCsvToast'), 'info')}
          >
            <Upload size={14} />
            {t('importCsv')}
          </Button>
          <Link
            href={`/pedagogie/carnet-de-notes/${evaluation.id}/edit`}
            className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground"
          >
            <Pencil size={14} />
            {t('edit')}
          </Link>
        </div>
      </div>

      <Card className="flex-row flex-wrap items-center gap-2 p-3.5">
        <Badge>{evaluation.classSubject.class.name}</Badge>
        <Badge>{evaluation.classSubject.subject.name}</Badge>
        <Badge muted>{evaluation.term.label}</Badge>
        <Badge muted>{evaluation.label}</Badge>
        <Badge muted>{t('coefficientBadge', { n: evaluation.coefficient })}</Badge>
        <Badge muted>{t('outOfBadge', { n: evaluation.maxScore })}</Badge>
        {evaluation.status === 'DRAFT' && <Badge warning>{tStatus('DRAFT')}</Badge>}
      </Card>

      <Card className="gap-0 overflow-visible">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {t('tableTitle', { className: evaluation.classSubject.class.name })}
            </span>
            <Badge muted small>
              {t('studentsBadge', { count: stats.total })}
            </Badge>
            <Badge success small>
              {t('gradedBadge', { count: stats.noted })}
            </Badge>
            {stats.pending > 0 && (
              <Badge warning small>
                {t('pendingBadge', { count: stats.pending })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAllAbsent}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <UserX size={12} />
              {t('markAllAbsent')}
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <Eraser size={12} />
              {t('clearAll')}
            </button>
          </div>
        </div>

        <div className={TABLE_SCROLL}>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className={STICKY_THEAD}>
              <tr className="border-b border-border">
                <th className="w-9 py-2.5 pl-4 text-left text-2xs font-semibold text-muted-foreground">
                  {t('colNumber')}
                </th>
                <th className="py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('colStudent')}
                </th>
                <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('colScore', { n: evaluation.maxScore })}
                </th>
                <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('colAbsent')}
                </th>
                <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('colAveragePreview')}
                </th>
                <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('colComment')}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageStudents.map((s, i) => {
                const row = rows[s.studentId] ?? { score: '', absent: false, comment: '' };
                const num = Number(row.score);
                const invalid =
                  row.score.trim() !== '' && (Number.isNaN(num) || num > evaluation.maxScore);
                const preview = previewAverage(s.studentId);
                return (
                  <tr key={s.studentId} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 pl-4 text-xs font-semibold text-muted-foreground">
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size={28} />
                        <div>
                          <div
                            className={`text-caption font-semibold ${row.absent ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                          >
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="text-2xs text-muted-foreground">#{s.studentNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {row.absent ? (
                        <span className="inline-flex h-8 w-16 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                          {t('absentBadge')}
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <input
                            value={row.score}
                            onChange={(e) => setRow(s.studentId, { score: e.target.value })}
                            inputMode="decimal"
                            className={`h-8 w-16 rounded-md border-[1.5px] text-center text-sm font-semibold outline-none ${
                              invalid
                                ? 'border-destructive-foreground bg-destructive text-destructive-foreground'
                                : 'border-border bg-input text-foreground focus:border-primary'
                            }`}
                          />
                          {invalid && (
                            <span className="text-[10px] font-semibold text-destructive-foreground">
                              {t('maxScoreHint', { n: evaluation.maxScore })}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => setRow(s.studentId, { absent: !row.absent, score: '' })}
                        aria-label={t('markAbsentAriaLabel')}
                        aria-pressed={row.absent}
                        className={`mx-auto flex h-6.5 w-6.5 items-center justify-center rounded-md ${row.absent ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                      >
                        <UserX size={14} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`inline-flex min-w-13 items-center justify-center rounded-md px-2 py-1 text-xs font-bold ${PILL_CLASS[tone(preview)]}`}
                      >
                        {preview != null ? preview.toFixed(1) : '—'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <input
                        value={row.comment}
                        onChange={(e) => setRow(s.studentId, { comment: e.target.value })}
                        placeholder={t('commentPlaceholder')}
                        className="w-full min-w-[160px] rounded-md border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-border focus:border-primary"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border bg-muted px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users size={13} />
              {t('notedStat')}{' '}
              <strong className="text-foreground">
                {stats.noted} / {stats.total}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart2 size={13} />
              {t('provisionalAvgStat')}{' '}
              <strong className="text-primary">
                {stats.avg != null ? stats.avg.toFixed(1) : '—'} / {evaluation.maxScore}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp size={13} />
              {t('maxStat')} <strong className="text-success-foreground">{stats.max ?? '—'}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingDown size={13} />
              {t('minStat')} <strong className="text-destructive-foreground">{stats.min ?? '—'}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <UserX size={13} />
              {t('absentsStat')} <strong className="text-foreground">{stats.absents}</strong>
            </span>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <PageNumbers page={page} totalPages={pageCount} onChange={setPage} />
            </div>
          )}
        </div>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      <Card className="flex-row flex-wrap items-center justify-between gap-2 p-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${hasInvalidScore ? 'bg-destructive-foreground' : 'bg-warning-foreground'}`}
          />
          <span className="text-caption text-muted-foreground">
            {hasInvalidScore ? (
              <strong className="text-destructive-foreground">
                {t('fixInvalidScores', { n: evaluation.maxScore })}
              </strong>
            ) : stats.pending > 0 ? (
              <>
                {t('unsavedChanges')}{' '}
                <strong className="text-foreground">{t('pendingEntry', { count: stats.pending })}</strong>
              </>
            ) : (
              t('allGraded')
            )}
          </span>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button
            variant="ghost"
            className="w-fit"
            onClick={() => router.push('/pedagogie/carnet-de-notes')}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => save(false)}
            loading={saving}
            disabled={hasInvalidScore}
          >
            <Save size={14} />
            {t('saveDraft')}
          </Button>
          <Button
            className="w-fit"
            onClick={() => save(true)}
            loading={saving}
            disabled={hasInvalidScore}
          >
            <Check size={14} />
            {t('validate')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Badge({
  children,
  muted,
  warning,
  success,
  small,
}: {
  children: ReactNode;
  muted?: boolean;
  warning?: boolean;
  success?: boolean;
  small?: boolean;
}) {
  const cls = warning
    ? 'bg-warning text-warning-foreground'
    : success
      ? 'bg-success text-success-foreground'
      : muted
        ? 'bg-muted text-muted-foreground'
        : 'bg-secondary text-primary';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${small ? 'text-2xs' : 'text-xs'} ${cls}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/messages/fr/gradebook.json frontend/src/messages/ht/gradebook.json frontend/src/messages/en/gradebook.json "frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/saisie/page.tsx"
git commit -m "fix(i18n): translate grade entry page, fix tutoiement violation"
```

---

### Task 6: `page.tsx` (main grade-book screen) + CLAUDE.md update

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/gradebook.json` (add `page.*`)
- Modify: `frontend/src/app/(school)/pedagogie/carnet-de-notes/page.tsx`
- Modify: `CLAUDE.md` (Internationalisation paragraph)

**Interfaces:**
- Consumes: `Gradebook.evaluationStatus` (Task 1, for the DRAFT tooltip suffix), `NewEvaluationModal` (Task 1), `StatistiquesTab`/`ParEvaluationTab` (Tasks 3-4). All already translated by their own `useTranslations` calls — `page.tsx` itself passes no translated props to them.
- Produces: nothing — final content task in this plan.
- **Tutoiement fixes**: `'Configure d'abord des classes...'` → `'Configurez d'abord des classes...'`; `"Crée d'abord une évaluation."` → `"Créez d'abord une évaluation."`
- **CSV filename tokens are translated too** — `carnet-notes` prefix and `toutes-matieres` suffix become locale-aware, matching the level of care applied elsewhere in this module (this is a live, already-shipped export feature, not deferred material like bulletin PDFs).

- [ ] **Step 1: Append `page` to `frontend/src/messages/fr/gradebook.json`**

```json
  "page": {
    "title": "Carnet de notes",
    "subtitle": "Saisie et consultation des notes — Année scolaire {year}",
    "export": "Exporter",
    "newEvaluation": "Saisir évaluation",
    "loadError": "Impossible de charger le carnet de notes.",
    "noClasses": "Configurez d'abord des classes, matières et affectations avant de saisir des notes.",
    "gradedStudents": "Élèves notés",
    "outOfStudents": "sur {count} élèves",
    "generalClassAverage": "Moyenne générale de classe",
    "classAverage": "Moyenne de classe",
    "outOf20": "sur 20 pts",
    "bestAverage": "Meilleure moyenne",
    "insufficientGrade": "Note insuffisante",
    "belowAverage": "élèves sous la moyenne",
    "period": "Période",
    "searchPlaceholder": "Rechercher un élève...",
    "allSubjects": "Toutes les matières",
    "studentCount": "{count} élèves",
    "tabTable": "Vue tableau",
    "tabStats": "Statistiques",
    "tabByEval": "Par évaluation",
    "noStudentsInClass": "Aucun élève inscrit dans cette classe.",
    "colStudent": "Élève",
    "colCoefficient": "Coeff. {n}",
    "colAverageAbbr": "Moy.",
    "colAverage": "Moyenne",
    "colRank": "Rang",
    "cellAbsent": "Abs.",
    "evalTooltip": "{label} — Coeff. {coefficient}",
    "evalTooltipDraft": "{label} — Coeff. {coefficient} (brouillon)",
    "paginationSummary": "Affichage de {from} à {to} sur {total} élèves — Moy. {kind} : {value}/20",
    "avgKindGeneral": "générale",
    "avgKindClass": "classe",
    "menuViewReportCard": "Voir le bulletin",
    "menuViewReportCardToast": "Disponible avec Epic 7 (Bulletins).",
    "menuEditGrades": "Modifier les notes",
    "menuEditGradesToast": "Créez d'abord une évaluation.",
    "menuHistory": "Historique des notes",
    "menuHistoryToast": "Historique — bientôt disponible.",
    "menuAddAppreciation": "Ajouter appréciation",
    "menuAddAppreciationToast": "Disponible avec le module Appréciations.",
    "menuContactGuardian": "Contacter le tuteur",
    "menuContactGuardianToast": "Messagerie — bientôt disponible.",
    "menuDeleteGrades": "Supprimer les notes",
    "clearGradesConfirm": "Supprimer toutes les notes de {name} pour cette période ?",
    "gradesDeletedToast": "Notes supprimées.",
    "deleteErrorToast": "Erreur lors de la suppression.",
    "csv": {
      "colNumber": "N°",
      "colGeneralAverage": "Moyenne générale",
      "subjectAvgColumn": "{subject} — Moy.",
      "filenamePrefix": "carnet-notes",
      "allSubjectsSuffix": "toutes-matieres"
    }
  }
```

- [ ] **Step 2: Append `page` to `frontend/src/messages/en/gradebook.json`**

```json
  "page": {
    "title": "Grade book",
    "subtitle": "Enter and view grades — School year {year}",
    "export": "Export",
    "newEvaluation": "New evaluation",
    "loadError": "Unable to load the grade book.",
    "noClasses": "Set up classes, subjects, and assignments first before entering grades.",
    "gradedStudents": "Students graded",
    "outOfStudents": "out of {count} students",
    "generalClassAverage": "Class general average",
    "classAverage": "Class average",
    "outOf20": "out of 20 pts",
    "bestAverage": "Best average",
    "insufficientGrade": "Below-average grade",
    "belowAverage": "students below average",
    "period": "Period",
    "searchPlaceholder": "Search for a student...",
    "allSubjects": "All subjects",
    "studentCount": "{count} students",
    "tabTable": "Table view",
    "tabStats": "Statistics",
    "tabByEval": "By evaluation",
    "noStudentsInClass": "No student enrolled in this class.",
    "colStudent": "Student",
    "colCoefficient": "Coeff. {n}",
    "colAverageAbbr": "Avg.",
    "colAverage": "Average",
    "colRank": "Rank",
    "cellAbsent": "Abs.",
    "evalTooltip": "{label} — Coeff. {coefficient}",
    "evalTooltipDraft": "{label} — Coeff. {coefficient} (draft)",
    "paginationSummary": "Showing {from} to {to} of {total} students — {kind} avg.: {value}/20",
    "avgKindGeneral": "general",
    "avgKindClass": "class",
    "menuViewReportCard": "View report card",
    "menuViewReportCardToast": "Available with Epic 7 (Report cards).",
    "menuEditGrades": "Edit grades",
    "menuEditGradesToast": "Create an evaluation first.",
    "menuHistory": "Grade history",
    "menuHistoryToast": "History — coming soon.",
    "menuAddAppreciation": "Add appreciation",
    "menuAddAppreciationToast": "Available with the Appreciations module.",
    "menuContactGuardian": "Contact the guardian",
    "menuContactGuardianToast": "Messaging — coming soon.",
    "menuDeleteGrades": "Delete grades",
    "clearGradesConfirm": "Delete all of {name}'s grades for this period?",
    "gradesDeletedToast": "Grades deleted.",
    "deleteErrorToast": "Error while deleting.",
    "csv": {
      "colNumber": "No.",
      "colGeneralAverage": "General average",
      "subjectAvgColumn": "{subject} — Avg.",
      "filenamePrefix": "gradebook",
      "allSubjectsSuffix": "all-subjects"
    }
  }
```

- [ ] **Step 3: Append `page` to `frontend/src/messages/ht/gradebook.json`**

```json
  "page": {
    "title": "Kanè nòt",
    "subtitle": "Antre ak gade nòt yo — Ane eskolè {year}",
    "export": "Ekspòte",
    "newEvaluation": "Nouvo evalyasyon",
    "loadError": "Nou pa t kapab chaje kanè nòt la.",
    "noClasses": "Konfigire klas, matyè ak afektasyon anvan ou antre nòt.",
    "gradedStudents": "Elèv note",
    "outOfStudents": "sou {count} elèv",
    "generalClassAverage": "Mwayèn jeneral klas la",
    "classAverage": "Mwayèn klas la",
    "outOf20": "sou 20 pwen",
    "bestAverage": "Pi bon mwayèn",
    "insufficientGrade": "Nòt ki pa sifi",
    "belowAverage": "elèv anba mwayèn",
    "period": "Peryòd",
    "searchPlaceholder": "Chèche yon elèv...",
    "allSubjects": "Tout matyè yo",
    "studentCount": "{count} elèv",
    "tabTable": "Vi tablo",
    "tabStats": "Estatistik",
    "tabByEval": "Pa evalyasyon",
    "noStudentsInClass": "Pa gen elèv enskri nan klas sa a.",
    "colStudent": "Elèv",
    "colCoefficient": "Kowef. {n}",
    "colAverageAbbr": "Mwa.",
    "colAverage": "Mwayèn",
    "colRank": "Ran",
    "cellAbsent": "Abs.",
    "evalTooltip": "{label} — Kowef. {coefficient}",
    "evalTooltipDraft": "{label} — Kowef. {coefficient} (bouyon)",
    "paginationSummary": "Montre {from} rive {to} sou {total} elèv — Mwayèn {kind} : {value}/20",
    "avgKindGeneral": "jeneral",
    "avgKindClass": "klas",
    "menuViewReportCard": "Wè bilten an",
    "menuViewReportCardToast": "Disponib avèk Epic 7 (Bilten yo).",
    "menuEditGrades": "Modifye nòt yo",
    "menuEditGradesToast": "Kreye yon evalyasyon anvan.",
    "menuHistory": "Istorik nòt yo",
    "menuHistoryToast": "Istorik — talè konsa.",
    "menuAddAppreciation": "Ajoute apresyasyon",
    "menuAddAppreciationToast": "Disponib avèk modil Apresyasyon an.",
    "menuContactGuardian": "Kontakte responsab la",
    "menuContactGuardianToast": "Mesajri — talè konsa.",
    "menuDeleteGrades": "Efase nòt yo",
    "clearGradesConfirm": "Efase tout nòt {name} pou peryòd sa a?",
    "gradesDeletedToast": "Nòt yo efase.",
    "deleteErrorToast": "Erè pandan n ap efase.",
    "csv": {
      "colNumber": "Nimewo",
      "colGeneralAverage": "Mwayèn jeneral",
      "subjectAvgColumn": "{subject} — Mwa.",
      "filenamePrefix": "kanè-nòt",
      "allSubjectsSuffix": "tout-matye"
    }
  }
```

- [ ] **Step 4: Rewrite `page.tsx`**

Full replacement (imports gain `useTranslations` from `next-intl`; every literal French string described below is replaced by its `t('page.*')`/`t('page.csv.*')` equivalent — the JSX structure, class names, and business logic are otherwise byte-identical to the pre-migration file):

```tsx
'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  NotebookPen,
  Users,
  BarChart2,
  TrendingUp,
  TrendingDown,
  Calendar,
  Plus,
  Download,
  Eye,
  Star,
  History,
  Mail,
  Trash2,
  Pencil,
  FileText,
  Table2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageNumbers } from '@/components/ui/Pager';
import { exportToCsv } from '@/lib/csv-export';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
// Code-split: only shown after clicking "Saisir évaluation" — see the
// matching StudentFormModal split in eleves/page.tsx for why.
const NewEvaluationModal = dynamic(
  () => import('./NewEvaluationModal').then((m) => m.NewEvaluationModal),
  { ssr: false },
);
// Code-split: only mounted once the user switches to that tab (default is
// "table") — same reasoning as the StudentFormModal split in eleves/page.tsx.
const StatistiquesTab = dynamic(() => import('./StatistiquesTab').then((m) => m.StatistiquesTab), {
  ssr: false,
});
const ParEvaluationTab = dynamic(
  () => import('./ParEvaluationTab').then((m) => m.ParEvaluationTab),
  { ssr: false },
);
import type {
  ClassSubjectOption,
  CombinedNotebookData,
  NotebookData,
  TermOption,
  UnifiedNotebookData,
  UnifiedStudentRow,
} from './types';

const PAGE_SIZE = 20;

// table-layout: fixed drives column sizing instead of the browser
// auto-sizing to content. Élève/Moyenne/Rang/kebab get an EXPLICIT pixel
// width via <colgroup> — they must never flex, or the sticky-right offsets
// (computed from these same constants) drift out of alignment. Evaluation
// and per-subject "Moy." columns get NO <colgroup> width, only a
// min-width on their actual cells: under table-layout:fixed, an
// unspecified <col> shares any leftover space equally once the table is
// wider than its content — so a sparse table (few subjects/evaluations)
// stretches to fill the screen instead of leaving dead space after
// Moyenne/Rang/kebab — while the min-width still stops them shrinking
// below a readable size when there are enough columns to overflow (5
// subjects × 3-4 evals = ~20 columns used to wrap "Coeff. N" onto its own
// line under table-layout:auto).
const ELEVE_W = 200;
const EVAL_COL_W = 104;
const SUBJECT_AVG_COL_W = 76;
const MOYENNE_W = 92;
const RANG_W = 64;
const KEBAB_W = 44;
const RIGHT_RANG = KEBAB_W;
const RIGHT_MOYENNE = KEBAB_W + RANG_W;

const STICKY_LEFT = 'sticky z-10 border-r-2 border-border bg-card';
const STICKY_KEBAB = 'sticky z-10 bg-card';
const STICKY_RANG = 'sticky z-10 bg-card';
const STICKY_MOYENNE = 'sticky z-10 border-l-2 border-border bg-card';
const stickyLeftStyle = { left: 0 };
const stickyKebabStyle = { right: 0 };
const stickyRangStyle = { right: RIGHT_RANG };
const stickyMoyenneStyle = { right: RIGHT_MOYENNE };

function tone(avg: number | null): 'excellent' | 'good' | 'average' | 'poor' | 'neutral' {
  if (avg == null) return 'neutral';
  if (avg < 8) return 'poor';
  if (avg < 12) return 'average';
  if (avg < 16) return 'good';
  return 'excellent';
}

const PILL_CLASS: Record<string, string> = {
  excellent: 'bg-success text-success-foreground',
  good: 'bg-info text-info-foreground',
  average: 'bg-warning text-warning-foreground',
  poor: 'bg-destructive text-destructive-foreground',
  neutral: 'bg-muted text-muted-foreground',
};

const RANK_CLASS: Record<number, string> = {
  1: 'bg-warning text-warning-foreground',
  2: 'bg-muted text-[#6b7280]',
  3: 'bg-[#fdf3ea] text-[#c2612a]',
};

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

function toUnifiedSingle(d: NotebookData): UnifiedNotebookData {
  return {
    combined: false,
    className: d.className,
    terms: d.terms,
    resolvedTermId: d.resolvedTermId,
    subjects: [
      { classSubjectId: d.classSubjectId, subjectName: d.subjectName, evaluations: d.evaluations },
    ],
    students: d.students.map((s) => ({
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      studentNumber: s.studentNumber,
      bySubject: {
        [d.classSubjectId]: {
          classSubjectId: d.classSubjectId,
          grades: s.grades,
          average: s.average,
        },
      },
      generalAverage: s.average,
      rank: s.rank,
    })),
    classAverage: d.classAverage,
    bestScore: d.bestScore,
    worstScore: d.worstScore,
    gradedCount: d.gradedCount,
    totalCount: d.totalCount,
  };
}

function toUnifiedCombined(d: CombinedNotebookData): UnifiedNotebookData {
  return {
    combined: true,
    className: d.className,
    terms: d.terms,
    resolvedTermId: d.resolvedTermId,
    subjects: d.subjects.map((s) => ({
      classSubjectId: s.classSubjectId,
      subjectName: s.subjectName,
      evaluations: s.evaluations,
    })),
    students: d.students.map((s) => ({
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      studentNumber: s.studentNumber,
      bySubject: Object.fromEntries(s.subjects.map((sc) => [sc.classSubjectId, sc])),
      generalAverage: s.generalAverage,
      rank: s.rank,
    })),
    classAverage: d.classAverage,
    bestScore: d.bestScore,
    worstScore: d.worstScore,
    gradedCount: d.gradedCount,
    totalCount: d.totalCount,
  };
}

export default function GradeNotebookPage() {
  const t = useTranslations('Gradebook.page');
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [classSubjects, setClassSubjects] = useState<ClassSubjectOption[]>([]);
  // Class picker = the ACTIVE year's classes (`/api/school/classes`), not
  // just the classes that have subject affectations — a brand-new class must
  // show up here immediately (its notebook is simply empty until subjects
  // are assigned), and archived-year classes never.
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [classId, setClassId] = useState('');
  const [subjectValue, setSubjectValue] = useState(''); // classSubjectId, or 'ALL' for combined view
  const [termId, setTermId] = useState('');
  const [unified, setUnified] = useState<UnifiedNotebookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [view, setView] = useState<'table' | 'stats' | 'byEval'>('table');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ classes: Array<{ id: string; name: string }> }>('/api/school/classes'),
      api<{ classSubjects: ClassSubjectOption[] }>('/api/school/class-subjects'),
      api<{ academicYear: { terms: TermOption[] } | null }>('/api/school'),
    ])
      .then(([cl, cs, school]) => {
        setClasses(cl.classes.map((c) => ({ id: c.id, name: c.name })));
        setClassSubjects(cs.classSubjects);
        setTerms(school.academicYear?.terms ?? []);
        const firstClass = cl.classes[0];
        if (firstClass) {
          setClassId(firstClass.id);
          const firstSubject = cs.classSubjects.find((x) => x.classId === firstClass.id);
          setSubjectValue(firstSubject ? firstSubject.id : 'ALL');
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError(t('loadError'));
      });
  }, [user, router, t]);

  useEffect(() => {
    if (!classId || !subjectValue) return;
    const qs = termId ? `?termId=${termId}` : '';
    const request =
      subjectValue === 'ALL'
        ? api<CombinedNotebookData>(`/api/school/classes/${classId}/notebook${qs}`).then(
            toUnifiedCombined,
          )
        : api<NotebookData>(`/api/school/class-subjects/${subjectValue}/notebook${qs}`).then(
            toUnifiedSingle,
          );
    request
      .then((u) => {
        setUnified(u);
        setTermId(u.resolvedTermId ?? '');
        setPage(1);
      })
      .catch(() => setError(t('loadError')));
  }, [classId, subjectValue, termId, t]);

  const subjectsForClass = classSubjects.filter((cs) => cs.classId === classId);
  const combined = subjectValue === 'ALL';

  const tableWidth = unified
    ? ELEVE_W +
      unified.subjects.reduce((n, s) => n + s.evaluations.length, 0) * EVAL_COL_W +
      (unified.combined ? unified.subjects.length * SUBJECT_AVG_COL_W : 0) +
      MOYENNE_W +
      RANG_W +
      KEBAB_W
    : ELEVE_W + MOYENNE_W + RANG_W + KEBAB_W;

  const filteredStudents = useMemo(() => {
    if (!unified) return [];
    const q = search.trim().toLowerCase();
    if (!q) return unified.students;
    return unified.students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
  }, [unified, search]);
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const pageStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function clearStudentGrades(student: UnifiedStudentRow) {
    if (!unified) return;
    const allEvals = unified.subjects.flatMap((s) => s.evaluations);
    if (allEvals.length === 0) return;
    if (
      !(await confirm({
        message: t('clearGradesConfirm', { name: `${student.firstName} ${student.lastName}` }),
        danger: true,
      }))
    )
      return;
    try {
      await Promise.all(
        allEvals.map((ev) =>
          api(`/api/school/evaluations/${ev.id}/grades`, {
            method: 'PUT',
            body: { grades: [{ studentId: student.studentId, score: null, absent: false }] },
          }),
        ),
      );
      setUnified((prev) =>
        prev
          ? {
              ...prev,
              students: prev.students.map((s) =>
                s.studentId === student.studentId
                  ? {
                      ...s,
                      generalAverage: null,
                      bySubject: Object.fromEntries(
                        Object.entries(s.bySubject).map(([csId, cell]) => [
                          csId,
                          {
                            ...cell,
                            average: null,
                            grades: cell.grades.map((g) => ({ ...g, score: null, absent: false })),
                          },
                        ]),
                      ),
                    }
                  : s,
              ),
            }
          : prev,
      );
      toast(t('gradesDeletedToast'), 'success');
    } catch {
      toast(t('deleteErrorToast'), 'error');
    }
  }

  function menuItemsFor(student: UnifiedStudentRow): ActionMenuItem[] {
    const evalMenuItems: ActionMenuItem[] = unified
      ? unified.subjects
          .flatMap((sub) => sub.evaluations.map((ev) => ({ subjectName: sub.subjectName, ev })))
          .map(({ subjectName, ev }, i) => ({
            label: unified.combined ? `${subjectName} — ${ev.label}` : ev.label,
            icon: <Pencil size={14} />,
            divider: i === 0,
            onClick: () => router.push(`/pedagogie/carnet-de-notes/${ev.id}/saisie`),
          }))
      : [];

    return [
      {
        label: t('menuViewReportCard'),
        icon: <Eye size={14} />,
        onClick: () => toast(t('menuViewReportCardToast'), 'info'),
      },
      ...(evalMenuItems.length > 0
        ? evalMenuItems
        : [
            {
              label: t('menuEditGrades'),
              icon: <Pencil size={14} />,
              divider: true,
              onClick: () => toast(t('menuEditGradesToast'), 'info'),
            },
          ]),
      {
        label: t('menuHistory'),
        icon: <History size={14} />,
        divider: true,
        onClick: () => toast(t('menuHistoryToast'), 'info'),
      },
      {
        label: t('menuAddAppreciation'),
        icon: <Star size={14} />,
        onClick: () => toast(t('menuAddAppreciationToast'), 'info'),
      },
      {
        label: t('menuContactGuardian'),
        icon: <Mail size={14} />,
        onClick: () => toast(t('menuContactGuardianToast'), 'info'),
      },
      {
        label: t('menuDeleteGrades'),
        icon: <Trash2 size={14} />,
        tone: 'danger',
        divider: true,
        onClick: () => clearStudentGrades(student),
      },
    ];
  }

  function onExport() {
    if (!unified) return;
    const header = [
      t('colStudent'),
      t('csv.colNumber'),
      ...unified.subjects.flatMap((sub) => [
        ...sub.evaluations.map((ev) =>
          unified.combined ? `${sub.subjectName} — ${ev.label}` : ev.label,
        ),
        ...(unified.combined ? [t('csv.subjectAvgColumn', { subject: sub.subjectName })] : []),
      ]),
      t('csv.colGeneralAverage'),
      t('colRank'),
    ];
    const rows = filteredStudents.map((s) => [
      `${s.firstName} ${s.lastName}`,
      s.studentNumber,
      ...unified.subjects.flatMap((sub) => {
        const cell = s.bySubject[sub.classSubjectId];
        const gradeVals = sub.evaluations.map((ev) => {
          const g = cell?.grades.find((gr) => gr.evaluationId === ev.id);
          return g?.absent ? t('cellAbsent') : (g?.score ?? '');
        });
        return unified.combined ? [...gradeVals, cell?.average ?? ''] : gradeVals;
      }),
      s.generalAverage ?? '',
      s.rank ?? '',
    ]);
    const subjectSlug = unified.combined
      ? t('csv.allSubjectsSuffix')
      : unified.subjects[0]!.subjectName;
    exportToCsv(
      `${t('csv.filenamePrefix')}-${unified.className}-${subjectSlug}.csv`
        .toLowerCase()
        .replace(/\s+/g, '-'),
      header,
      rows,
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className={`${LIST_PAGE} gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('subtitle', { year: terms[0]?.label ?? '' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="w-fit" onClick={onExport}>
            <Download size={14} />
            {t('export')}
          </Button>
          <Button
            className="w-fit"
            onClick={() => setShowNew(true)}
            disabled={combined || !subjectValue}
          >
            <Plus size={14} />
            {t('newEvaluation')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classes.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <NotebookPen size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">{t('noClasses')}</p>
        </Card>
      ) : (
        <>
          {unified && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <SummaryCard
                icon={Users}
                tone="secondary"
                label={t('gradedStudents')}
                value={`${unified.gradedCount}`}
                sub={t('outOfStudents', { count: unified.totalCount })}
              />
              <SummaryCard
                icon={BarChart2}
                tone="blue"
                label={combined ? t('generalClassAverage') : t('classAverage')}
                value={fmt(unified.classAverage)}
                sub={t('outOf20')}
              />
              <SummaryCard
                icon={TrendingUp}
                tone="success"
                label={t('bestAverage')}
                value={fmt(unified.bestScore)}
                sub=""
              />
              <SummaryCard
                icon={TrendingDown}
                tone="destructive"
                label={t('insufficientGrade')}
                value={`${unified.students.filter((s) => s.generalAverage != null && s.generalAverage < 8).length}`}
                sub={t('belowAverage')}
              />
              <SummaryCard
                icon={Calendar}
                tone="warning"
                label={t('period')}
                value={terms.find((t) => t.id === unified.resolvedTermId)?.label ?? '—'}
                sub=""
              />
            </div>
          )}

          <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('searchPlaceholder')}
              className="min-w-[200px] max-w-[280px]"
            />
            <FilterSelect
              value={classId}
              onValueChange={(newClassId) => {
                setClassId(newClassId);
                const first = classSubjects.find((cs) => cs.classId === newClassId);
                setSubjectValue(first ? first.id : 'ALL');
              }}
            >
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={subjectValue} onValueChange={setSubjectValue}>
              <SelectItem value="ALL">{t('allSubjects')}</SelectItem>
              {subjectsForClass.map((cs) => (
                <SelectItem key={cs.id} value={cs.id}>
                  {cs.subject.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={termId} onValueChange={setTermId}>
              {terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </FilterSelect>
            <span className="ml-auto text-xs text-muted-foreground">
              {t('studentCount', { count: filteredStudents.length })}
            </span>
          </Card>

          <div role="tablist" className="flex w-fit gap-0 border-b-2 border-border">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'table'}
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${
                view === 'table'
                  ? 'border-primary text-primary'
                  : 'border-transparent font-medium text-muted-foreground'
              }`}
            >
              <Table2 size={13} />
              {t('tabTable')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'stats'}
              onClick={() => setView('stats')}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${
                view === 'stats'
                  ? 'border-primary text-primary'
                  : 'border-transparent font-medium text-muted-foreground'
              }`}
            >
              <BarChart2 size={13} />
              {t('tabStats')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'byEval'}
              onClick={() => setView('byEval')}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${
                view === 'byEval'
                  ? 'border-primary text-primary'
                  : 'border-transparent font-medium text-muted-foreground'
              }`}
            >
              <FileText size={13} />
              {t('tabByEval')}
              {unified && unified.subjects.reduce((n, s) => n + s.evaluations.length, 0) > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {unified.subjects.reduce((n, s) => n + s.evaluations.length, 0)}
                </span>
              )}
            </button>
          </div>

          {!unified ? (
            <Card className="gap-0 overflow-visible p-4">
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </Card>
          ) : unified.totalCount === 0 ? (
            <Card className="items-center gap-2 p-10 text-center">
              <Users size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('noStudentsInClass')}</p>
            </Card>
          ) : view === 'stats' ? (
            <StatistiquesTab unified={unified} />
          ) : view === 'byEval' ? (
            <ParEvaluationTab unified={unified} />
          ) : (
            <Card className="gap-0 overflow-visible">
              <div className={TABLE_SCROLL}>
                <table
                  style={{ width: '100%', minWidth: tableWidth, tableLayout: 'fixed' }}
                  className="border-collapse text-sm"
                >
                  <colgroup>
                    <col style={{ width: ELEVE_W }} />
                    {/* No explicit width here on purpose — these are the
                        flexible columns. Under table-layout:fixed, every
                        <col> WITHOUT a width shares any leftover space
                        equally once the table is wider than its content
                        (so a sparse table fills the screen instead of
                        leaving dead space after Moyenne/Rang/le kebab).
                        Each cell still carries a min-width below so they
                        never shrink under many-column layouts — that's
                        what keeps "Coeff. N" from wrapping. */}
                    {unified.subjects.map((sub) => (
                      <Fragment key={sub.classSubjectId}>
                        {sub.evaluations.map((ev) => (
                          <col key={ev.id} />
                        ))}
                        {unified.combined && <col />}
                      </Fragment>
                    ))}
                    <col style={{ width: MOYENNE_W }} />
                    <col style={{ width: RANG_W }} />
                    <col style={{ width: KEBAB_W }} />
                  </colgroup>
                  <thead className={STICKY_THEAD}>
                    {unified.combined && (
                      <tr className="border-b border-border">
                        <th
                          rowSpan={2}
                          style={stickyLeftStyle}
                          className={`${STICKY_LEFT} px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                        >
                          {t('colStudent')}
                        </th>
                        {unified.subjects.map((sub) => (
                          <th
                            key={sub.classSubjectId}
                            colSpan={sub.evaluations.length + 1}
                            className="overflow-hidden border-l-2 border-border px-3 py-1.5 text-center text-2xs font-bold tracking-wide text-ellipsis whitespace-nowrap text-foreground uppercase"
                          >
                            {sub.subjectName}
                          </th>
                        ))}
                        <th
                          rowSpan={2}
                          style={stickyMoyenneStyle}
                          className={`${STICKY_MOYENNE} px-3 py-2.5 text-center text-[10px] font-bold tracking-wide whitespace-nowrap text-primary uppercase`}
                        >
                          {t('colAverage')}
                        </th>
                        <th
                          rowSpan={2}
                          style={stickyRangStyle}
                          className={`${STICKY_RANG} px-3 py-2.5 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                        >
                          {t('colRank')}
                        </th>
                        <th rowSpan={2} style={stickyKebabStyle} className={STICKY_KEBAB} />
                      </tr>
                    )}
                    <tr className="border-b border-border">
                      {!unified.combined && (
                        <th
                          style={stickyLeftStyle}
                          className={`${STICKY_LEFT} px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                        >
                          {t('colStudent')}
                        </th>
                      )}
                      {unified.subjects.map((sub) => (
                        <Fragment key={sub.classSubjectId}>
                          {sub.evaluations.map((ev) => (
                            <th
                              key={ev.id}
                              style={{ minWidth: EVAL_COL_W }}
                              className="overflow-hidden px-2 py-2.5 text-center"
                              title={
                                ev.status === 'DRAFT'
                                  ? t('evalTooltipDraft', { label: ev.label, coefficient: ev.coefficient })
                                  : t('evalTooltip', { label: ev.label, coefficient: ev.coefficient })
                              }
                            >
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="overflow-hidden text-[10px] font-bold tracking-wide text-ellipsis whitespace-nowrap text-muted-foreground uppercase">
                                  {ev.label}
                                </span>
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap text-muted-foreground">
                                  {t('colCoefficient', { n: ev.coefficient })}
                                </span>
                              </div>
                            </th>
                          ))}
                          {unified.combined && (
                            <th
                              key={`${sub.classSubjectId}-avg`}
                              style={{ minWidth: SUBJECT_AVG_COL_W }}
                              className="border-r-2 border-border bg-muted/40 px-2 py-2.5 text-center text-[10px] font-bold tracking-wide whitespace-nowrap text-muted-foreground uppercase"
                            >
                              {t('colAverageAbbr')}
                            </th>
                          )}
                        </Fragment>
                      ))}
                      {!unified.combined && (
                        <>
                          <th
                            style={stickyMoyenneStyle}
                            className={`${STICKY_MOYENNE} px-3 py-2.5 text-center text-[10px] font-bold tracking-wide whitespace-nowrap text-primary uppercase`}
                          >
                            {t('colAverage')}
                          </th>
                          <th
                            style={stickyRangStyle}
                            className={`${STICKY_RANG} px-3 py-2.5 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase`}
                          >
                            {t('colRank')}
                          </th>
                          <th style={stickyKebabStyle} className={STICKY_KEBAB} />
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageStudents.map((s) => (
                      <tr key={s.studentId} className="border-b border-border last:border-b-0">
                        <td style={stickyLeftStyle} className={`${STICKY_LEFT} px-3.5 py-2.5`}>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${s.firstName} ${s.lastName}`} size={28} />
                            <div>
                              <div className="text-caption font-semibold text-foreground">
                                {s.firstName} {s.lastName}
                              </div>
                              <div className="text-2xs text-muted-foreground">
                                #{s.studentNumber}
                              </div>
                            </div>
                          </div>
                        </td>
                        {unified.subjects.map((sub) => {
                          const cell = s.bySubject[sub.classSubjectId];
                          return (
                            <Fragment key={sub.classSubjectId}>
                              {sub.evaluations.map((ev) => {
                                const g = cell?.grades.find((gr) => gr.evaluationId === ev.id);
                                return (
                                  <td
                                    key={ev.id}
                                    style={{ minWidth: EVAL_COL_W }}
                                    className="px-3 py-2.5 text-center"
                                  >
                                    {g?.absent ? (
                                      <span
                                        className={`inline-flex min-w-11 items-center justify-center rounded-md px-2 py-1 text-2xs font-semibold ${PILL_CLASS.neutral}`}
                                      >
                                        {t('cellAbsent')}
                                      </span>
                                    ) : (
                                      <span
                                        className={`inline-flex min-w-11 items-center justify-center rounded-md px-2 py-1 text-sm font-bold ${PILL_CLASS[tone(g?.score ?? null)]}`}
                                      >
                                        {g?.score != null ? fmt(g.score) : '—'}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                              {unified.combined && (
                                <td
                                  key={`${sub.classSubjectId}-avg`}
                                  style={{ minWidth: SUBJECT_AVG_COL_W }}
                                  className="border-r-2 border-border bg-muted/40 px-3 py-2.5 text-center"
                                >
                                  <span
                                    className={`inline-flex min-w-11 items-center justify-center rounded-md px-2 py-1 text-xs font-bold ${PILL_CLASS[tone(cell?.average ?? null)]}`}
                                  >
                                    {fmt(cell?.average ?? null)}
                                  </span>
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                        <td
                          style={stickyMoyenneStyle}
                          className={`${STICKY_MOYENNE} px-3 py-2.5 text-center`}
                        >
                          <span
                            className={`inline-flex min-w-12 items-center justify-center rounded-md px-2 py-1 text-sm font-bold ${PILL_CLASS[tone(s.generalAverage)]}`}
                          >
                            {fmt(s.generalAverage)}
                          </span>
                        </td>
                        <td
                          style={stickyRangStyle}
                          className={`${STICKY_RANG} px-3 py-2.5 text-center`}
                        >
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-2xs font-bold ${s.rank && RANK_CLASS[s.rank] ? RANK_CLASS[s.rank] : 'bg-muted text-muted-foreground'}`}
                          >
                            {s.rank ?? '—'}
                          </span>
                        </td>
                        <td style={stickyKebabStyle} className={`${STICKY_KEBAB} px-1.5 py-2.5`}>
                          <ActionMenu items={menuItemsFor(s)} searchable />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-3.5 py-2.5">
                <span className="text-xs text-muted-foreground">
                  {t('paginationSummary', {
                    from: (page - 1) * PAGE_SIZE + 1,
                    to: Math.min(page * PAGE_SIZE, filteredStudents.length),
                    total: filteredStudents.length,
                    kind: combined ? t('avgKindGeneral') : t('avgKindClass'),
                    value: fmt(unified.classAverage),
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <PageNumbers page={page} totalPages={pageCount} onChange={setPage} />
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {showNew && !combined && subjectValue && termId && (
        <NewEvaluationModal
          classSubjects={classSubjects}
          terms={terms}
          defaultClassSubjectId={subjectValue}
          defaultTermId={termId}
          onClose={() => setShowNew(false)}
          onCreated={(evaluationId) =>
            router.push(`/pedagogie/carnet-de-notes/${evaluationId}/saisie`)
          }
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tone: t,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  tone: 'secondary' | 'blue' | 'success' | 'destructive' | 'warning';
  label: string;
  value: string;
  sub: string;
}) {
  const iconBg: Record<string, string> = {
    secondary: 'bg-secondary text-primary',
    blue: 'bg-info text-info-foreground',
    success: 'bg-success text-success-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
  };
  const valueColor: Record<string, string> = {
    secondary: 'text-foreground',
    blue: 'text-info-foreground',
    success: 'text-success-foreground',
    destructive: 'text-destructive-foreground',
    warning: 'text-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[t]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-2xs font-medium text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold ${valueColor[t]}`}>{value}</div>
        {sub && <div className="truncate text-2xs text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}
```

Note: `tStatus` (declared at the top of `GradeNotebookPage`) is unused in this file after the tooltip is built directly via `t('evalTooltipDraft'|'evalTooltip', ...)` — **do not declare `tStatus` in this file**; the code block above correctly omits it. (Flagged because Task 3/5 both declare a `tStatus` for their own badge rendering — `page.tsx` doesn't need one since its only status-related text is the tooltip suffix, already folded into `page.evalTooltipDraft`.)

Also note: `SummaryCard`'s own `tone: t` prop-destructure (renaming the `tone` prop to a local `t`) is **pre-existing, unrelated code** — it shadows the outer translator `t` only within `SummaryCard`'s own function body, where it's used purely as the color-lookup key (`iconBg[t]`), never as a translator call. Left as-is (same shadowing situation as `EvaluationConfigForm.tsx`'s `terms.map((t) => ...)`, noted in Task 1).

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Update CLAUDE.md's Internationalisation paragraph**

In `CLAUDE.md`, find the sentence starting "Every other screen (Pédagogie, Scolarité, the rest of `/admin/*` beyond the dashboard) still reads French from `constants.ts` unchanged" and the namespace count "across 15 message namespaces tracked in `MESSAGE_NAMESPACES`". Update:

- Add a sentence after the existing settings-tabs migration sentence: "The shared UI primitives (`Modal`, `DateField`, `ImageUploader`, `PhoneInput`, `LanguagePicker`) are translated too (`common` namespace), and the Carnet de notes (grade book) screen under Pédagogie is now fully translated as well (`gradebook` namespace, 16th) — its `TYPE_LABEL`/evaluation-status ternaries, previously duplicated and inconsistent across files, are now single sources of truth (`gradebook.evaluationType.*`/`gradebook.evaluationStatus.*`), and its `fmtDate()` helper's hardcoded `'fr-FR'` locale is fixed to follow the app locale like every other date-formatting call site."
- Change "across 15 message namespaces" to "across 16 message namespaces".
- In the sentence listing what's still French, remove "Pédagogie" from the list if it's the only remaining item there, or note "Pédagogie (Carnet de notes migrated; Appréciations/Présences/Emploi du temps still French)" — check the exact current wording before editing, since it may already have been updated by the shared-UI-primitives phase's own CLAUDE.md edit.

Read the current file first (`CLAUDE.md`'s Internationalisation paragraph is a single very long paragraph) before editing, since exact prior wording must be matched for the `old_string` in this edit — this plan cannot know the file's exact current byte content in this section since it may have shifted between spec-writing and implementation.

- [ ] **Step 7: Full gate**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test`
Expected: all clean, no new failures (a pre-existing `offline-queue.test.ts` flake may appear — see [[i18n-phase2-settings-status]]/[[i18n-ui-primitives-status]] memory for the established verification protocol: zero-diff check on `offline-queue.ts`/`.test.ts` plus 3 standalone reruns before concluding it's the same pre-existing issue).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/messages/fr/gradebook.json frontend/src/messages/ht/gradebook.json frontend/src/messages/en/gradebook.json "frontend/src/app/(school)/pedagogie/carnet-de-notes/page.tsx" CLAUDE.md
git commit -m "feat(i18n): translate grade-book main screen, fix tutoiement violations, update CLAUDE.md"
```

## Self-Review Notes

**Spec coverage:** all 7 in-scope files (page.tsx, EvaluationConfigForm.tsx, NewEvaluationModal.tsx, ParEvaluationTab.tsx, StatistiquesTab.tsx, edit/page.tsx, saisie/page.tsx) have a task. The `gradebook` namespace registration (Task 1) covers the spec's Architecture section. The `evaluationType`/`evaluationStatus` unification (spec Decisions) is implemented in Task 1 (definition) + consumed in Tasks 1, 3, 5, 6. The `fmtDate` locale bug fix (spec Decisions) is in Task 3. The `OFFLINE_SYNC` fence (spec Cross-dependency fences) is held in Task 5. All 4 tutoiement violations found during plan-writing (beyond the design-phase survey's one) are fixed across Tasks 1, 3, 5, 6.

**Placeholder scan:** no TBD/TODO, no "add appropriate X", every code block is complete literal content, every JSON snippet is complete literal translations in all 3 languages.

**Type consistency:** `EvaluationConfig['type']`/`EvaluationType`/`EvaluationStatus` types are unchanged from `types.ts` throughout — only the display-label lookup mechanism changes (`TYPE_LABEL[type]` → `tType(type)`, ternaries → `tStatus(status)`). `EVALUATION_TYPES` (Task 1) is a new module-scope const local to `EvaluationConfigForm.tsx`, not exported, not consumed elsewhere — verified no other task references it.

