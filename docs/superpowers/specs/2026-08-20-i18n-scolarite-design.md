# i18n — Scolarité (Fees & Tuition) — Design Spec

## Problem

Per the Phase 0 roadmap, Phase 4 is "Scolarité / Élèves / Enseignants." At
~2,850 lines across three areas, it decomposes into 3 independent
sub-projects the same way Pédagogie split into 4. This spec covers the
first: **Scolarité** (Frais & Scolarité / Fees & Tuition) — payment
tracking, overdue reminders, and fee-plan configuration.

Two other sessions are working the same roadmap in parallel this session:
one on Carnet de notes (grade book), one on Présences (attendance) — both
sub-projects of Pédagogie. Coordinated directly; no file overlap with
either.

## Scope (this spec)

**In scope — full file list (12 files, ~2,850 lines):**

- `frontend/src/app/(school)/scolarite/page.tsx` (10 lines) — bare
  redirect to `/scolarite/paiements`, kept as a real route only so the
  sidebar's prefix-match highlights "Frais & Scolarité" for all 3
  sub-routes. No translatable strings.
- `frontend/src/app/(school)/scolarite/paiements/page.tsx` (509 lines) —
  payment tracking: KPI row, search/filters, student payment table
  (desktop) / cards (mobile), row actions, toasts.
- `frontend/src/app/(school)/scolarite/relances/page.tsx` (600 lines) —
  overdue reminders: KPI row, overdue table/cards with bulk-select,
  automation-settings aside panel, class breakdown, quick actions.
- `frontend/src/app/(school)/scolarite/relances/DisputeModal.tsx` (71
  lines)
- `frontend/src/app/(school)/scolarite/configuration/page.tsx` (637
  lines) — fee-plan configuration: class list/filter, tranche builder,
  global settings.
- `frontend/src/app/(school)/scolarite/configuration/TrancheFormModal.tsx`
  (103 lines)
- `frontend/src/app/(school)/scolarite/configuration/ClassFeePicker.tsx`
  (123 lines)
- `frontend/src/app/(school)/scolarite/configuration/ClassDropdownSelector.tsx`
  (146 lines)
- `frontend/src/components/school/fees/badges.tsx` (66 lines) —
  `StudentStatusBadge`/`TrancheStatusBadge`/`SeverityBadge` (note: a
  *different*, unrelated `StudentStatusBadge` also exists at
  `components/school/StudentStatusBadge.tsx` for the deferred
  academic-year-rollover wizard — same name, different props/purpose,
  not touched by this phase)
- `frontend/src/components/school/fees/FeeHistoryModal.tsx` (166 lines)
- `frontend/src/components/school/fees/FeeKpiRow.tsx` (38 lines) — pure
  display shell, receives already-translated `label`/`sub` props from
  callers; no strings of its own, no work needed here (same shape as the
  `BarChart` component in the Carnet de notes precedent)
- `frontend/src/components/school/fees/FeesTabs.tsx` (28 lines)
- `frontend/src/components/school/fees/PaymentRegistrationModal.tsx`
  (325 lines)
- `frontend/src/lib/fees-format.ts` (31 lines) — `fmtMoney`/`fmtDate`/
  `fmtDateShort`/`fmtFraction`
- `frontend/src/lib/fees-receipt.ts` (52 lines) — builds and prints the
  payment-receipt popup window

`frontend/src/components/school/fees/Pager.tsx` is a bare re-export of
`@/components/ui/Pager` (already a shared primitive) — nothing to
translate, not counted above.

**Confirmed not shared outside this module:** `FEES` (`@/lib/constants`)
is imported only by the 12 files above, repo-wide — no cross-dependency
fence needed for the constants object itself, unlike the Carnet de notes
phase's `OFFLINE_SYNC` fence.

