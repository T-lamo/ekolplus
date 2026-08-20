# Landing page (EkolSuite/SchoolGesti) — Banani → Next.js 16 + Tailwind v4 + framer-motion

## Source
- Banani screen ID: `od101RR35cuu` (`EkolSuite Landing`), flow `2oB_n5kLBeuy`
- Theme: `Lavande Douce` (dark violet), fontFamily `inter`
- Fetched: 2026-08-20

## Structure map

1. `nav` — fixed glass pill, logo + 4 anchor links + Connexion/Demander une démo
2. `hero` — 3-line title, desc, 2 CTAs, 3D scene (notebook card + dashboard glass mockup + 3 floating tag cards), 3 ambient blur blobs
3. `statsBand` — rotated "paper" card, 4-stat grid
4. `featuresSection` — 3 rotated "feature tag" cards (dossiers élèves / paiements-scolarité / notes-bulletins-présences), each with 3 checklist items
5. `rolesSection` — 2-col: left = 4-row role list (Direction/Secrétariat/Enseignants/Parents), right = photo + glass KPI overlay (342 élèves / 87% paiements / 96% présences)
6. `stepsSection` — dark ribbon, 3-step "how it starts"
7. `pricingSection` — 3 material cards (wood=Free, glass=Pro "Recommandé", carbone=Enterprise "Sur mesure")
8. `demoSection` — 2-col: copy+3 points, "clipboard" fake form (6 fields)
9. `faqSection` — 3 cards, plus-icon implies accordion but answers are static-open in the export
10. `footer` — brand + 3 link columns + bottom bar

## Component breakdown

- **REUSE (logic only, full restyle)**: `DemoRequestForm` (`components/landing/demo-request-form.tsx`) — real `POST /api/demo-requests` wiring, honeypot, rate-limit handling, `Field`/`PhoneInput`/`Select` primitives. Rebuild its *shell* as the "clipboard" visual (paper texture, pencil/chain decorations) but keep the state machine, validation, and submit logic untouched.
- **NEW** `LandingHeader` — glass pill nav, scroll-elevation state already exists as a pattern in the current one, port the idea, new visual.
- **NEW** `HeroSection` — title/desc/CTAs + `HeroScene` (notebook + mockup + 3 tag cards), each as its own small subcomponent for animation targeting.
- **NEW** `StatsBand` — 4-stat grid, count-up on scroll-into-view.
- **NEW** `FeaturesSection` — 3 feature-tag cards.
- **NEW** `RolesSection` — role list (active-row highlight) + photo/KPI overlay.
- **NEW** `StepsSection` — 3-step ribbon.
- **NEW** `PricingSection` — 3 material cards (full rewrite, new pricing model TBD — see Open Questions).
- **NEW** `FaqSection` — real accordion (Radix `Accordion` primitive already used elsewhere in the app, e.g. sidebar sections — reuse the pattern/primitive rather than hand-rolling).
- **NEW** `LandingFooter` — 4-col footer.
- **DROP** `reveal-observer.tsx`'s IntersectionObserver-based `.reveal-up` class — replaced by framer-motion `whileInView` throughout (see Animation plan).
- **PRIMITIVE reuse**: `Field`, `PhoneInput`, `Select` (existing `components/ui/`), Radix `Accordion` (already a dependency, used in the school sidebar).

## Token mapping (Banani → project)

| Banani token | Decision |
|---|---|
| `--primary: #C7A7FF` | New page-scoped CSS vars (this page is dark, app shell is light) — NOT the app's `--color-primary` (#6c2bd9, wrong tone for a dark hero). Define a small `landing.css`-scoped `@theme` override or inline CSS vars on the page root, per the existing landing page's own precedent ("self-contained... renders identically regardless of the app's own dark-sidebar tokens"). |
| `--background: #1E1630`, `--foreground: #FBF8FF`, `--muted-foreground: #C7BDD8`, `--accent: #E7D8FF` | Same — page-scoped vars, dark theme only exists on this route. |
| Literal "paper/wood" colors (`#291d3f`, `#7b5c2e`, `#8a7b70`, etc.) | Keep as literal Tailwind arbitrary values or extend the page-scoped var set — these are intentional material-specific colors, not reusable brand tokens. |
| `--radius-xl: 12px` (only used token radius) | `rounded-xl` — matches project's own `--radius-xl: 12px` exactly, lucky alignment. |
| Asymmetric literal border-radii (`24px 32px 28px 20px`, blob shapes) | Arbitrary-value Tailwind (`rounded-[24px_32px_28px_20px]`) — these are one-off "organic" shapes, not tokens. |
| `fontFamily: inter` | Already global via root layout — no action needed. |

## Responsive plan (MANDATORY — Banani export has ZERO responsive behavior)

Source is a fixed 1280px-max desktop mockup with hard-coded grids and absolutely-positioned hero elements — everything below must be authored from scratch.

- **Base (375px)**: single column throughout. Nav collapses to logo + hamburger (existing `landing-header.tsx` already has this pattern — port it). Hero: `HeroScene`'s 3 floating cards + notebook stack vertically below the title/CTAs instead of absolute-positioning around it (the "float" effect becomes scroll-reveal stagger instead of spatial arrangement). Stats grid → `grid-cols-2`. Feature/role/step/pricing grids → single column, cards stack. Roles section → photo above list (order swap). Demo section → form above copy or below (TBD, propose below in copy). Footer → single column, brand block first.
- **sm (640px)**: stats grid → stays `grid-cols-2` or moves to `grid-cols-4` if room; pricing cards can start 2-up.
- **md (768px)**: feature-tag / step cards → `grid-cols-2` or `grid-cols-3` depending on measured width; roles section → 2-col begins here.
- **lg (1024px)**: pricing → `grid-cols-3`; hero scene's absolute-positioned float cards re-enable (this is where the Banani desktop composition is faithfully reproduced).
- **xl (1280px)**: max-width container matches Banani's own `max-width: 1280px`.

