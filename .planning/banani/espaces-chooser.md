# Choisissez votre espace (/espaces) — Banani → Next.js 16 + Tailwind v4

## Source
- Banani screen ID: RN-0ALLrSJKc (« Space Selector », flow 2oB_n5kLBeuy)
- Fetched: 2026-09-02
- Replaces the v1 page shipped by the multi-espaces plan (develop 186d779) — same file, same behavior, new visuals.

## Structure map
- **Background**: 3 blurred blobs (blur 120px, opacity .10/.05), absolute, pointer-events-none.
- **Header** (centered column, gap 16): logo, user chip (avatar + 2 lines, pill card), title 36/800/-0.8px, subtitle 15px muted max-w 520.
- **Cards grid**: design shows 4 columns × 4 cards (Administration / Enseignant / Parent / Élève). App has at most 3 spaces; grid renders only the account's available spaces.
- **Card**: white, border, radius 20, pad 32/24/24, top hairline pill (3px, inset 24px), 56px icon tile (radius 16, `secondary` bg), optional « Accès principal » badge, title 17/700, desc 13 muted, 3 tag pills (11px + 10px icon), CTA 44px « Entrer dans cet espace » + arrow, giant watermark icon bottom-right (100px, opacity .05).
- **Footer**: « Pas le bon compte ? · Se déconnecter · Aide & support · © {year} SchoolGesti ».

## Deliberate deviations (project rules > Banani output)
1. **4 cards → max 3**: « Espace parent » card dropped — the app has 3 spaces (school/teacher/student); `/eleve` serves élève ET parent. Grid: 1 col base, `sm:grid-cols-2`, `lg:grid-cols-3`.
2. **Logo**: real `/logos/schoolgesti-lockup.svg` instead of the fake « SG » gradient mark (brand rule).
3. **Colors**: all tokens — primary/secondary/muted/border/card; per-card icon hues map to the untherned status tokens (school → `primary`, teacher → `info-foreground`, student → `warning-foreground`); blobs → primary ×2 + `success-foreground`. The design's per-button opacity ladder (1/.92/.84/.76 — a Banani per-card-color artifact) is normalized to plain `bg-primary` on every CTA.
4. **User chip**: avatar via the shared `Avatar` component (no external avatar URL); line 2 = the user's email (the design's « Connectée · <école> » needs a gendered adjective + a school-name fetch that fails for non-school accounts).
5. **Badge « Accès principal »** = the `?pref=` card (replaces v1's ring accent); featured shadow on that card too.
6. **Tags advertise only real features**: school = Élèves/Paiements/Bulletins (design said « Rapports »), teacher = Notes/Emploi du temps/Présences, student = Mes notes/Bulletins/Présences (design's « Devoirs » doesn't exist in SchoolGesti).
7. **Copy via i18n** (`Spaces` namespace, fr/en/ht): updated `chooser.subtitle`, `chooser.enter` (« Entrer dans cet espace »), `cards.*.subtitle`; new keys `chooser.preferredBadge`, `cards.*.tags.{one,two,three}`, `footer.{wrongAccount,logout,help,copyright}`. No em dashes; typographic apostrophes.
8. **Behavior unchanged**: Suspense + useSearchParams, unauth → /login, 0/1 space → redirect, pref ordering. Footer « Se déconnecter » wires `useAuth().logout()` → /login; « Aide & support » → `/#contact`.

## Token mapping (Banani → project)
| Banani | Project |
| `--primary #6C63FF` | `primary` |
| `--secondary #EEF0FF` | `secondary` |
| `--muted/-foreground` | `muted` / `muted-foreground` |
| `--card/--border/--background` | `card` / `border` / `background` |
| icon blue `#3B82F6` | `info-foreground` |
| icon amber `#F59E0B` | `warning-foreground` |
| blob green `#34D399` | `success-foreground` |
| radius 20px card | `rounded-[20px]` |
| radius 16px tile | `rounded-2xl` |
| btn 44px | `h-11 min-h-12` → `min-h-12` (touch floor 48px wins over the 44px comp) |

## Responsive plan (design is desktop-only, 1080px)
- **Base 375px**: single column; title 26px; chip and footer wrap; blobs scaled via fixed sizes (overflow hidden on the bg layer); px-4 py-10.
- **sm 640px**: 2-column grid.
- **lg 1024px**: 3-column grid, title 36px, container max-w 1080px, gaps 48px as comp.

## Interactions / state
- Whole card not clickable (design marks the CTA as the button) — CTA `<button>` navigates; focus ring on CTA; loading skeleton unchanged; watermark + blobs `aria-hidden`.

## Copy / i18n
- All strings through `useTranslations('Spaces')`; keys above added to fr/en/ht (parity enforced by locales.test.ts).

## Implementation checklist
- [x] Rewrite `frontend/src/app/espaces/page.tsx`
- [x] Update `frontend/src/messages/{fr,en,ht}/spaces.json`
- [x] `pnpm --filter frontend exec vitest run src/lib/locales.test.ts` + `pnpm typecheck && pnpm lint`
- [x] 375 / 768 / 1280 screenshots via dev server (puppeteer, authenticated)
- [x] Commit `feat(banani): espaces-chooser — pixel parity`

## Open questions for user
- Assumptions 1-6 above are flagged for veto in the chat report (parent card dropped, tags content, logo/avatar/email substitutions, uniform CTA color).