**Explicitly out of scope (later phases):** Élèves and Enseignants (this
sub-project's siblings, their own future spec/plan cycles); the
rollover-wizard `StudentStatusBadge` noted above; all of Pédagogie
(claimed by the two parallel sessions); `/admin/*` (Admin back-office
phase).

## Decisions carried from user sign-off (this phase)

- **Vouvoiement throughout, no exceptions** — standing convention, same
  as every prior phase.
- **Payment receipt printing (`fees-receipt.ts`) follows the admin's UI
  language at print time**, not pinned to French — user's explicit
  choice when asked, since this is the same category of question as the
  deferred Bulletin PDF policy question but resolved the other way here:
  the receipt is generated client-side from data already in hand (no
  separate document-language concern like a server-rendered bulletin),
  so it uses the same `next-intl` strings as the rest of the app rather
  than a hardcoded language.
- **Two real bugs fixed as part of this migration**, same treatment as
  every prior phase:
  - `fees-format.ts`'s `fmtDate`/`fmtDateShort` hardcode `'fr-FR'` →
    routed through `LOCALE_BCP47` (`frontend/src/lib/locales.ts`), the
    established fix already applied to 6 other call sites across Phase 2
    and the Carnet de notes phase.
  - `'Erreur réseau. Réessaie.'` (tu-form imperative, a tutoiement
    violation) is copy-pasted across 5 sites: `configuration/page.tsx`
    (×3), `relances/page.tsx`, `DisputeModal.tsx`,
    `PaymentRegistrationModal.tsx`. All 5 route through the existing
    `common.errors.network` key (`"Erreur réseau. Réessayez."` —
    already vouvoiement-correct, already shipped in the
    shared-UI-primitives phase), not a new key.
- **WhatsApp-reminder toast copy is unified, not duplicated.** 5 toast
  strings (`sendWhatsapp` success/3 error variants/network-fallback) are
  byte-identical between `paiements/page.tsx` and `relances/page.tsx` —
  both pages call the same `/api/school/fees/.../whatsapp` flow and
  handle the same response shapes. Moved to one shared
  `fees.whatsapp.*` key set consumed by both pages, instead of the same
  English/Haitian Creole translation being independently duplicated (and
  liable to drift) in `fees.overview.*` and `fees.overdue.*`.
- **`FeeHistoryModal.tsx`'s copy is new, not migrated** — this file has
  zero i18n coverage today and isn't even represented in the `FEES`
  constants object (title, tranche-row "échéance" caption, "Paiements
  enregistrés" section header, empty state, load error, print
  aria-label). It gets its own `fees.history.*` keys from scratch.

## Current state (as found)

**`FEES` (`frontend/src/lib/constants.ts:91-290`, 208 lines) covers most
but not all of the module's copy** — `nav`, `tabs`, `studentStatusLabel`,
`trancheStatusLabel`, `paymentMethodLabel`, `configuration.*`,
`overview.*` (paiements), `overdue.*` (relances), `registerPayment.*`,
`disputeModal.*`, and one `stub` string (the unshipped bulk-WhatsApp
button in `relances/page.tsx`). Every in-scope page/modal except
`FeeHistoryModal.tsx` already reads through a local `const t =
FEES.<section>` alias — this phase's migration pattern is Phase 2's
"per-tab constants object → next-intl JSON," not Phase 1a's "inline JSX
string," since the object already exists and just needs porting.

**Toast messages sit outside `FEES` entirely** (same pattern noted in
every prior phase — constants objects capture display copy, not
imperative/async messages): `paiements/page.tsx` (6 toasts),
`relances/page.tsx` (5 toasts, 4 of which duplicate `paiements`' WhatsApp
set — see decisions above), `configuration/page.tsx` (5 toasts),
`DisputeModal.tsx` (1 inline error), `PaymentRegistrationModal.tsx` (2).

**3 aria-labels are hardcoded inline, not in `FEES`:**
`configuration/page.tsx` ("Supprimer la tranche"),
`FeeHistoryModal.tsx` ("Imprimer le reçu"), `relances/page.tsx` (2× —
"Tout sélectionner" static + `` `Sélectionner ${firstName} ${lastName}` ``
dynamic, needs an ICU-interpolated key).

**No `confirm()` dialogs, no inline `placeholder=` strings** in this
module (unlike Carnet de notes, which had both) — configuration's save
flow uses a persistent "unsaved changes" bar instead of a confirm
dialog.

**No existing tests** reference any file in this module by name or path
— no test-update burden for this migration, same as Carnet de notes.

## Architecture (unchanged — this phase adds no new infrastructure)

Same `next-intl` machinery as every prior phase: `useTranslations('fees')`
in client components, message files under `frontend/src/messages/{fr,ht,en}/
fees.json`, registry addition in `frontend/src/lib/locales.ts`
(`MESSAGE_NAMESPACES`), `frontend/src/i18n/request.ts`, and
`frontend/src/types/next-intl.d.ts` — all three cross-checked by
`locales.test.ts`.

## Namespace & message-file design

**One `fees` namespace for all 12 in-scope files**, nested per screen —
mirroring the `settings` namespace's "one screen, many panels" shape,
since the module's own `FEES` constant is already organized this way.

Proposed top-level keys inside `fees.json`:

```
fees.nav.label                (sidebar/breadcrumb — currently FEES.nav)
fees.tabs.{paiements,relances,configuration}
                               (FeesTabs.tsx)
fees.studentStatus.{UP_TO_DATE,PARTIAL,OVERDUE,UNPAID}
                               (badges.tsx StudentStatusBadge — shared
                                 across paiements/relances/PaymentRegistrationModal)
fees.trancheStatus.{PAID,PARTIAL,OVERDUE,UPCOMING}
                               (badges.tsx TrancheStatusBadge — shared
                                 across paiements/relances/FeeHistoryModal)
fees.overdueSeverity.{CRITICAL,OVERDUE,RECENT}
                               (badges.tsx SeverityBadge — relances only)
fees.paymentMethod.{ESPECES,MONCASH,NATCASH,CHEQUE,VIREMENT}
                               (shared across PaymentRegistrationModal,
                                 FeeHistoryModal, fees-receipt.ts)
fees.whatsapp.*               (unified toast set — see decisions above;
                                 consumed by both paiements/page.tsx and
                                 relances/page.tsx)
fees.overview.*               (paiements/page.tsx — title, KPIs, columns,
                                 row actions, toasts, alert banner)
fees.overdue.*                (relances/page.tsx — title, KPIs, columns,
                                 row actions, automation panel, class
                                 breakdown, quick actions, aria-labels,
                                 minus fees.whatsapp.* which moves out)
fees.disputeModal.*           (DisputeModal.tsx)
fees.registerPayment.*        (PaymentRegistrationModal.tsx)
fees.history.*                (FeeHistoryModal.tsx — new keys, see
                                 decisions above)
fees.configuration.*          (configuration/page.tsx,
                                 TrancheFormModal.tsx, ClassFeePicker.tsx,
                                 ClassDropdownSelector.tsx — all 4 files
                                 already share the one FEES.configuration
                                 object today)
fees.stub                     (the one "coming soon" toast, relances only)
```

**`common` namespace gains one more consumer:** `common.errors.network`
replaces the 5-site `'Erreur réseau. Réessaie.'` tutoiement violation —
already shipped, no new key.

## Cross-dependency fences

None. `FEES` and all 12 in-scope files are self-contained to this module
— confirmed by a repo-wide grep of `FEES` imports (12 hits, all listed
above). This phase is simpler than Carnet de notes in that respect: no
constant is shared with a deferred module.

## Data flow

`fmtDate`/`fmtDateShort` in `fees-format.ts` are rewritten to accept the
active locale via `useLocale()` and index into `LOCALE_BCP47`, replacing
the hardcoded `'fr-FR'` literal — since both are plain exported functions
(not component-scoped), every call site passes the locale through rather
than the functions reading it from context themselves, keeping
`fees-format.ts` framework-agnostic the way `fees-receipt.ts` (which
calls `fmtDate` too) already expects.

`fees-receipt.ts`'s `openReceiptAndPrint` gains a `locale` (or resolved
label strings) parameter from its caller, since it builds a raw HTML
string outside React and can't call `useTranslations()` itself — callers
(`PaymentRegistrationModal.tsx`, `paiements/page.tsx`,
`relances/page.tsx`, via `FeeHistoryModal.tsx`) already have the active
locale in scope from their own `useTranslations()`/`useLocale()` calls.