## Interactions / state

- **Nav**: scroll-elevation (existing pattern), mobile hamburger menu (existing pattern).
- **FAQ**: real accordion — one open at a time or independent toggles (propose independent, matches 3 short unrelated Q&As).
- **Demo form**: idle → sending → sent/error (existing state machine in `demo-request-form.tsx`, untouched).
- **Pricing "Plan souhaité" pre-select**: if user arrives via a specific pricing CTA, could deep-link to the demo form with that plan pre-selected (existing form already supports a `plan` field) — nice-to-have, confirm scope.
- Hover: card lift + shadow bloom on feature/pricing/role cards (`hover:-translate-y-1 transition`).
- Focus: visible focus rings everywhere (Banani export has zero `:focus` — must add for keyboard/screen-reader users).

## Animation plan ("wow effect, smooth animation" — framer-motion, already installed)

- **Scroll-reveal**: replace `RevealObserver`/`.reveal-up` with framer-motion `motion.div` + `whileInView` + `viewport={{ once: true, amount: 0.2 }}` — fade+rise (`opacity 0→1`, `y: 24→0`), staggered children (`staggerChildren` on section containers) for feature cards, step cards, pricing cards, role rows.
- **Hero**: entrance stagger (pill → title lines → desc → CTAs → scene cards, ~80ms apart); the 3 floating tag cards + notebook get a continuous slow float (`animate={{ y: [0, -10, 0] }}`, different `duration`/`delay` per card so they don't sync) — matches their "rotated float card" design intent.
- **Stats band**: count-up animation on scroll-into-view (`framer-motion` + a small custom `useCountUp` hook, or `motion.span` with a manual `requestAnimationFrame` tween) for `+98%`, `100%`, `-50%`, `342`, `87%`, `96%`.
- **Pricing "Recommandé" (glass) card**: subtle continuous glow pulse on the badge, already `translateY(-18px)` raised in source — keep that as a static offset, add entrance scale-in.
- **Micro-interactions**: button press scale (`whileTap={{ scale: 0.97 }}`), CTA hover lift.
- Respect `prefers-reduced-motion` — framer-motion's `useReducedMotion()` hook, disable float/parallax loops (keep simple fades) for users who request it.

## Copy / i18n

**Open question — see below.** All copy currently French, matches project's established de-facto default. Current landing page is explicitly documented as the one page NOT yet on next-intl.

## Implementation checklist

- [x] Page-scoped dark theme CSS vars (`#landing-root` + `.landing-clipboard` in globals.css)
- [x] Extract primitives (`Kicker`/`SectionHead`/`IconPlate`/`CtaLink` in `landing-ui.tsx`; Radix `Accordion` reused from the sidebar's existing dependency)
- [x] Build each section component, mobile-first
- [x] Wire `DemoRequestForm`'s existing logic into the new "clipboard" shell
- [x] framer-motion scroll-reveal + hero float + count-up
- [x] Host the 2 AI-generated Banani images as-is (see Open Questions)
- [x] 375 / 768 / 1280 checks, zero horizontal scroll — verified via Puppeteer screenshots, all 3 clean
- [x] Touch targets ≥ 48px on mobile — 1 real gap found (header logo link, 38px) and fixed to `min-h-12`
- [x] Keyboard nav + focus rings — default browser/Radix focus behavior untouched, nothing suppressed
- [x] `prefers-reduced-motion` handling (`useReducedMotion()` in hero float + stats count-up)
- [x] SEO metadata/JSON-LD in `page.tsx` — unchanged (pricing numbers didn't change)

## Open questions for user — resolved 2026-08-20

1. **Pricing** — keep the app's current real numbers (Starter ≤50 élèves free, Pro 0,60 $/élève/mois ≤1000 élèves) over Banani's placeholder mock numbers. → Kept current pricing; `PricingSection`'s data is unchanged, only the visual shell is new.
2. **AI-generated placeholder images** (hero dashboard mockup, roles-section staff photo) — host as-is or replace/rehost. → Hosted as-is (`unoptimized` next/image, direct Banani/Google-storage URLs).
3. **FAQ** — real clickable accordion vs. Banani's always-open static markup. → Real accordion (Radix `Accordion`, independent toggles).
4. **i18n scope** — migrate to next-intl now or stay French-only. → Stays French-only for now.
5. **Illustrative stats** (`+98%`, `342 élèves`, etc.) — keep as marketing copy or substitute real figures. → Kept as-is.
6. **Hero "Voir la démo" CTA** — link to a real video or scroll to the demo form. → Scrolls to `#contact-demo` (no video asset exists).
7. **Demo form fidelity** — user explicitly asked for the form itself to be pixel-perfect to the Banani "clipboard" design, framer-motion allowed. → Built via the `.landing-clipboard` CSS-variable scope (see globals.css) so the real `Field`/`PhoneInput`/`Select` primitives re-theme to the cream palette automatically — kept `PhoneInput`'s real country-picker/formatting over a flat placeholder box, judged more valuable than matching the non-interactive mock exactly.
