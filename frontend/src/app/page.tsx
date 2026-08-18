import type { Metadata } from 'next';
import { LandingHeader } from '@/components/landing/landing-header';
import { HeroSection } from '@/components/landing/hero-section';
import { StatsSection } from '@/components/landing/stats-section';
import { PillarsSection } from '@/components/landing/pillars-section';
import { RolePortalsSection } from '@/components/landing/role-portals-section';
import { HowItWorksSection } from '@/components/landing/how-it-works-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { DemoRequestSection } from '@/components/landing/demo-request-section';
import { FaqSection } from '@/components/landing/faq-section';
import { LandingFooter } from '@/components/landing/landing-footer';
import { RevealObserver } from '@/components/landing/reveal-observer';

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
const JSON_LD = {
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

/**
 * Public marketing landing (route `/`). Built modularly — one component per
 * section under `components/landing/`. Self-contained light theme (explicit
 * violet/slate/white via stock Tailwind utilities), lucide icons — renders
 * identically regardless of the app's own dark-sidebar tokens. Inter comes
 * from the root layout (already global), no separate font load here.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-slate-800 antialiased">
      {/* Static, hardcoded object above — never user/DB input — but escape
          `<` anyway so a stray "</script>" can never break out of the tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c') }}
      />
      <RevealObserver />
      <LandingHeader />
      <main className="pt-20">
        <div className="reveal-up">
          <HeroSection />
        </div>
        <div className="reveal-up">
          <StatsSection />
        </div>
        <div className="reveal-up">
          <PillarsSection />
        </div>
        <div className="reveal-up">
          <RolePortalsSection />
        </div>
        <div className="reveal-up">
          <HowItWorksSection />
        </div>
        <div className="reveal-up">
          <PricingSection />
        </div>
        <div className="reveal-up">
          <DemoRequestSection />
        </div>
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