## Testing plan

- `locales.test.ts` automatically covers the new `fees` namespace once
  it's added to `MESSAGE_NAMESPACES` — no test-file changes needed for
  the registry itself.
- No existing tests reference this module, so no test-rewiring burden.
- `pnpm typecheck && pnpm lint && pnpm test` must stay green throughout.
- Manual verification follows the established method: log in as the
  seeded dev account, switch locale via the app's own `LanguagePicker`
  UI, then verify rendered text in all 3 locales across all 3 screens,
  with particular attention to: the unified `fees.whatsapp.*` keys
  rendering identically on both consuming pages, the receipt popup
  window (opens outside the main React tree — verify it isn't missed by
  a locale switch mid-session), and `FeeHistoryModal.tsx`'s new copy
  (previously untranslated).

## Rollout notes

After this sub-project, the remaining Scolarité-adjacent items are
Élèves and Enseignants (this phase's siblings, their own future spec/plan
cycles). The other two parallel sessions are covering Carnet de notes and
Présences within Pédagogie; after all of that, the roadmap's remaining
items stay: the rest of Pédagogie (Appréciations, Emploi du temps), the
rest of `/admin/*` (Admin back-office phase), server message
normalization, the landing page + static rendering, and Bulletin PDFs +
Resend emails (the one deferred document-language policy question this
phase's receipt-printing decision does *not* resolve — bulletins are
server-rendered and have a stronger "official school record" argument for
staying French, per the original roadmap note).
