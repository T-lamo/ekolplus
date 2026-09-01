# Landing page v2 "Electric Blue" — Banani → Next.js 16 + Tailwind v4 + framer-motion

## Source
- Banani screen ID: `KqSDObUkIDXy` (`SchoolGesti Landing`), flow `2oB_n5kLBeuy` ("Separate Screen Regen")
- Theme: `Electric Blue` (light), fontFamily `inter`
- Fetched: 2026-09-01 — raw export archived at `.planning/banani/fetches/landing-v2/export.txt`
- Replaces the v1 dark "Lavande Douce" landing (`od101RR35cuu`, plan: `landing-page.md`) wholesale.

## Structure map (11 sections, DOM order)

1. `#hero` — dark gradient (`135deg, #0F172A → sidebar → #2563EB`) + 4 radial soft spots via `::before`. Glass-pill topbar (logo, 5 anchor links, Se connecter + Demander une démo). Centered copy column (max 860px): shield eyebrow label, 64px 3-line H1 (last line `.accent`), sub, 2 CTAs, 3 chips. Around it: 2 blurred orbs + 4 absolutely-positioned rotated (±9-11°) `.hero-float-card` mock-UI stat cards + 2 side-note pills.
2. `#proof-strip` — white strip, 5-col grid of stat cards (10 écoles / 3k+ dossiers / 98% satisfaction / 3x moins de tâches / 99,9% disponibilité).
3. `#features` — 3×2 grid of `.feature-card` (radius 18px): each = illustration frame 172px (pale-blue gradient `#F8FBFF→#EEF6FF`) + 42px icon + title + desc + "En savoir plus →". Card 3 (Bulletins) is `.highlight`: navy bg, white text. **Nested below**: `#gallery-grid`, 4 thumbnail cards (Support / Cours mobiles / Certificat / Apprentissage).
4. `#attendance` — `--secondary` bg, split 2-col: visual panel (radius 24px, illustration + floating metric badge "97/100 · Terminale A · en temps réel") | copy + 4-item checklist.
5. `#finance` — mirror split (copy left, visual right, badge "84% · +12% vs mois dernier").
6. `#onboarding` — gradient bg, 32px-radius "ribbon" shell with 3 glow blobs + horizontal gradient line, 3 numbered step cards; middle `.featured` raised, blue-tinted shadow; step 3's number badge green.
7. `#roles` — same dark gradient as hero. 4 glass `.role-card` (avatar, title/subtitle, desc, 3 pills): Direction & administration / Corps enseignant / Élèves & apprenants / Secrétariat & comptabilité.
8. `#pricing` — `--secondary` bg, 3 `.plan-card`: Gratuit $0 / Pro (recommended, navy card) / Grande École "Sur mesure / Devis".
9. `#faq` — 2-col `0.9fr 1.1fr`: illustration frame + green help callout | 5-item accordion (only #1 expanded in export).
10. `#contact` — 2-col `0.92fr 1.08fr`: contact-methods card (phone/email/accompagnement local) | demo form card. Below: `.cta-band` dark gradient banner (title, text, 2 CTAs).
11. `#footer` — navy `#0F172A`, `1.2fr 0.8fr 0.8fr 0.8fr` (brand + Produit/Ressources/Entreprise), bottom bar.

Dead CSS in export: `#certificate-badge` (unused). Banani markers `data-media-type="banani-button"` are editor artifacts — dropped.

## Component breakdown

All in `frontend/src/components/landing/` — same file names as v1 where the role matches (full internal rewrite):

- **REWRITE** `landing-header.tsx` — glass pill topbar; keep v1's scroll-elevation + hamburger + `.landing-scroll-blur` patterns.
- **REWRITE** `hero-section.tsx` — new copy column + 4 float cards + orbs; keep v1's mouse-tilt/float/reduced-motion machinery where it maps.
- **REWRITE** `stats-section.tsx` → proof strip (5 stats, count-up on view, from v1's `use-count-up.ts`).
- **REWRITE** `features-section.tsx` — 6 feature cards + 4 gallery cards (two grids, one section).
- **NEW** `split-feature-section.tsx` — one component, `reverse?: boolean`, renders both `#attendance` and `#finance` (identical anatomy, mirrored).
- **REWRITE** `steps-section.tsx` → onboarding ribbon (3 steps, featured middle).
- **REWRITE** `roles-section.tsx` — 4 glass cards; avatars → `IconPlate` (no Banani AI avatars).
- **REWRITE** `pricing-section.tsx` — 3 cards; real app pricing; **gold treatment for Pro** (user instruction, overrides mock's green badge — see Token mapping).
- **REWRITE** `faq-section.tsx` — Radix Accordion (real toggles, 5 items) + illustration + help callout.
- **REWRITE** `demo-request-section.tsx` + restyle `demo-request-form.tsx` shell — real API logic untouched (`POST /api/demo-requests`, honeypot, rate-limit, `size`/`plan` selects, Pro estimator); "wow" pass: see Animation plan.
- **NEW** `cta-band.tsx` — dark gradient banner (inside contact section per mock).
- **REWRITE** `landing-footer.tsx` — 4-col navy footer.
- **NEW** `illustration.tsx` — thin `next/image`/`img` wrapper for the local SVGs (sized frames, `alt` from props).
- **KEEP** `landing-motion.ts`, `use-count-up.ts`, `use-spotlight.ts`, `landing-ui.tsx` primitives (`Kicker`/`SectionHead`/`IconPlate`/`CtaLink`) — retuned to the new palette.
- **DROP from page**: v1-only assets (`heroimage.jpg` dashboard mockup, `people.jpg` roles photo) — new design has no equivalent slots.

## Illustrations (user requirement — local Storyset SVGs, recolored)

Files live in `frontend/public/illustrations/`. They were downloaded with **4 different accent colors** (coral `#ff725e`, green `#92e3a9`, purple `#ba68c8`, blue `#407bff`); skin tones (`#ffbf9d`, `#ff9a6c`, `#ae7461`, `#6f4439`, …) and neutral grays must NOT be touched. A one-shot Node script rewrites each file's accent hex → `#2563EB` (plus nearby accent-shade variants per file, verified visually), writing **kebab-case copies** (e.g. `confirmed-attendance.svg`) so originals stay pristine; components reference only the kebab-case copies.

| Slot (mock alt) | Local SVG | Accent to replace |
|---|---|---|
| Features 1 "Dossiers élèves" | `Thesis-pana.svg` | `#ff725e` |
| Features 2 "Paiements et finance" | `Printing invoices-bro.svg` | `#92e3a9` |
| Features 3 "Bulletins et contenus" (highlight) | `Exams-bro.svg` | `#92e3a9` |
| Features 4 "Emploi du temps mobile" | `Course app-pana.svg` | `#ff725e` |
| Features 5 "Présences confirmées" | `Confirmed attendance-pana.svg` | `#ff725e` |
| Features 6 "Analyse et dashboard" | `Data analysis-bro.svg` | `#92e3a9` |
| Gallery "Support" | `Call center-cuate.svg` | `#ffc727` (verify visually) |
| Gallery "Cours mobiles" | `Course app-bro.svg` | `#92e3a9` |
| Gallery "Certificat" | `Certification-pana.svg` | `#ff725e` |
| Gallery "Apprentissage" | `Learning-pana.svg` | `#ff725e` |
| `#attendance` visual | reuse `confirmed-attendance.svg` (mock reuses it) | — |
| `#finance` visual | reuse `printing-invoices.svg` (mock reuses it) | — |
| FAQ art | `Yes or no-amico.svg` | `#ba68c8` |
| Spare (unused) | `Online learning-amico`, `Webinar-amico`, `Online test-rafiki`, dupes `(1)` | — |

Mixed Storyset styles (pana/bro/cuate/amico) are accepted — the shared blue accent unifies them.

## Token mapping (Banani → project)

| Banani token | Decision |
|---|---|
| `--primary #2563EB`, `--background #F8FAFC`, `--foreground #0F172A`, `--secondary #F1F5F9`, `--muted #E2E8F0`, `--muted-foreground #475569`, `--border #DCE4F0`, `--input #EFF4FB`, `--success #10B981`, `--accent #A7F3D0`, `--accent-foreground #064E3B`, `--card #FFFFFF`, `--sidebar #0F172A` | Page-scoped vars on `#landing-root` in `globals.css` (v1 precedent — the landing must render identically regardless of the logged-in user's app theme). Replace the v1 dark-scope values in place. |
| `.landing-clipboard` cream form scope (v1) | Replaced by the same technique with the new light palette so `Field`/`PhoneInput`/`Select` re-theme automatically; keep the `portalContainer` prop wiring (v1 feedback round 3 fix). |
| **GOLD (user instruction, not in mock)** | Pro card: keep mock's navy card + white text, but badge "Recommandé", price accent, plan dot checks and CTA switch to the app's existing gold convention (reuse v1's gold tokens/`goldCardVariant` values from `pricing-section.tsx` / `SchoolPlanCard` — "or = payant"). Mock's green badge is overridden. |
| Radii `4/6/8/12px` + literals `14/18/24/32px`, pill `999px` | Tailwind: `rounded-md` (6px buttons/fields), `rounded-[18px]` cards, `rounded-[24px]` visual panels, `rounded-[32px]` ribbon, `rounded-full` pills. Don't round to nearest Tailwind step — arbitrary values keep parity. |
| Shadow family `rgba(15,23,42,α)` (7 steps) + 2 blue glows | Arbitrary `shadow-[…]` values verbatim; they're one consistent elevation scale. |
| Type scale: H1 64/800/-2px/0.98lh, section titles 46/800/-1.5px, prices 38/800 | Arbitrary values (`text-[64px] font-extrabold tracking-[-2px] leading-[0.98]`), scaled down at base breakpoint (see Responsive). |
| Iconify `lucide:*` (47 uses) | `lucide-react` named imports (already a dep). Never load the iconify script. |
| Banani brand mark (generic shield SVG) | Replaced by the real SchoolGesti lockup (`/logos/schoolgesti-lockup-blanc.svg` on dark topbar/footer) — real brand overrides mock placeholder. |
| Section rhythm `padding: 92px 0`, gutter `0 48px`, container 1280px | `py-[92px]` desktop / reduced at base; `px-6` base → `lg:px-12`; `max-w-[1280px] mx-auto`. |

## Responsive plan (MANDATORY — export is fixed-desktop, zero responsive)

- **Base (375px)**: single column everywhere. Topbar → logo + hamburger (v1 pattern). Hero: float cards hidden or stacked as a 2×2 mini-grid below the copy (float composition is a `lg:` luxury); H1 drops to ~38px, chips wrap. Proof strip → `grid-cols-2` (5th spans). Features → 1 col; gallery → `grid-cols-2`. Splits → visual above copy. Onboarding steps → 1 col, no featured raise. Roles → 1 col. Pricing → 1 col (gold Pro first via `order`). FAQ → accordion above illustration. Contact → form above methods card. Footer → 1 col. CTAs full-width.
- **sm (640px)**: gallery stays 2-col; proof strip may go 3+2.
- **md (768px)**: features → 2 col; onboarding → 3 col (featured raise returns); roles → 2 col; pricing → stays 1 col or 3 narrow — measure; splits → 2 col begins; footer → 2 col.
- **lg (1024px)**: hero float cards absolutely positioned (Banani composition); features → 3 col; roles → 4 col; pricing → 3 col; FAQ/contact 2-col ratios (`0.9fr/1.1fr`, `0.92fr/1.08fr`); footer 4-col.
- **xl (1280px)**: container caps at 1280px — Banani parity breakpoint.

## Interactions / state

- Topbar: scroll elevation, anchor smooth-scroll, mobile menu (v1 patterns).
- FAQ: Radix Accordion, independent toggles, 5 items (export only ships answer #1 — write the 4 missing answers as real product copy, flagged for user review).
- Demo form: existing idle→sending→sent/error machine untouched; success state gets a celebratory animation (see below).
- Hover: card lift + shadow bloom (features/gallery/roles/pricing/steps), spotlight glow (v1's `use-spotlight.ts`).
- Focus rings on all interactive elements (export has zero `:focus`).
- Touch targets ≥48px.

## Animation plan (export is 100% static — all motion authored here)

Ported from v1 (proven): `whileInView` fade+rise staggers per section, count-up proof stats, drifting ambient orbs, per-line H1 stagger, spring hover-lifts, cursor spotlight on cards, scroll-blur under fixed nav, `useReducedMotion()` everywhere. Framer-motion rule from v1: any resting transform must live in the motion variant, never a competing CSS class.

New for v2:
- Hero float cards: continuous desynchronized slow float + their static ±9-11° rotations in-variant; subtle parallax against scroll (`useScroll` + `useTransform`, disabled reduced-motion).
- Onboarding ribbon: gradient line draws in on view (`scaleX` 0→1); featured card's raise animates on view; step dots pulse-halo once.
- Split sections: visual panel slides in from its side, metric badge pops with a spring after the panel lands.
- Pricing: gold badge glow pulse (v1 pattern), gold CTA shimmer sweep on hover; recommended card entrance scale-in.
- **Demo form "wow"**: entrance = card tilts up from below with spring; field focus = label lifts + blue ring glow; while `sending` = button morphs to spinner; on `sent` = card flips/cross-fades to a success panel with an animated check draw (SVG `pathLength` 0→1) + a brief confetti-dot burst (pure framer-motion, ~12 absolutely-positioned dots, reduced-motion: simple fade). No external confetti lib.
- CTA band: background gradient slowly shifts hue (±8°) in a loop (paused reduced-motion).

## Copy / i18n

French only (standing decision — landing is outside the next-intl rollout). All copy from the mock, corrected: real pricing numbers, no em dashes in any user-facing string (CLAUDE.md rule — use `·`/commas), FAQ answers 2-5 authored. Mock's plan labels (Gratuit / Pro / Grande École) kept pending user confirmation.

## Implementation checklist

- [x] Recolor script → kebab-case SVG copies in `public/illustrations/` (originals untouched, left untracked — recoverable from storyset.com); each output visually checked in the rendered page
- [x] Swap `#landing-root` scope in `globals.css` to the Electric Blue palette; `.landing-clipboard` deleted (the form portals into a node inside `#landing-root` instead, inheriting the scope with zero extra CSS); gold uses the app's existing global `--color-gold-*` tokens
- [x] Rebuild sections mobile-first in the v1 file layout, reusing `landing-ui.tsx`/motion helpers (+ new `split-feature-section.tsx`; the CTA band lives inside `demo-request-section.tsx` rather than its own file — it changes with that section)
- [x] Demo form: restyle shell + wow pass (spring entrance, breathing gradient halo, morphing submit, SVG check draw + confetti burst on success), logic untouched + optional `message` field (API extended, no DB — the route only emails)
- [x] Gold Pro card (navy + gold badge/price/checks/CTA, pulsing badge glow) — flat grid per the mock, no v1-style raise
- [x] Real logo lockup, no Banani brand mark / AI avatars / iconify script
- [x] SEO: JSON-LD offer names aligned to the new visible plan names (Gratuit / Pro), prices unchanged; `/#contact-demo` reference in `/login` updated to `/#contact`
- [x] `pnpm format && pnpm lint && pnpm typecheck && pnpm test` (1739/1739) — **`pnpm build` deliberately deferred**: the user's own IDE terminal had a live `next dev` on :3000 sharing `.next` at the time (same precedent as the school-dashboard pass in STATUS.md); re-run once that settles
- [x] Puppeteer verification (real Chrome, against the live dev server): zero horizontal scroll at 375/768/1280, full-page renders compared per-section at all three, FAQ accordion real click (item 2 opens, icon rotates), mobile hamburger real click (navy panel, all links), form fill + submit with the POST intercepted (201) → success panel with drawn check confirmed live
- [x] Legal pages check — caught a real bug: `/confidentialite`/`/cgu` have no dark hero, so the white-text glass topbar was invisible before the first scroll; `LandingHeader` gained a `solid` prop (forces the navy pill) that `LegalArticle` passes, and the legal card restyled from the v1 cream paper to the Electric Blue card language
- [x] Update `STATUS.md` (v2 entry → Done; v1 entry annotated "superseded")

## Open questions for user

1. Remplacement complet de la landing actuelle (aucune section v1 conservée) — OK ?
2. Tarifs : le mock affiche Pro à $0.50/élève/mois ; je garde les vrais tarifs de l'app (Starter gratuit ≤50 élèves, Pro 0,60 $/élève/mois, Grande École sur devis). Les libellés du mock (Gratuit / Pro / Grande École) sont-ils gardés ?
3. Formulaire : le mock montre Ville + "Votre besoin" (textarea) mais pas Email/Effectif/Plan que l'API réelle exige. Je propose : garder les champs réels (email inclus) dans le nouveau style + ajouter le textarea "Votre besoin" en étendant l'API d'un champ optionnel `message`. OK, ou rester strictement sur les champs actuels ?
4. Avatars des rôles : le mock utilise des avatars IA placeholder ; je les remplace par des plaques d'icônes (cohérent avec l'app). OK ?
