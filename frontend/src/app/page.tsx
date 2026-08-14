import type { Metadata } from 'next';
import { LandingHeader } from '@/components/landing/landing-header';
import { HeroSection } from '@/components/landing/hero-section';
import { StatsSection } from '@/components/landing/stats-section';
import { PillarsSection } from '@/components/landing/pillars-section';
import { AiSection } from '@/components/landing/ai-section';
import { RolePortalsSection } from '@/components/landing/role-portals-section';
import { HowItWorksSection } from '@/components/landing/how-it-works-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { DemoRequestSection } from '@/components/landing/demo-request-section';
import { FaqSection } from '@/components/landing/faq-section';
import { LandingFooter } from '@/components/landing/landing-footer';
import { RevealObserver } from '@/components/landing/reveal-observer';

export const metadata: Metadata = {
  title: 'Schoolgesti — La plateforme tout-en-un de gestion scolaire',
  description:
    'Solution nativement mobile et offline-first intégrant SIS, LMS et Finance pour une école sans limites de connectivité.',
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
          <AiSection />
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
