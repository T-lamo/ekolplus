import type { Metadata } from 'next';
import { LandingHeader } from '@/components/landing/landing-header';
import { HeroSection } from '@/components/landing/hero-section';
import { StatsBand } from '@/components/landing/stats-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { RolesSection } from '@/components/landing/roles-section';
import { StepsSection } from '@/components/landing/steps-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { DemoRequestSection } from '@/components/landing/demo-request-section';
import { FaqSection } from '@/components/landing/faq-section';
import { FAQS } from '@/components/landing/faq-data';
import { LandingFooter } from '@/components/landing/landing-footer';
import { resolvePrintBaseUrl } from '@/lib/server/bulletin-pdf/print-base-url';

const TITLE = 'Schoolgesti, le système d’information scolaire (SIS) tout-en-un';
const DESCRIPTION =
  'Dossiers élèves, inscriptions, notes et bulletins officiels, présences, emploi du temps, frais de scolarité et paiements : le SIS qui centralise l’administratif de votre école.';
const OG_IMAGE = { url: '/images/hero-dashboard.jpg', width: 512, height: 286 };

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'gestion scolaire',
    'logiciel école',
    'SIS',
    'système d’information scolaire',
    'bulletin scolaire',
    'gestion des notes',
    'frais de scolarité',
    'école Haïti',
  ],
  // Public marketing page — the root layout defaults every other route to
  // noindex (auth flows with tokens, the authenticated app, back-office);
  // this is the one page that opts back in.
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: '/',
    siteName: 'Schoolgesti',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

// SoftwareApplication structured data (Google rich results) — mirrors the
// real plans in PricingSection; Enterprise is excluded, its price is "sur
// mesure" (custom quote), not a fixed value structured data can express.
const SOFTWARE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Schoolgesti',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  description: DESCRIPTION,
  offers: [
    {
      '@type': 'Offer',
      name: 'Starter',
      price: '0',
      priceCurrency: 'USD',
      description: "Gratuit jusqu'à 50 élèves.",
    },
    {
      '@type': 'Offer',
      name: 'Établissement Pro',
      price: '0.60',
      priceCurrency: 'USD',
      description: "À partir de 0,60 $ par élève et par mois, jusqu'à 1000 élèves.",
    },
  ],
};

// Organization structured data — brand identity for Google's Knowledge
// Panel / sitelinks; no `sameAs` yet since the footer carries no social
// links to point at (add them here the day it does, not before).
const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Schoolgesti',
  url: resolvePrintBaseUrl(),
  // Not the "-blanc" (white) variant used elsewhere on this dark page —
  // Google renders this logo on a plain white background (Knowledge Panel,
  // rich results), where a white-on-transparent mark would be invisible.
  logo: `${resolvePrintBaseUrl()}/logos/schoolgesti-lockup.svg`,
};

// FAQPage structured data — Google can render these as an expandable rich
// snippet directly in search results. Built from the SAME `FAQS` array the
// visible accordion renders (imported, not duplicated) so the structured
// data can never drift from what a visitor actually sees — a mismatch
// between the two is a Google Search Console violation, not just untidy.
const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

/**
 * Public marketing landing (route `/`). Rebuilt pixel-perfect from the
 * Banani "Lavande Douce" export (.planning/banani/landing-page.md) — a
 * self-contained DARK theme distinct from the app's own light shell,
 * scoped entirely via `#landing-root` in globals.css so it renders
 * identically regardless of the app's theme. One component per section
 * under `components/landing/`; scroll-reveal + micro-interactions are
 * framer-motion (see landing-motion.ts), not the old IntersectionObserver
 * `.reveal-up` class.
 */
export default function LandingPage() {
  return (
    <div
      id="landing-root"
      className="min-h-screen overflow-x-hidden bg-background text-foreground antialiased"
    >
      {/* Static, hardcoded objects above — never user/DB input — but escape
          `<` anyway so a stray "</script>" can never break out of the tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(SOFTWARE_JSON_LD).replace(/</g, '\\u003c'),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(ORGANIZATION_JSON_LD).replace(/</g, '\\u003c'),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD).replace(/</g, '\\u003c') }}
      />
      <LandingHeader />
      <main>
        <HeroSection />
        <StatsBand />
        <FeaturesSection />
        <RolesSection />
        <StepsSection />
        <PricingSection />
        <DemoRequestSection />
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
