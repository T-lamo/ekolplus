import type { Metadata } from 'next';
import { LandingHeader } from '@/components/landing/landing-header';
import { HeroSection } from '@/components/landing/hero-section';
import { StatsBand } from '@/components/landing/stats-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { SplitFeatureSection } from '@/components/landing/split-feature-section';
import { StepsSection } from '@/components/landing/steps-section';
import { RolesSection } from '@/components/landing/roles-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { FaqSection } from '@/components/landing/faq-section';
import { DemoRequestSection } from '@/components/landing/demo-request-section';
import { FAQS } from '@/components/landing/faq-data';
import { LandingFooter } from '@/components/landing/landing-footer';
import { resolvePrintBaseUrl } from '@/lib/server/bulletin-pdf/print-base-url';

const TITLE = 'Schoolgesti, le système d’information scolaire (SIS) tout-en-un';
const DESCRIPTION =
  'SchoolGesti est le logiciel de gestion scolaire tout-en-un pour les écoles en Haïti, en Afrique francophone et en Europe : dossiers élèves, inscriptions, notes et bulletins officiels, présences, emploi du temps, frais de scolarité et paiements centralisés dans un seul système d’information scolaire (SIS).';
const OG_IMAGE = { url: '/images/hero-dashboard.jpg', width: 512, height: 286 };

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'gestion scolaire',
    'logiciel école',
    'logiciel de gestion scolaire',
    'SIS',
    'système d’information scolaire',
    'bulletin scolaire',
    'gestion des notes',
    'frais de scolarité',
    'école Haïti',
    'Afrique francophone',
    'gestion scolaire Afrique',
    'logiciel gestion scolaire Europe',
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
// real plans in PricingSection (names from the v2 landing: Gratuit / Pro;
// Grande École is excluded, its price is "sur devis", not a fixed value
// structured data can express).
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
      name: 'Gratuit',
      price: '0',
      priceCurrency: 'USD',
      description: "Gratuit jusqu'à 50 élèves.",
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '0.40',
      priceCurrency: 'USD',
      description: "À partir de 0,40 $ par élève et par mois, jusqu'à 1000 élèves.",
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
  // Not the "-blanc" (white) variant used on this page's dark surfaces —
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
 * Banani "Electric Blue" export (.planning/banani/landing-page-v2.md) — a
 * self-contained LIGHT theme distinct from the app shell, scoped entirely
 * via `#landing-root` in globals.css so it renders identically regardless
 * of the viewer's saved app theme. One component per section under
 * `components/landing/`; every scroll-reveal/float/count-up is
 * framer-motion (landing-motion.ts) — the Banani export ships zero motion.
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
        <SplitFeatureSection
          id="attendance"
          tinted
          kicker="Module présence"
          title={
            <>
              Zéro feuille papier.
              <br />
              100% de traçabilité.
            </>
          }
          text="Les enseignants confirment les présences depuis leur téléphone. Les absences remontent immédiatement dans le dossier élève et dans les rapports de suivi."
          checks={[
            'Saisie depuis mobile, tablette ou ordinateur',
            'Historique complet par élève, classe et période',
            "Rapports d'absentéisme exportables",
            'Lecture simple pour la direction, les enseignants et le secrétariat',
          ]}
          illustration="/illustrations/confirmed-attendance.svg"
          illustrationAlt="Illustration émargement mobile"
          badge={{
            title: 'Présences confirmées',
            big: '97 / 100',
            small: 'Terminale A · en temps réel',
          }}
        />
        <SplitFeatureSection
          id="finance"
          reverse
          kicker="Facturation & paie"
          title={
            <>
              Suivez les frais de scolarité
              <br />
              avec clarté.
            </>
          }
          text="SchoolGesti structure vos échéances, vos paiements et vos relances pour donner à l'équipe comptable une vue précise de l'avancement de chaque classe."
          checks={[
            'Paiement via Cash, MonCash, Natcash, chèque ou virement',
            'Reçus PDF générés après chaque enregistrement',
            'KPI financiers en pourcentage pour une lecture immédiate',
            'Relances groupées et suivi des impayés par classe',
          ]}
          illustration="/illustrations/printing-invoices.svg"
          illustrationAlt="Illustration facturation et paie"
          badge={{ title: 'Recouvrement ce mois', big: '84%', small: '+12% vs mois dernier' }}
        />
        <StepsSection />
        <RolesSection />
        <PricingSection />
        <FaqSection />
        <DemoRequestSection />
      </main>
      <LandingFooter />
    </div>
  );
}
